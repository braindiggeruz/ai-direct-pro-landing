"""Owned loopback-only JS fixture. No external sites, credentials or messages."""
import argparse
import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
import time

HTML = b'''<!doctype html><html><head><title>Lead Radar synthetic fixture</title></head>
<body><main><h1>Fixture Dental</h1><p>Dental clinic services include consultation, preventive care,
restoration, orthodontics, diagnostics and scheduled appointments. The clinic publishes its own
business contacts for patients and explains how to request an appointment. This owned localhost
fixture contains enough realistic public text to avoid confusing a small business page with an
anti-bot interstitial while keeping all network activity on the loopback interface.</p><div id="app"></div></main><script>setTimeout(()=>{
document.getElementById('app').innerHTML='<h1>Fixture Dental</h1><p id="ready">+998901234567</p><a href="https://t.me/fixture_booking">Booking</a>';
const ld=document.createElement('script');ld.type='application/ld+json';
ld.textContent=JSON.stringify({'@type':'Dentist',name:'Fixture Dental',contactPoint:{contactType:'booking',telephone:'+998901234567'}});
document.head.appendChild(ld);},200);</script></body></html>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(HTML)))
        self.end_headers()
        self.wfile.write(HTML)

    def log_message(self, *args):
        pass


async def main(engine):
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/fixture"
    started = time.monotonic()
    try:
        if engine == "scrapling":
            from scrapling.fetchers import DynamicFetcher
            response = await asyncio.to_thread(DynamicFetcher.fetch, url, headless=True,
                                               wait_selector="#ready", timeout=12000, retries=1)
            html = response.html_content
        else:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
            browser = BrowserConfig(headless=True, ignore_https_errors=False, verbose=False)
            # Use the installed headless-shell, not a user's logged-in Chrome.
            browser.channel = browser.chrome_channel = ""
            async with AsyncWebCrawler(config=browser) as crawler:
                response = await crawler.arun(url, config=CrawlerRunConfig(wait_for="css:#ready",
                    page_timeout=12000, cache_mode=CacheMode.BYPASS, verbose=False))
                if not response.success:
                    detail = str(response.error_message or "unknown")[:240].replace("\n", " ")
                    raise RuntimeError(f"fixture_browser_failed:{detail}")
                html = response.html
        assert 'id="ready"' in html, "Rendered DOM was lost"
        assert 'type="application/ld+json"' in html, "Structured contacts were lost"
        output = Path(__file__).resolve().parent.parent / "results" / engine
        output.mkdir(parents=True, exist_ok=True)
        (output / "browser-fixture.html").write_text(html, encoding="utf-8")
        report = {"engine": engine, "js_dom": True, "json_ld": True, "external_requests": 0,
                  "elapsed_ms": round((time.monotonic()-started)*1000)}
        (output / "browser-fixture.json").write_text(json.dumps(report), encoding="utf-8")
        print(json.dumps(report), flush=True)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=("scrapling", "crawl4ai"), required=True)
    asyncio.run(main(parser.parse_args().engine))
