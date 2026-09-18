#!/usr/bin/env python3
"""
Minimal direct Google Search Console authorisation (read-only) for gptbot.uz.

Use this only when the OpenSEO MCP route is not enough (e.g. to list all
properties with sites.list, or to read sitemaps.list). It runs a local OAuth
flow with the single scope `webmasters.readonly`, stores the refresh token in
~/.config/gptbot-gsc/token.json (outside the repository) and never prints it.

Prerequisites (one-time, by the owner):
  1. Google Cloud project with "Google Search Console API" enabled.
  2. OAuth client of type "Desktop app"; download client_secret.json.
  3. pip install google-auth google-auth-oauthlib google-api-python-client

Run (opens a browser; the owner must approve):
  python gsc_direct_auth.py --client-secret C:/path/client_secret.json --list-sites

Then:
  python gsc_direct_auth.py --list-sitemaps sc-domain:gptbot.uz
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
TOKEN_PATH = Path(os.environ.get("USERPROFILE", os.path.expanduser("~"))) / ".config" / "gptbot-gsc" / "token.json"


def credentials(client_secret: str | None):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        if not client_secret:
            raise SystemExit("no stored token; pass --client-secret <client_secret.json> for the first run")
        flow = InstalledAppFlow.from_client_secrets_file(client_secret, SCOPES)
        creds = flow.run_local_server(port=0, prompt="consent")
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
        print(f"token stored at {TOKEN_PATH} (not printed)")
    return creds


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--client-secret", help="path to OAuth client_secret.json (first run only)")
    ap.add_argument("--list-sites", action="store_true", help="print all Search Console properties and permission level")
    ap.add_argument("--list-sitemaps", metavar="SITE_URL", help="print submitted sitemaps for a property, e.g. sc-domain:gptbot.uz")
    ns = ap.parse_args()

    from googleapiclient.discovery import build

    svc = build("searchconsole", "v1", credentials=credentials(ns.client_secret), cache_discovery=False)
    if ns.list_sites:
        sites = svc.sites().list().execute().get("siteEntry", [])
        for s in sorted(sites, key=lambda x: x["siteUrl"]):
            print(f"{s['permissionLevel']:22s} {s['siteUrl']}")
        if not sites:
            print("no properties visible to this Google account")
    if ns.list_sitemaps:
        sm = svc.sitemaps().list(siteUrl=ns.list_sitemaps).execute().get("sitemap", [])
        print(json.dumps(sm, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
