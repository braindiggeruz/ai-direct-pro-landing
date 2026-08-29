"""Read-only benchmark, NOT a production crawler service.

Only curated public URLs from sites.json; no accounts, cookies, proxies, LLM,
Telegram or Firecrawl. Redirects are inspected, TLS verification stays enabled.
Production requires OS isolation, pinned egress DNS and streamed resource limits;
this bounded benchmark must not be exposed as an arbitrary-URL endpoint.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib.metadata
import ipaddress
import json
import logging
from pathlib import Path
import socket
import time
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parent
UA = "GPTBot-Lead-Radar/1.1 (+https://gptbot.uz; contact: info@gptbot.uz)"
MAX_BYTES = 900_000


class PolicyError(Exception):
    pass


def public_url(url: str, original: str) -> str:
    value, seed = urlsplit(url), urlsplit(original)
    if value.scheme not in ("http", "https") or not value.hostname or value.username or value.password or value.query:
        raise PolicyError("unsafe_url")
    if value.port not in (None, 80, 443) or value.hostname.removeprefix("www.") != seed.hostname.removeprefix("www."):
        raise PolicyError("unapproved_redirect")
    addresses = socket.getaddrinfo(value.hostname, value.port or (443 if value.scheme == "https" else 80), type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise PolicyError("nonpublic_address")
    if seed.scheme == "https" and value.scheme != "https":
        raise PolicyError("tls_downgrade")
    return url


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check_robots(url: str) -> None:
    parsed = urlsplit(url)
    robots = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    opener = build_opener(ProxyHandler({}), NoRedirect())
    for _ in range(3):
        public_url(robots, url)
        try:
            with opener.open(Request(robots, headers={"User-Agent": UA}), timeout=12) as response:
                body = response.read(100_001)
                if len(body) > 100_000:
                    raise PolicyError("robots_too_large")
                policy = RobotFileParser()
                policy.parse(body.decode("utf-8", errors="replace").splitlines())
                if not policy.can_fetch(UA, url):
                    raise PolicyError("robots_disallow")
                delay = policy.crawl_delay(UA)
                if delay and delay > 5:
                    raise PolicyError("robots_delay_exceeds_smoke_budget")
                if delay:
                    time.sleep(delay)
                return
        except HTTPError as error:
            if error.code in (404, 410):
                return
            if error.code in (301, 302, 303, 307, 308):
                robots = urljoin(robots, error.headers.get("Location", ""))
                continue
            raise PolicyError(f"robots_http_{error.code}") from None
    raise PolicyError("robots_redirect_limit")


async def fetch_page(engine: str, url: str) -> tuple[int, str, dict]:
    if engine == "scrapling":
        from scrapling.fetchers import Fetcher
        response = await asyncio.to_thread(Fetcher.get, url, headers={"User-Agent": UA}, timeout=18,
                                         follow_redirects=False, retries=1, verify=True, stealthy_headers=False)
        return response.status, response.html_content, dict(response.headers)
    from crawl4ai import HTTPCrawlerConfig, CrawlerRunConfig
    from crawl4ai.async_crawler_strategy import AsyncHTTPCrawlerStrategy
    config = HTTPCrawlerConfig(headers={"User-Agent": UA}, follow_redirects=False, verify_ssl=True)
    async with AsyncHTTPCrawlerStrategy(browser_config=config) as crawler:
        response = await asyncio.wait_for(crawler.crawl(url, config=CrawlerRunConfig(page_timeout=18000)), timeout=22)
        return response.status_code, response.html, dict(response.response_headers)


async def run_one(engine: str, site: dict, output: Path) -> dict:
    started = time.monotonic()
    result = {"id": site["id"], "niche": site["niche"], "url": site["url"], "engine": engine, "mode": "http"}
    url = site["url"]
    try:
        for _ in range(3):
            await asyncio.to_thread(public_url, url, site["url"])
            await asyncio.to_thread(check_robots, url)
            status, html, headers = await fetch_page(engine, url)
            if status in (301, 302, 303, 307, 308):
                location = next((v for k, v in headers.items() if k.lower() == "location"), "")
                if not location:
                    raise PolicyError("redirect_without_location")
                url = urljoin(url, location)
                continue
            result.update(status=status, final_url=url)
            if status != 200:
                raise PolicyError(f"http_{status}")
            raw = html.encode("utf-8")
            if len(raw) > MAX_BYTES:
                raise PolicyError("page_too_large")
            artifact = output / f"{site['id']}.html"
            artifact.write_bytes(raw)
            result.update(ok=True, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), html_file=artifact.name)
            break
        else:
            raise PolicyError("redirect_limit")
    except Exception as error:
        # Error messages can contain upstream HTML; retain only controlled codes.
        result.update(ok=False, error=str(error) if isinstance(error, PolicyError) else type(error).__name__)
    result["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    print(json.dumps({k: v for k, v in result.items() if k not in ("url", "final_url", "sha256")}), flush=True)
    return result


async def main() -> None:
    args = argparse.ArgumentParser()
    args.add_argument("--engine", required=True, choices=("scrapling", "crawl4ai"))
    args.add_argument("--limit", type=int, default=15)
    options = args.parse_args()
    if not 1 <= options.limit <= 15:
        raise SystemExit("Limit must be 1..15")
    logging.disable(logging.CRITICAL)
    manifest = json.loads((ROOT / "sites.json").read_text(encoding="utf-8"))
    output = ROOT.parent / "results" / options.engine
    output.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(3)

    async def bounded(site):
        async with semaphore:
            return await run_one(options.engine, site, output)

    results = await asyncio.gather(*(bounded(site) for site in manifest["sites"][:options.limit]))
    report = {"engine": options.engine, "version": importlib.metadata.version(options.engine),
              "mode": "http_one_page_smoke", "paid_api_calls": 0, "telegram_calls": 0,
              "production_writes": 0, "results": results}
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
