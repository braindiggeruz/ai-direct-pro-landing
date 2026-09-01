"""Bounded website collection followed by the isolated canonical TS extractor."""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
import uuid
from dataclasses import replace
from datetime import datetime, timezone
from importlib.metadata import version
from urllib.parse import unquote, urljoin, urlsplit

from protego import Protego
from scrapling import Selector
from lxml.etree import LxmlError

from .extractor import EXTRACTOR, SCHEMA, ExtractorError, NodeExtractor, validate_claim_identity, validate_compact_result
from .state import StateStore
from .transport import FetchError, Policy, SafeTransport, normalize_url, origin, retry_after_deadline

_CONTACT_HINT = re.compile(r"contact|kontak|aloqa|связ|контакт|обратн", re.I)
_REASONS = {
    "cross_origin_url": "invalid_url", "invalid_job": "invalid_response", "dns_invalid": "invalid_url",
    "headers_too_large": "invalid_response", "ambiguous_headers": "invalid_response",
    "invalid_compression": "invalid_response", "incomplete_body": "invalid_response",
    "unsupported_content_encoding": "invalid_response", "decoded_body_too_large": "body_too_large",
    "redirect_without_location": "invalid_response", "too_many_redirects": "invalid_response",
    "fetch_timeout": "source_timeout", "transport_error": "fetch_error",
    "dns_busy": "source_unavailable", "dns_timeout": "source_timeout", "dns_unavailable": "source_unavailable",
}


def iso_time(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_time(value: str) -> float:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("timezone_required")
    return result.timestamp()


def contact_links(html: str, page_url: str, allowed_origin: str, limit: int = 4) -> list[str]:
    """Scrapling parses fetched HTML only: no network, JS, adaptive guesses or LLM."""
    selector = Selector(content=html, url=page_url, huge_tree=False, adaptive=False)
    result = []
    for link in selector.css("a[href]"):
        href = link.attrib.get("href", "")
        if not _CONTACT_HINT.search(unquote(href) + " " + link.get_all_text()):
            continue
        try:
            url = normalize_url(urljoin(page_url, href))
        except FetchError:
            continue
        if origin(url) != allowed_origin or urlsplit(url).query or url in result or url == page_url:
            continue
        result.append(url)
        if len(result) >= limit:
            break
    return result


class Deferred(Exception):
    def __init__(self, reason: str, retry_at: float):
        self.reason, self.retry_at = reason, retry_at


class Collector:
    def __init__(self, store: StateStore, transport: SafeTransport | None = None,
                 *, clock=time.time, wait=time.sleep, minimum_delay: float = 1.0, extractor=None):
        if version("scrapling") != "0.4.15":
            raise ValueError("unsupported_scrapling_version")
        self.store = store
        self.transport = transport or SafeTransport()
        self.clock, self.wait = clock, wait
        self.minimum_delay = max(0.25, minimum_delay)
        self.extractor = extractor if extractor is not None else NodeExtractor.from_environment()

    def _pace(self, site: str, deadline: float, heartbeat=lambda: None) -> None:
        ready_at, reason = self.store.cooldown(site)
        remaining = ready_at - self.clock()
        if remaining <= 0:
            return
        # Only our own inter-request / robots pacing can wait within this job.
        # A remote Retry-After or unavailable-source deadline is never shortened
        # or held in a busy worker just because it happens to fit this lease.
        if reason not in ("pacing", "robots_pacing") or ready_at >= deadline:
            raise Deferred("host_cooldown", ready_at)
        while self.clock() < ready_at:
            heartbeat()
            self.wait(min(10.0, ready_at - self.clock()))
            if self.clock() >= deadline:
                raise Deferred("host_cooldown", ready_at)
        heartbeat()

    def _get(self, url: str, site: str, deadline: float, delay: float, robots: Protego | None = None,
             heartbeat=lambda: None):
        self._pace(site, deadline, heartbeat)
        if self.clock() >= deadline:
            raise FetchError("deadline_exceeded")
        # Every request has the smaller of the per-page and remaining job budgets.
        previous = self.transport.policy
        self.transport.policy = replace(previous, timeout_seconds=min(previous.timeout_seconds,
                                                                       deadline - self.clock()))
        try:
            response = self.transport.get(url, site, url_guard=(lambda u: robots.can_fetch(u, previous.user_agent))
                                          if robots else None,
                                          before_request=lambda u: self._pace(site, deadline, heartbeat),
                                          after_response=lambda r: self.store.postpone(site, self.clock() + delay, "pacing"),
                                          max_total_seconds=deadline - self.clock())
        except FetchError as exc:
            if exc.code in ("dns_busy", "dns_timeout", "dns_unavailable", "fetch_timeout", "transport_error"):
                retry_at = self.store.postpone(site, self.clock() + 60, "source_unavailable")
                raise Deferred("source_timeout" if "timeout" in exc.code else "source_unavailable", retry_at) from None
            raise
        finally:
            self.transport.policy = previous
            self.store.postpone(site, self.clock() + delay, "pacing")
        if response.status == 429 or response.status >= 500:
            retry_at = retry_after_deadline(response.headers.get("retry-after"), self.clock())
            retry_at = self.store.postpone(site, retry_at if retry_at is not None else self.clock() + 60,
                                           "source_rate_limited" if response.status == 429 else "source_unavailable")
            raise Deferred("source_rate_limited" if response.status == 429 else "source_unavailable", retry_at)
        return response

    def _robots(self, site: str, deadline: float, heartbeat=lambda: None) -> tuple[Protego, float]:
        text = self.store.robots(site, self.clock())
        fetched_now = text is None
        if text is None:
            try:
                response = self._get(site + "/robots.txt", site, deadline, self.minimum_delay, heartbeat=heartbeat)
            except FetchError as exc:
                if exc.code in ("invalid_url", "cross_origin_url", "non_public_address", "tls_error"):
                    raise
                retry_at = self.store.postpone(site, self.clock() + 60, "robots_unavailable")
                raise Deferred("robots_unavailable", retry_at) from None
            if response.status in (404, 410):
                text = ""  # explicit absence, unlike errors or access refusal
            elif response.status in (401, 403):
                raise FetchError("robots_disallowed")
            elif response.status != 200 or "<html" in response.body[:512].decode("utf-8", "ignore").lower():
                retry_at = self.store.postpone(site, self.clock() + 60, "robots_unavailable")
                raise Deferred("robots_unavailable", retry_at)
            else:
                text = response.body.decode("utf-8", "replace")
            self.store.save_robots(site, text, self.clock() + 6 * 3600)
        rules = Protego.parse(text)
        delay = rules.crawl_delay(self.transport.policy.user_agent) or 0
        if not math.isfinite(delay) or delay < 0:
            raise FetchError("robots_disallowed")
        if fetched_now:
            self.store.postpone(site, self.clock() + max(self.minimum_delay, delay), "robots_pacing")
        return rules, max(self.minimum_delay, delay)

    def collect(self, job: dict, *, receipt_id: str | None = None, heartbeat=lambda: None) -> dict:
        validate_claim_identity(job)  # reject identity corruption before any website request
        result = {"schema": SCHEMA, "jobId": job["id"], "leaseGeneration": job["leaseGeneration"],
                  "receiptId": receipt_id or str(uuid.uuid4()), "identityDigest": job["identityDigest"],
                  "status": "failed", "reason": "invalid_url", "pages": [], "retryAt": None, "resumeUrls": []}
        pages = result["pages"]
        pending: list[str] = []
        try:
            if job.get("schema") != SCHEMA:
                raise FetchError("invalid_url")
            root = normalize_url(job["url"])
            site = origin(root)
            limits = job.get("limits", {})
            max_pages = min(5, max(1, int(limits.get("maxPages", 5))))
            max_page_bytes = min(131_072, max(1, int(limits.get("maxPageBytes", 131_072))))
            max_total_bytes = min(524_288, max(1, int(limits.get("maxTotalBytes", 524_288))))
            deadline = min(self.clock() + 120, parse_time(job["deadlineAt"]), parse_time(job["leaseExpiresAt"]))
            self.transport.policy = replace(self.transport.policy, max_body_bytes=max_page_bytes,
                                            max_wire_bytes=max_page_bytes,
                                            max_redirects=min(3, max(0, int(limits.get("maxRedirects", 3)))))
            resume_urls = list(dict.fromkeys([normalize_url(u) for u in job.get("resumeUrls", [])]))
            if len(resume_urls) > 5 or any(origin(u) != site for u in resume_urls):
                raise FetchError("cross_origin_url")
            # A resumed attempt must include a newly fetched ownership anchor.
            # Never relabel checkpoint HTML with a fresh fetchedAt timestamp.
            all_pending = list(dict.fromkeys([root, *resume_urls]))
            omitted_urls = len(all_pending) > max_pages
            pending = all_pending[:max_pages]
            robots, delay = self._robots(site, deadline, heartbeat)
            visited: set[str] = set()
            accepted_urls: set[str] = set()
            total_bytes = 0
            had_error = False
            while pending and len(visited) < max_pages:
                heartbeat()
                url = pending[0]
                if url in visited:
                    pending.pop(0)
                    continue
                if not robots.can_fetch(url, self.transport.policy.user_agent):
                    if not pages:
                        raise FetchError("robots_disallowed")
                    pending.pop(0)
                    continue
                response = self._get(url, site, deadline, delay, robots, heartbeat)
                pending.pop(0)
                visited.add(url)
                if response.status != 200:
                    result["reason"] = "fetch_error"
                    had_error = True
                    continue
                content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if content_type not in ("text/html", "application/xhtml+xml"):
                    result["reason"] = "unsupported_content_type"
                    had_error = True
                    continue
                charset_match = re.search(r"charset\s*=\s*[\"']?([\w-]+)", response.headers.get("content-type", ""), re.I)
                charset = charset_match.group(1).lower() if charset_match else "utf-8"
                if charset not in ("utf-8", "utf8", "windows-1251", "cp1251", "windows-1252", "iso-8859-1", "ascii"):
                    charset = "utf-8"
                html = response.body.decode(charset, "replace")
                if (not html.strip() or "\x00" in html or not re.search(r"<[a-z][^>]*>", html, re.I)
                        or re.search(r"<title[^>]*>[^<]*(?:just a moment|access denied|attention required|captcha)", html, re.I)):
                    result["reason"] = "invalid_response"
                    had_error = True
                    continue
                if response.url in accepted_urls:
                    continue
                encoded = html.encode("utf-8")
                if len(encoded) > max_page_bytes or total_bytes + len(encoded) > max_total_bytes:
                    result["reason"] = "body_too_large"
                    had_error = True
                    continue
                total_bytes += len(encoded)
                accepted_urls.add(response.url)
                pages.append({"requestedUrl": url, "url": response.url, "html": html, "status": 200,
                              "fetchedAt": iso_time(self.clock()), "sha256": hashlib.sha256(encoded).hexdigest()})
                # HTML byte limits do not bound JSON escaping overhead. Reserve
                # space for final status, timestamps and up to five resume URLs.
                if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > 760_000:
                    pages.pop()
                    result["reason"] = "body_too_large"
                    had_error = True
                    break
                for link in contact_links(html, response.url, site):
                    if link not in pending and link not in visited and len(pending) < max_pages - len(pages):
                        pending.append(link)
            result["status"] = "completed" if pages and not pending and not had_error and not omitted_urls else "partial" if pages else "failed"
            result["reason"] = "ok" if result["status"] == "completed" else "page_limit" if pending or omitted_urls else result["reason"]
            # Terminal partial means this bounded crawl is finished. Only a
            # deferred envelope is eligible for the server's continuation queue.
            result["resumeUrls"] = []
        except Deferred as exc:
            result.update(status="deferred", reason=exc.reason,
                          retryAt=iso_time(exc.retry_at) if math.isfinite(exc.retry_at) else "9999-12-31T23:59:59.000Z",
                          resumeUrls=pending[:5])
        except (FetchError, ValueError, TypeError, KeyError, LxmlError) as exc:
            result.update(status="partial" if pages else "failed",
                          reason=_REASONS.get(exc.code, exc.code) if isinstance(exc, FetchError) else "invalid_response",
                          resumeUrls=[])
            if isinstance(exc, FetchError) and exc.code == "worker_unavailable":
                result.update(status="deferred", retryAt=iso_time(self.clock() + 30), resumeUrls=pending[:5])
        try:
            compact = self.extractor(job, result)
        except ExtractorError:
            # A bad page/helper output must not keep the oldest job cycling until
            # lease expiry. Report only failure metadata, never unparsed contacts.
            # Missing runtime configuration still fails before the job is claimed.
            compact = {**result, "pages": [], "extractorVersion": EXTRACTOR, "binding": None, "evidence": []}
            # Source cooldown is already trustworthy transport metadata. Keep it
            # even when HTML extraction fails, so another worker cannot shorten
            # Retry-After / robots pacing for this host on the shared server.
            if result["status"] != "deferred":
                compact.update(status="failed", reason="invalid_response", retryAt=None, resumeUrls=[])
        validate_compact_result(compact, job=job, raw=result)
        self.store.enqueue(compact["receiptId"], compact, self.clock())
        return compact
