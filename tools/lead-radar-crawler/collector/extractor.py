"""Isolated canonical TypeScript helper. No crawler credentials enter this child."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
import threading
from pathlib import Path

SCHEMA = "gptbot.lead-radar.crawler.v2"
EXTRACTOR = "gptbot.lead-radar.extractor.v1"
MAX_INPUT = 1_048_576
MAX_OUTPUT = 65_536
_HASH = re.compile(r"[a-f0-9]{64}\Z")
_FIELDS = {"company_contacts.phone", "company_contacts.generic_email", "web.telegram.human",
           "web.telegram.bot", "web.telegram.channel", "web.telegram.group", "web.telegram.business",
           "web.telegram.unknown"}
_RESULT_KEYS = {"schema", "jobId", "leaseGeneration", "receiptId", "identityDigest", "status", "reason",
                "pages", "retryAt", "resumeUrls", "extractorVersion", "binding", "evidence"}
_PAGE_KEYS = {"requestedUrl", "url", "bytes", "status", "fetchedAt", "sha256"}
_FACT_KEYS = {"pageIndex", "fieldPath", "value", "confidence"}


class ExtractorError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def validate_claim_identity(job: dict) -> None:
    """Verify public identity before fetching, using the server's exact JSON order."""
    identity = job.get("identity")
    if not isinstance(identity, dict):
        raise ExtractorError("extractor_invalid_identity")
    ordered = {}
    for key, maximum in (("name", 512), ("phone", 512), ("address", 2048), ("city", 512),
                         ("website", 2048), ("canonical_key", 1024)):
        value = identity.get(key)
        if value is None and key in ("phone", "address") and key in identity:
            ordered[key] = None
        elif (isinstance(value, str) and len(value) <= maximum and "\x00" not in value
              and (value or key in ("phone", "address", "city"))):
            ordered[key] = value
        else:
            raise ExtractorError("extractor_invalid_identity")
    encoded = json.dumps(ordered, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if hashlib.sha256(encoded).hexdigest() != job.get("identityDigest"):
        raise ExtractorError("extractor_invalid_identity")


def validate_compact_result(value: object, *, job: dict | None = None, raw: dict | None = None) -> dict:
    """Fail closed on old raw-HTML outboxes as well as malformed helper output."""
    def invalid():
        raise ExtractorError("extractor_invalid_result")

    if not isinstance(value, dict) or set(value) != _RESULT_KEYS:
        invalid()
    if value.get("schema") != SCHEMA or value.get("extractorVersion") != EXTRACTOR:
        invalid()
    if any(not isinstance(value.get(k), str) or not value[k] or len(value[k]) > 128
           for k in ("jobId", "receiptId", "identityDigest", "reason")):
        invalid()
    if not _HASH.fullmatch(value["identityDigest"]) or type(value.get("leaseGeneration")) is not int or value["leaseGeneration"] < 1:
        invalid()
    if value.get("status") not in ("completed", "partial", "deferred", "failed"):
        invalid()
    pages, facts, binding = value.get("pages"), value.get("evidence"), value.get("binding")
    if not isinstance(pages, list) or len(pages) > 5 or not isinstance(facts, list) or len(facts) > 55:
        invalid()
    total = 0
    for page in pages:
        if (not isinstance(page, dict) or set(page) != _PAGE_KEYS or page.get("status") != 200
                or type(page.get("bytes")) is not int or not 1 <= page["bytes"] <= 131_072
                or any(not isinstance(page.get(k), str) or not page[k] or len(page[k]) > 2048
                       for k in ("requestedUrl", "url", "fetchedAt", "sha256"))
                or not _HASH.fullmatch(page["sha256"])):
            invalid()
        total += page["bytes"]
    if total > 524_288:
        invalid()
    if binding is None:
        if facts:
            invalid()
    elif (not isinstance(binding, dict) or set(binding) != {"method", "pageIndex"}
          or binding.get("method") not in ("phone", "company_name")
          or type(binding.get("pageIndex")) is not int or not 0 <= binding["pageIndex"] < len(pages)):
        invalid()
    for fact in facts:
        if (not isinstance(fact, dict) or set(fact) != _FACT_KEYS or fact.get("fieldPath") not in _FIELDS
                or type(fact.get("pageIndex")) is not int or not 0 <= fact["pageIndex"] < len(pages)
                or not isinstance(fact.get("value"), str) or not fact["value"] or len(fact["value"]) > 512
                or type(fact.get("confidence")) not in (int, float)
                or not math.isfinite(fact["confidence"]) or not 0 <= fact["confidence"] <= 1):
            invalid()
    urls = value.get("resumeUrls")
    if not isinstance(urls, list) or len(urls) > 5 or any(not isinstance(u, str) or len(u) > 2048 for u in urls):
        invalid()
    if value["status"] == "deferred":
        if not urls or not isinstance(value.get("retryAt"), str):
            invalid()
    elif urls or value.get("retryAt") is not None:
        invalid()
    if value["status"] in ("completed", "partial") and not pages or value["status"] == "failed" and pages:
        invalid()
    if job and (value["jobId"] != job["id"] or value["identityDigest"] != job["identityDigest"]
                or value["leaseGeneration"] != job["leaseGeneration"]):
        invalid()
    if raw and value["receiptId"] != raw["receiptId"]:
        invalid()
    if len(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")) > MAX_OUTPUT:
        invalid()
    return value


class NodeExtractor:
    def __init__(self, node: str | Path, extractor: str | Path, *, timeout: float = 12.0):
        self.node, self.extractor = Path(node), Path(extractor)
        for path in (self.node, self.extractor):
            if not path.is_absolute() or path.is_symlink() or not path.is_file():
                raise ExtractorError("extractor_configuration_invalid")
        if self.node.name.lower() not in ("node", "node.exe") or self.extractor.suffix != ".mjs":
            raise ExtractorError("extractor_configuration_invalid")
        self.timeout = min(12.0, max(0.05, timeout))

    @classmethod
    def from_environment(cls):
        # The ACL-protected installer wrapper sets these absolute runtime paths.
        # Neither the claimed job nor PATH can select executable code.
        return cls(os.environ.get("CRAWLER_NODE", ""), os.environ.get("CRAWLER_EXTRACTOR", ""))

    def __call__(self, job: dict, result: dict) -> dict:
        validate_claim_identity(job)
        data = json.dumps({"job": job, "result": result}, ensure_ascii=False,
                          separators=(",", ":"), allow_nan=False).encode("utf-8")
        if len(data) > MAX_INPUT:
            raise ExtractorError("extractor_input_too_large")
        # Build a new environment; never copy credentials, proxies, NODE_OPTIONS,
        # NODE_PATH, Python hooks, home/profile paths, or owner/Bridge variables.
        environment = {key: os.environ[key] for key in ("SystemRoot", "WINDIR") if key in os.environ}
        environment.update({"LANG": "C.UTF-8", "TZ": "UTC"})
        try:
            process = subprocess.Popen([str(self.node), "--max-old-space-size=96", str(self.extractor)],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       cwd=self.extractor.parent, env=environment, shell=False, close_fds=True,
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except OSError:
            raise ExtractorError("extractor_unavailable") from None
        outputs = [bytearray(), bytearray()]
        overflow = threading.Event()

        def read_bounded(pipe, output, maximum):
            try:
                while chunk := pipe.read(4096):
                    if len(output) + len(chunk) > maximum:
                        overflow.set()
                        process.kill()
                        return
                    output.extend(chunk)
            finally:
                pipe.close()

        def write_input():
            try:
                process.stdin.write(data)
                process.stdin.flush()
            except (BrokenPipeError, OSError):
                pass
            finally:
                process.stdin.close()

        threads = [threading.Thread(target=read_bounded, args=(process.stdout, outputs[0], MAX_OUTPUT), daemon=True),
                   threading.Thread(target=read_bounded, args=(process.stderr, outputs[1], 4096), daemon=True),
                   threading.Thread(target=write_input, daemon=True)]
        for thread in threads:
            thread.start()
        try:
            process.wait(timeout=self.timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            raise ExtractorError("extractor_timeout") from None
        finally:
            for thread in threads:
                thread.join(timeout=1.0)
        if overflow.is_set():
            raise ExtractorError("extractor_output_too_large")
        if process.returncode:
            # Never echo arbitrary stderr (it might contain HTML or identifiers).
            raise ExtractorError("extractor_failed")
        try:
            value = json.loads(outputs[0].decode("utf-8"))
            return validate_compact_result(value, job=job, raw=result)
        except (ValueError, UnicodeError, TypeError, KeyError):
            raise ExtractorError("extractor_invalid_result") from None
