"""One explicitly invoked execution. No scheduler, service, Telegram or Bridge access."""

from __future__ import annotations

import json
import os
import re
import ssl
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, ProxyHandler, Request, build_opener

from .engine import SCHEMA, Collector
from .extractor import ExtractorError, validate_claim_identity, validate_compact_result
from .state import StateStore
from .transport import FetchError, normalize_url, retry_after_deadline

_TERMINAL_CONFLICTS = {"crawler_lease_lost", "crawler_identity_changed", "crawler_receipt_conflict"}


class ApiError(Exception):
    def __init__(self, status: int, code: str, retry_at: float | None = None):
        self.status, self.code, self.retry_at = status, code, retry_at
        super().__init__(code)


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ApiError(code, "api_redirect_refused")


class ApiClient:
    def __init__(self, base: str, token: str, *, clock=time.time):
        normalized = normalize_url(base)
        parts = urlsplit(normalized)
        if parts.scheme != "https" or parts.query or parts.path.rstrip("/") != "/api/lead-radar/crawler":
            raise ValueError("CRAWLER_API_BASE must be the exact HTTPS crawler endpoint")
        if not re.fullmatch(r"lrcr_[a-f0-9]{64}", token):
            raise ValueError("invalid dedicated CRAWLER_TOKEN")
        self.base, self.token, self.clock = normalized.rstrip("/"), token, clock
        self.opener = build_opener(ProxyHandler({}), _NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))

    @classmethod
    def from_environment(cls):
        # Only these two dedicated variables are read. No owner/Bridge fallback.
        return cls(os.environ.get("CRAWLER_API_BASE", ""), os.environ.get("CRAWLER_TOKEN", ""))

    def post(self, route: str, payload: dict) -> dict:
        if route not in ("claim", "heartbeat", "result"):
            raise ValueError("unsupported_control_route")
        if route == "result":
            validate_compact_result(payload)
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        if len(data) > 786_432:
            raise ApiError(0, "control_payload_too_large")
        request = Request(self.base + "/" + route, data=data, method="POST", headers={
            "Authorization": "Bearer " + self.token, "Content-Type": "application/json", "Accept": "application/json",
        })
        try:
            with self.opener.open(request, timeout=15) as response:
                raw = response.read(65_537)
                if len(raw) > 65_536:
                    raise ApiError(0, "control_response_too_large")
                body = json.loads(raw)
                if not isinstance(body, dict) or body.get("ok") is not True:
                    raise ApiError(0, "invalid_control_response")
                return body
        except HTTPError as exc:
            retry_at = retry_after_deadline(exc.headers.get("Retry-After"), self.clock())
            try:
                body = json.loads(exc.read(4096))
                error = body.get("error", {}) if isinstance(body, dict) else {}
                code = error.get("code", "api_error") if isinstance(error, dict) else str(error)
                if isinstance(body, dict) and isinstance(body.get("code"), str):
                    code = body["code"]
                if not isinstance(code, str) or len(code) > 100 or not code.replace("_", "").isalnum():
                    code = "api_error"
            except (ValueError, TypeError, TimeoutError, OSError):
                code = "api_error"
            finally:
                exc.close()
            raise ApiError(exc.code, code, retry_at) from None
        except (URLError, TimeoutError, OSError):
            raise ApiError(0, "control_unavailable") from None
        except (ValueError, UnicodeError):
            raise ApiError(0, "invalid_control_response") from None


def deliver_outbox(store: StateStore, api: ApiClient, *, clock=time.time) -> bool:
    """Only a matching explicit server ACK clears pending. Retries reuse exact receipt."""
    for item in store.pending(clock(), limit=10):
        receipt_id = item["receipt_id"]
        try:
            validate_compact_result(item["payload"])
        except ExtractorError:
            store.reject(receipt_id, "unsupported_result_protocol")
            continue
        try:
            response = api.post("result", item["payload"])
            if response.get("accepted") is not True or response.get("receiptId") != receipt_id:
                raise ApiError(0, "invalid_result_ack")
            store.acknowledge(receipt_id)
        except ApiError as exc:
            if exc.status == 409 and exc.code in _TERMINAL_CONFLICTS:
                store.reject(receipt_id, exc.code)
                continue
            if exc.status in (400, 413, 422) or exc.code == "control_payload_too_large":
                store.reject(receipt_id, "result_rejected")
                continue
            delay = min(900, 30 * (2 ** min(item["attempts"], 5)))
            store.retry(receipt_id, max(clock() + delay, exc.retry_at or 0), exc.code)
            return False
    return not store.has_pending()


def run_once(store: StateStore, api: ApiClient, collector: Collector | None = None, *, clock=time.time) -> str:
    owner = store.acquire_run(clock())
    if owner is None:
        return "worker_busy"
    try:
        store.maintenance(clock())
        return _run_once(store, api, collector, clock=clock)
    finally:
        store.release_run(owner)


def _run_once(store: StateStore, api: ApiClient, collector: Collector | None = None, *, clock=time.time) -> str:
    if not deliver_outbox(store, api, clock=clock):
        return "delivery_waiting"
    active_collector = collector if collector is not None else Collector(store)
    response = api.post("claim", {"schema": SCHEMA})
    job = response.get("job")
    if job is None:
        return "no_job"
    if not isinstance(job, dict) or job.get("schema") != SCHEMA:
        raise ApiError(0, "invalid_claim_response")
    try:
        validate_claim_identity(job)
    except ExtractorError:
        raise ApiError(0, "invalid_claim_response") from None
    required_strings = ("id", "orgId", "companyId", "identityDigest", "url", "deadlineAt", "leaseExpiresAt")
    if (any(not isinstance(job.get(k), str) or not job[k] or len(job[k]) > 2048 for k in required_strings)
            or type(job.get("leaseGeneration")) is not int or job["leaseGeneration"] < 1
            or not isinstance(job.get("limits", {}), dict)
            or not isinstance(job.get("resumeUrls", []), list)):
        raise ApiError(0, "invalid_claim_response")
    last_heartbeat = [clock()]

    def heartbeat():
        if clock() - last_heartbeat[0] < 30:
            return
        try:
            api.post("heartbeat", {"jobId": job["id"], "leaseGeneration": job["leaseGeneration"]})
        except ApiError as exc:
            raise FetchError("lease_lost" if exc.status == 409 else "worker_unavailable") from None
        last_heartbeat[0] = clock()

    result = active_collector.collect(job, heartbeat=heartbeat)
    delivered = deliver_outbox(store, api, clock=clock)
    receipt_state = store.receipt_state(result["receiptId"])
    # An empty pending queue can mean quarantine, not server acceptance. Only
    # this exact immutable receipt's durable ACK permits a success-like status.
    if receipt_state not in ("pending", "acknowledged"):
        raise ApiError(0, "delivery_rejected")
    return result["status"] if delivered and receipt_state == "acknowledged" else "delivery_waiting"
