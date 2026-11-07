"""Synthetic document canary. No credentials, HTTP client or remote execution.

The root's existing secure process injects D1/R2 callbacks. CLI only writes a
reviewable plan. Never pass real customer text or authentication material here.
"""
import argparse
import hashlib
import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ORG = "gptbot-documents"
SUBJECT = "canary:railway-20261107"
TTL_MS = 24 * 60 * 60 * 1000
MAX_PDF = 10 * 1024 * 1024

# Match validateDocumentCreate's object insertion order, then JSON.stringify.
# All fixtures contain plain finite strings/arrays and no surrogate codepoints.
def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def sha256(value):
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


INSERT_SQL = """INSERT OR IGNORE INTO document_jobs
(id,org_id,subject,type,status,payload_json,payload_hash,idempotency_key,created_at,updated_at,expires_at)
VALUES (?,?,?,?,'queued',?,?,?,?,?,?) RETURNING id"""
EXACT_WHERE = "org_id=? AND subject=? AND id=? AND idempotency_key=? AND payload_hash=?"
READ_SQL = "SELECT id,type,status,attempts,artifact_key,artifact_bytes,error_code,created_at,updated_at,expires_at,lease_expires_at,payload_json FROM document_jobs WHERE " + EXACT_WHERE
FREEZE_SQL = """UPDATE document_jobs SET status='cancelled',payload_json=NULL,
lease_token=NULL,lease_expires_at=NULL,updated_at=?,expires_at=? WHERE """ + EXACT_WHERE + " RETURNING id,artifact_key"
DELETE_SQL = "DELETE FROM document_jobs WHERE " + EXACT_WHERE + " AND status='cancelled' AND payload_json IS NULL RETURNING id"


def fixture_inputs():
    return [
        {"type": "proposal_pdf", "payload": {
            "locale": "ru", "company": "CANARY — синтетическая компания",
            "objective": "Проверить формирование документа на русском языке. Это технический тест, не предложение клиенту.",
            "packageId": "custom", "scope": ["Проверка кириллицы: Ёж, съёмка, очередь.", "Проверка переноса текста и готового PDF."],
            "budgetTerms": "Синтетический тест. Стоимость, сроки и коммерческие обязательства не устанавливаются.",
        }},
        {"type": "presentation_pdf", "payload": {
            "locale": "uz", "title": "CANARY — sun’iy taqdimot",
            "slides": [
                {"title": "O‘zbekcha tekshiruv", "bullets": ["Bu haqiqiy mijoz ma’lumoti emas.", "O‘, G‘, o‘quvchi va g‘oya belgilarini tekshirish."], "notes": "To‘lov va pullik chat balansi ishlatilmaydi."},
                {"title": "Natijani tekshirish", "bullets": ["Vazifa tayyor holatiga o‘tadi.", "PDF yopiq ombordan o‘qiladi va testdan keyin o‘chiriladi."]},
            ],
        }},
    ]


def make_plan(now_ms=None, run_id=None):
    now_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
    run_id = uuid.uuid4().hex if run_id is None else run_id
    if not re.fullmatch(r"[a-f0-9]{32}", run_id):
        raise ValueError("invalid_run_id")
    jobs = []
    for item in fixture_inputs():
        locale = item["payload"]["locale"]
        job_id = "doc_" + uuid.uuid5(uuid.UUID(run_id), locale).hex
        key = "canary-20261107-" + run_id + "-" + locale
        body = canonical_json(item)
        payload = canonical_json(item["payload"])
        digest = sha256(body)
        exact = [ORG, SUBJECT, job_id, key, digest]
        jobs.append({
            "id": job_id, "locale": locale, "type": item["type"],
            "idempotencyKey": key, "canonicalCreateJson": body, "payloadJson": payload,
            "payloadHash": digest, "artifactPrefix": "documents/" + job_id + "/",
            "insert": {"sql": INSERT_SQL, "params": [job_id, ORG, SUBJECT, item["type"], payload, digest, key, now_ms, now_ms, now_ms + TTL_MS]},
            "read": {"sql": READ_SQL, "params": exact},
            "freeze": {"sql": FREEZE_SQL, "paramsAfterActualNowTwice": exact},
            "delete": {"sql": DELETE_SQL, "params": exact},
        })
    return {"version": 1, "runId": run_id, "orgId": ORG, "subject": SUBJECT,
            "createdAt": now_ms, "expiresAt": now_ms + TTL_MS, "jobs": jobs,
            "scope": "Synthetic D1 insertion -> actual deployed worker -> actual private R2 PDF. Does not prove browser/owner authentication or payments."}


def validate_plan(plan):
    if plan.get("version") != 1 or plan.get("orgId") != ORG or plan.get("subject") != SUBJECT:
        raise ValueError("unsafe_canary_scope")
    expected = make_plan(plan.get("createdAt"), plan.get("runId"))
    # Rebuild every SQL statement, parameter, hash and artifact prefix before
    # executing; a hand-edited plan cannot broaden cleanup or insert real text.
    if plan != expected:
        raise ValueError("canary_plan_changed")


def validate_key(job, key):
    if not isinstance(key, str) or not re.fullmatch(re.escape(job["artifactPrefix"]) + r"[a-f0-9-]{36}\.pdf", key):
        raise ValueError("unsafe_artifact_key")
    return key


def normalize_d1_result(result):
    """For a Cloudflare API envelope; adapters may instead return row lists."""
    if isinstance(result, dict) and "result" in result:
        if result.get("success") is not True:
            raise RuntimeError("d1_request_failed")
        result = result["result"]
    if isinstance(result, list) and len(result) == 1 and isinstance(result[0], dict) and "results" in result[0]:
        if result[0].get("success", True) is not True:
            raise RuntimeError("d1_statement_failed")
        return result[0]["results"]
    if isinstance(result, list):
        return result
    raise RuntimeError("d1_response_invalid")


def query(d1_query, statement):
    return normalize_d1_result(d1_query(statement["sql"], statement["params"]))


def cleanup(plan, d1_query, r2_get, r2_delete, r2_list):
    """Remove only exact canary rows and exact per-job private object prefixes.

    Freeze first invalidates any active lease, so a late completion cannot
    resurrect the row. Failed deletions retain the cancelled row for recovery.
    R2 callbacks must use the dedicated DOCUMENT_ARTIFACTS bucket.
    """
    validate_plan(plan)
    result = {"ok": True, "jobs": []}
    for job in plan["jobs"]:
        report = {"id": job["id"], "deletedArtifacts": [], "rowsRemaining": None, "artifactKeysRemaining": None, "ok": False}
        result["jobs"].append(report)
        try:
            now = int(time.time() * 1000)
            frozen = query(d1_query, {"sql": FREEZE_SQL, "params": [now, now] + job["read"]["params"]})
            keys = set(r2_list(job["artifactPrefix"]))
            for row in frozen:
                if row.get("artifact_key"):
                    keys.add(row["artifact_key"])
            # Check the whole returned list before deleting the first object.
            for key in keys:
                validate_key(job, key)
            for key in sorted(keys):
                r2_delete(key)
                if r2_get(key) is not None:
                    raise RuntimeError("artifact_delete_unconfirmed")
                report["deletedArtifacts"].append(key)
            remaining = list(r2_list(job["artifactPrefix"]))
            for key in remaining:
                validate_key(job, key)
            report["artifactKeysRemaining"] = remaining
            if remaining:
                raise RuntimeError("artifact_cleanup_incomplete")
            query(d1_query, job["delete"])
            report["rowsRemaining"] = len(query(d1_query, job["read"]))
            report["ok"] = report["rowsRemaining"] == 0
        except Exception:
            # Adapter errors may include credentials or upstream bodies: never
            # stringify them into persisted output. Retry this exact plan.
            report["error"] = "canary_cleanup_failed"
        if not report["ok"]:
            result["ok"] = False
    return result


def run_canary(plan, d1_query, r2_get, r2_delete, r2_list, report_path, artifact_dir=None,
               timeout_seconds=360, poll_seconds=5, sleep=time.sleep):
    """Root-only callback runner. No auth forging and no worker credential use.

    d1_query(sql,params) -> rows or Cloudflare API response
    r2_get(key) -> bytes, or None only for confirmed404
    r2_delete(key) -> raise on failure; r2_list(prefix) -> all exact-prefix keys
    Authentication and endpoint selection belong to the injected secure caller.
    """
    validate_plan(plan)
    if abs(int(time.time() * 1000) - plan["createdAt"]) > 5 * 60 * 1000:
        raise ValueError("regenerate_stale_canary_plan")
    if not 0 < timeout_seconds <= 600 or not 0 < poll_seconds <= 30:
        raise ValueError("invalid_canary_deadline")
    report = {"runId": plan["runId"], "startedAt": datetime.now(timezone.utc).isoformat(),
              "ok": False, "scope": plan["scope"], "jobs": [], "cleanup": None}
    stage = "insert_synthetic_jobs"
    try:
        for job in plan["jobs"]:
            query(d1_query, job["insert"])
        deadline = time.monotonic() + timeout_seconds
        pending = {job["id"]: job for job in plan["jobs"]}
        while pending:
            for job_id, job in list(pending.items()):
                stage = "poll_worker_ledger"
                rows = query(d1_query, job["read"])
                if len(rows) != 1:
                    raise RuntimeError("canary_row_missing")
                row = rows[0]
                if row["status"] in ("failed", "cancelled", "expired"):
                    raise RuntimeError("canary_job_terminal_failure")
                if row["status"] != "ready":
                    continue
                key = validate_key(job, row.get("artifact_key"))
                stage = "read_private_artifact"
                pdf = r2_get(key)
                if not isinstance(pdf, bytes) or not 12 <= len(pdf) <= MAX_PDF or not pdf.startswith(b"%PDF-") or b"%%EOF" not in pdf[-1024:]:
                    raise RuntimeError("canary_pdf_invalid")
                if row["artifact_bytes"] != len(pdf) or row["payload_json"] is not None or not 1 <= row["attempts"] <= 3 or row["expires_at"] != plan["expiresAt"]:
                    raise RuntimeError("canary_ledger_mismatch")
                evidence = {"id": job_id, "locale": job["locale"], "type": job["type"], "status": "ready",
                            "attempts": row["attempts"], "payloadHash": job["payloadHash"], "pdfBytes": len(pdf),
                            "pdfSha256": sha256(pdf), "artifactKey": key, "payloadScrubbed": True,
                            "pdfHeaderAndFooterValid": True, "privateAuthenticatedR2Read": True,
                            "semanticOrVisualPdfCheck": "not_run_by_helper"}
                if artifact_dir:
                    directory = Path(artifact_dir)
                    directory.mkdir(parents=True, exist_ok=True)
                    file = directory / (job["locale"] + "-" + job["type"] + "-" + plan["runId"] + ".pdf")
                    file.write_bytes(pdf)
                    evidence["localPdf"] = str(file.resolve())
                report["jobs"].append(evidence)
                del pending[job_id]
            if pending:
                if time.monotonic() >= deadline:
                    raise RuntimeError("canary_timeout")
                sleep(poll_seconds)
        report["ok"] = len(report["jobs"]) == 2
    except Exception:
        report["error"] = "canary_not_verified"
        report["failureStage"] = stage
    finally:
        report["cleanup"] = cleanup(plan, d1_query, r2_get, r2_delete, r2_list)
        report["ok"] = report["ok"] and report["cleanup"]["ok"]
        report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        target = Path(report_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Write a synthetic SQL canary plan; never calls remote services.")
    parser.add_argument("command", choices=["plan"])
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    destination = Path(args.out)
    destination.parent.mkdir(parents=True, exist_ok=True)
    plan = make_plan()
    destination.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"created": str(destination.resolve()), "runId": plan["runId"], "jobs": [{"id": job["id"], "locale": job["locale"], "payloadHash": job["payloadHash"]} for job in plan["jobs"]]}))
