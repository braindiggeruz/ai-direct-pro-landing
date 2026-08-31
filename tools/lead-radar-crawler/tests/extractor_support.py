"""Explicit local bundle/runtime paths for offline tests, never production fallback."""
import hashlib
import json
import os
import shutil
from pathlib import Path

from collector.extractor import EXTRACTOR, SCHEMA, NodeExtractor


def fixture_extractor():
    node = os.environ.get("CRAWLER_NODE") or shutil.which("node")
    helper = os.environ.get("CRAWLER_EXTRACTOR") or str(Path(__file__).parents[1] / "dist" / "extractor.mjs")
    if not node or not Path(helper).is_file():
        raise RuntimeError("Build the offline extractor bundle before running collector tests")
    return NodeExtractor(node, helper)


def identity(site, *, name="Fixture Dental", city="Tashkent"):
    value = {"name": name, "phone": "+998901234567", "address": "Fixture Street 1", "city": city,
             "website": site + "/", "canonical_key": "fixture:company-1"}
    digest = hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
    return value, digest


def empty_result(receipt_id="r1"):
    return {"schema": SCHEMA, "jobId": "job-1", "leaseGeneration": 1, "receiptId": receipt_id,
            "identityDigest": "a" * 64, "status": "failed", "reason": "robots_disallowed", "pages": [],
            "retryAt": None, "resumeUrls": [], "extractorVersion": EXTRACTOR, "binding": None, "evidence": []}
