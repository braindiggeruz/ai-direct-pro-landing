#!/usr/bin/env python3
"""
Read-only Google Search Console extraction for sc-domain:gptbot.uz.

Transport: the OpenSEO hosted MCP server (https://app.openseo.so/mcp), which is
already authorised for this workspace and connected to the GSC property.
Only the `get_search_console_performance` tool is used (Search Analytics API,
read-only, no OpenSEO credits). The OAuth access token is read from the local
Claude Code credential store and is never printed or written anywhere.

Usage:
  python gsc_pull.py probe                 # find last final date, sanity check
  python gsc_pull.py pull [--end YYYY-MM-DD]   # full extraction into ../raw/

Raw outputs are immutable evidence: every dataset is written once as JSON
(with request metadata) and CSV. Re-running overwrites files from the same
day only; nothing is post-processed here.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

import requests

PROJECT_ID = "7534113b-f748-4f98-ac39-9e3782d3d9e7"  # OpenSEO project "GPTBot.uz"
MCP_URL = "https://app.openseo.so/mcp"
TOOL = "get_search_console_performance"
HERE = Path(__file__).resolve().parent
RAW = HERE.parent / "raw"
ROW_LIMIT = 1000
MAX_PAGES = 200  # hard stop: 200k rows per dataset


# --------------------------------------------------------------------------- auth
def load_token() -> str:
    cred_path = Path(os.environ.get("USERPROFILE", os.path.expanduser("~"))) / ".claude" / ".credentials.json"
    if not cred_path.exists():
        sys.exit("credential store not found; run the OpenSEO MCP once from Claude Code")
    data = json.loads(cred_path.read_text(encoding="utf-8"))
    for key, entry in (data.get("mcpOAuth") or {}).items():
        if key.startswith("openseo|") and entry.get("accessToken"):
            exp = entry.get("expiresAt")
            if exp and exp / 1000 < time.time():
                sys.exit("openseo access token expired; trigger any OpenSEO MCP call from Claude Code to refresh it, then re-run")
            return entry["accessToken"]
    sys.exit("no openseo OAuth entry in credential store")


# --------------------------------------------------------------------------- MCP client
class Mcp:
    def __init__(self) -> None:
        self.token = load_token()
        self.session_id: str | None = None
        self._id = 0
        self.s = requests.Session()
        self._initialize()

    def _headers(self) -> dict:
        h = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
        }
        if self.session_id:
            h["Mcp-Session-Id"] = self.session_id
        return h

    def _post(self, payload: dict) -> dict | None:
        for attempt in range(5):
            r = self.s.post(MCP_URL, headers=self._headers(), data=json.dumps(payload), timeout=120)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            if r.status_code == 401:
                sys.exit("401 from MCP server: token rejected/expired (refresh via Claude Code and re-run)")
            r.raise_for_status()
            sid = r.headers.get("Mcp-Session-Id") or r.headers.get("mcp-session-id")
            if sid:
                self.session_id = sid
            if r.status_code == 202 or not r.text.strip():
                return None
            ctype = r.headers.get("Content-Type", "")
            if "text/event-stream" in ctype:
                msg = None
                for line in r.text.splitlines():
                    if line.startswith("data:"):
                        try:
                            obj = json.loads(line[5:].strip())
                        except json.JSONDecodeError:
                            continue
                        if obj.get("id") == payload.get("id"):
                            msg = obj
                return msg
            return r.json()
        raise RuntimeError("MCP request failed after retries")

    def _next_id(self) -> int:
        self._id += 1
        return self._id

    def _initialize(self) -> None:
        res = self._post({
            "jsonrpc": "2.0", "id": self._next_id(), "method": "initialize",
            "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                       "clientInfo": {"name": "gptbot-gsc-audit", "version": "1.0"}},
        })
        if not res or "result" not in res:
            raise RuntimeError(f"initialize failed: {str(res)[:300]}")
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def call(self, name: str, arguments: dict) -> dict:
        res = self._post({"jsonrpc": "2.0", "id": self._next_id(), "method": "tools/call",
                          "params": {"name": name, "arguments": arguments}})
        if not res:
            raise RuntimeError("empty tools/call response")
        if "error" in res:
            raise RuntimeError(f"tool error: {json.dumps(res['error'])[:500]}")
        result = res["result"]
        if result.get("isError"):
            raise RuntimeError(f"tool isError: {json.dumps(result)[:500]}")
        if "structuredContent" in result and result["structuredContent"]:
            return result["structuredContent"]
        for c in result.get("content", []):
            if c.get("type") == "text":
                return json.loads(c["text"])
        raise RuntimeError(f"unexpected tool result: {json.dumps(result)[:500]}")


# --------------------------------------------------------------------------- extraction
def fetch_all(mcp: Mcp, dimensions: list[str], start: str, end: str, *, filters=None,
              data_state="final", search_type="web") -> dict:
    rows, start_row, page = [], 0, 0
    meta = None
    while True:
        args = {"projectId": PROJECT_ID, "dimensions": dimensions, "startDate": start, "endDate": end,
                "rowLimit": ROW_LIMIT, "startRow": start_row, "dataState": data_state, "type": search_type}
        if filters:
            args["filters"] = filters
        res = mcp.call(TOOL, args)
        if not res.get("ok", True):
            raise RuntimeError(f"tool returned ok=false: {json.dumps(res)[:400]}")
        if meta is None:
            meta = {k: res.get(k) for k in ("siteUrl", "startDate", "endDate", "dimensions")}
        batch = res.get("rows", [])
        rows.extend(batch)
        page += 1
        if not res.get("hasMore") or not batch or page >= MAX_PAGES:
            break
        start_row = res.get("nextStartRow", start_row + len(batch))
    return {"meta": meta, "rows": rows, "pages": page}


def write_dataset(name: str, dimensions: list[str], start: str, end: str, payload: dict, *,
                  filters=None, data_state="final", search_type="web") -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    rows = payload["rows"]
    out = {
        "dataset": name,
        "pulledAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "Google Search Console Search Analytics via OpenSEO MCP get_search_console_performance",
        "siteUrl": payload["meta"]["siteUrl"], "searchType": search_type, "dataState": data_state,
        "startDate": start, "endDate": end, "dimensions": dimensions, "filters": filters or [],
        "rowLimitPerCall": ROW_LIMIT, "callsMade": payload["pages"], "rowCount": len(rows),
        "rows": rows,
    }
    (RAW / f"{name}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    with (RAW / f"{name}.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(dimensions + ["clicks", "impressions", "ctr", "position"])
        for r in rows:
            w.writerow(list(r["keys"]) + [r.get("clicks"), r.get("impressions"), r.get("ctr"), r.get("position")])
    tot_c = sum(r.get("clicks", 0) for r in rows)
    tot_i = sum(r.get("impressions", 0) for r in rows)
    print(f"  {name:48s} rows={len(rows):6d} calls={payload['pages']:3d} clicks={tot_c:7d} impr={tot_i:9d}", flush=True)


def d(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def periods(end: dt.date) -> dict[str, tuple[str, str]]:
    """All windows end on `end` (last final day). Names are stable for downstream scripts."""
    p = {}
    p["last7"] = (end - dt.timedelta(days=6), end)
    p["last28"] = (end - dt.timedelta(days=27), end)
    p["prev28"] = (end - dt.timedelta(days=55), end - dt.timedelta(days=28))
    p["last90"] = (end - dt.timedelta(days=89), end)
    p["prev90"] = (end - dt.timedelta(days=179), end - dt.timedelta(days=90))
    p["last180"] = (end - dt.timedelta(days=179), end)
    p["yoy28"] = (end - dt.timedelta(days=27 + 364), end - dt.timedelta(days=364))
    p["all16m"] = (dt.date(end.year - 1, end.month, 1) - dt.timedelta(days=120), end)  # >16 months, API clamps
    return {k: (a.isoformat(), b.isoformat()) for k, (a, b) in p.items()}


def cmd_probe(_: argparse.Namespace) -> None:
    mcp = Mcp()
    res = mcp.call(TOOL, {"projectId": PROJECT_ID, "dimensions": ["date"], "dateRange": "last_16_months",
                          "dataState": "final", "rowLimit": 1000})
    rows = res["rows"]
    dates = sorted(r["keys"][0] for r in rows)
    print(json.dumps({"siteUrl": res["siteUrl"], "apiStart": res["startDate"], "apiEnd": res["endDate"],
                      "finalRows": len(rows), "firstFinalDate": dates[0], "lastFinalDate": dates[-1],
                      "totalClicks": sum(r["clicks"] for r in rows),
                      "totalImpressions": sum(r["impressions"] for r in rows)}, indent=1))
    res2 = mcp.call(TOOL, {"projectId": PROJECT_ID, "dimensions": ["date"], "dateRange": "last_7_days",
                           "dataState": "all", "rowLimit": 1000})
    print("dataState=all last rows:", [(r["keys"][0], r["clicks"], r["impressions"]) for r in res2["rows"][-4:]])


def cmd_pull(ns: argparse.Namespace) -> None:
    end = d(ns.end)
    P = periods(end)
    (RAW).mkdir(parents=True, exist_ok=True)
    (RAW / "PERIODS.json").write_text(json.dumps({"lastFinalDate": ns.end, "periods": P}, indent=1), encoding="utf-8")
    print("periods:", json.dumps(P))
    mcp = Mcp()

    def pull(name, dims, per, filters=None, data_state="final", search_type="web"):
        s, e = P[per]
        payload = fetch_all(mcp, dims, s, e, filters=filters, data_state=data_state, search_type=search_type)
        write_dataset(f"{name}__{per}", dims, s, e, payload, filters=filters, data_state=data_state, search_type=search_type)

    print("\n[1] daily series, full history")
    pull("date", ["date"], "all16m")
    pull("date_device", ["date", "device"], "all16m")
    pull("date_country", ["date", "country"], "all16m")

    print("\n[2] single-dimension slices per period")
    for per in ("last7", "last28", "prev28", "last90", "prev90", "last180", "yoy28", "all16m"):
        pull("query", ["query"], per)
        pull("page", ["page"], per)
        pull("device", ["device"], per)
        pull("country", ["country"], per)
        pull("searchAppearance", ["searchAppearance"], per)

    print("\n[3] query x page")
    for per in ("last28", "prev28", "last90", "prev90", "all16m"):
        pull("query_page", ["query", "page"], per)

    print("\n[4] query x device / query x country / page x device / page x country")
    for per in ("last28", "last90"):
        pull("query_device", ["query", "device"], per)
        pull("query_country", ["query", "country"], per)
        pull("page_device", ["page", "device"], per)
        pull("page_country", ["page", "country"], per)

    print("\n[5] time series by page (180d) and by query (90d)")
    pull("date_page", ["date", "page"], "last180")
    pull("date_query", ["date", "query"], "last90")

    print("\n[6] query x page x device (28d) for intent/device split")
    pull("query_page_device", ["query", "page", "device"], "last28")

    print("\n[7] other search types, 16m (sanity: image/video/discover/news)")
    for st in ("image", "video", "discover", "news"):
        try:
            pull(f"type_{st}_date", ["date"], "all16m", search_type=st)
        except Exception as exc:  # noqa: BLE001
            print(f"  type {st}: skipped ({str(exc)[:120]})")

    print("\ndone")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("probe").set_defaults(fn=cmd_probe)
    p = sub.add_parser("pull")
    p.add_argument("--end", required=True, help="last final date YYYY-MM-DD (from probe)")
    p.set_defaults(fn=cmd_pull)
    ns = ap.parse_args()
    ns.fn(ns)


if __name__ == "__main__":
    main()
