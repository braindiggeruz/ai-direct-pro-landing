"""Local-only helper tests: SQLite + bytes; never authenticates or calls HTTP."""
import copy
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import document_canary as canary

ROOT = Path(__file__).resolve().parents[3]
PDF = b"%PDF-1.7\nsynthetic local fixture\n%%EOF"


class Rows:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class NodeSqlite:
    # The machine's Python3.9 bundles SQLite3.34 without RETURNING. Exercise
    # the exact D1 statements using the same current Node SQLite as TS tests.
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory()
        self.file = str(Path(self.temp.name) / "canary.db")

    def run(self, sql, params, script=False):
        source = """import {DatabaseSync} from 'node:sqlite';import{readFileSync}from'node:fs';
const input=JSON.parse(readFileSync(0,'utf8'));const db=new DatabaseSync(input.file);let rows=[];
if(input.script)db.exec(input.sql);else{const stmt=db.prepare(input.sql);if(stmt.columns().length)rows=stmt.all(...input.params);else stmt.run(...input.params);}
db.close();process.stdout.write(JSON.stringify(rows));"""
        result = subprocess.run(["node", "--input-type=module", "-e", source], input=json.dumps({"file": self.file, "sql": sql, "params": params, "script": script}).encode(), capture_output=True, check=True)
        return Rows(json.loads(result.stdout))

    def executescript(self, sql):
        return self.run(sql, [], True)

    def execute(self, sql, params=None):
        return self.run(sql, [] if params is None else params)


class Fixture:
    def __init__(self):
        self.db = NodeSqlite()
        self.db.executescript((ROOT / "migrations/0079_document_jobs.sql").read_text(encoding="utf-8"))
        self.objects = {}
        self.deleted = []
        self.render_enabled = True
        self.foreign_key = "documents/doc_" + "b" * 32 + "/00000000-0000-0000-0000-000000000000.pdf"
        self.objects[self.foreign_key] = b"unrelated private artifact"
        self.db.execute(canary.INSERT_SQL, ["doc_" + "b" * 32, canary.ORG, "real-subject", "presentation_pdf", "{}", "different-hash", "real-customer-key", 1, 1, 9999999999999]).fetchall()

    def query(self, sql, params):
        if sql == canary.READ_SQL and self.render_enabled:
            row = self.db.execute("SELECT id,status FROM document_jobs WHERE " + canary.EXACT_WHERE, params).fetchone()
            if row and row["status"] == "queued":
                key = "documents/" + row["id"] + "/00000000-0000-0000-0000-000000000000.pdf"
                self.objects[key] = PDF
                self.db.execute("UPDATE document_jobs SET status='ready',attempts=1,payload_json=NULL,artifact_key=?,artifact_bytes=? WHERE id=?", [key, len(PDF), row["id"]])
        return [dict(row) for row in self.db.execute(sql, params).fetchall()]

    def get(self, key):
        return self.objects.get(key)

    def delete(self, key):
        self.deleted.append(key)
        self.objects.pop(key, None)

    def list(self, prefix):
        return [key for key in self.objects if key.startswith(prefix)]


class CanaryTests(unittest.TestCase):
    def fixture(self):
        fixture = Fixture()
        self.addCleanup(fixture.db.temp.cleanup)
        return fixture

    def test_canonical_hash_matches_actual_typescript_validator_and_json_stringify(self):
        script = """import {validateDocumentCreate,hashDocument} from './functions/platform/documents/validation.ts';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const values=JSON.parse(raw); const results=[];
for(const value of values){const canonical=JSON.stringify(validateDocumentCreate(value,true));results.push({canonical,hash:await hashDocument(canonical)});}
process.stdout.write(JSON.stringify(results));"""
        process = subprocess.run(["node", "--import", "tsx", "--input-type=module", "-e", script], cwd=str(ROOT),
                                 input=canary.canonical_json(canary.fixture_inputs()).encode("utf-8"), capture_output=True, check=True)
        actual = json.loads(process.stdout.decode("utf-8"))
        plan = canary.make_plan()
        for job, result in zip(plan["jobs"], actual):
            self.assertEqual(job["canonicalCreateJson"], result["canonical"])
            self.assertEqual(job["payloadHash"], result["hash"])

    def test_plan_has_actual_expiry_and_bounded_exact_cleanup(self):
        plan = canary.make_plan(now_ms=123000, run_id="a" * 32)
        self.assertEqual(plan["expiresAt"], 123000 + canary.TTL_MS)
        self.assertEqual({job["locale"] for job in plan["jobs"]}, {"ru", "uz"})
        for job in plan["jobs"]:
            self.assertEqual(job["read"]["params"][:2], [canary.ORG, canary.SUBJECT])
            self.assertIn("idempotency_key=? AND payload_hash=?", job["delete"]["sql"])
            self.assertEqual(job["payloadHash"], hashlib.sha256(job["canonicalCreateJson"].encode()).hexdigest())

    def test_success_checks_pdf_and_removes_only_exact_tagged_rows_and_objects(self):
        fixture = self.fixture()
        plan = canary.make_plan()
        with tempfile.TemporaryDirectory() as directory:
            report = canary.run_canary(plan, fixture.query, fixture.get, fixture.delete, fixture.list,
                                       Path(directory) / "report.json", artifact_dir=Path(directory) / "pdfs")
            self.assertTrue(report["ok"])
            self.assertEqual(len(report["jobs"]), 2)
            self.assertEqual(len(list((Path(directory) / "pdfs").glob("*.pdf"))), 2)
            for item in report["jobs"]:
                self.assertEqual(item["pdfBytes"], len(PDF))
                self.assertEqual(item["pdfSha256"], hashlib.sha256(PDF).hexdigest())
            self.assertEqual(fixture.db.execute("SELECT subject FROM document_jobs").fetchall()[0]["subject"], "real-subject")
            self.assertEqual(len(fixture.objects), 1)
            self.assertIn(fixture.foreign_key, fixture.objects)

    def test_cleanup_invalidates_running_lease_before_object_delete(self):
        fixture = self.fixture()
        fixture.render_enabled = False
        plan = canary.make_plan()
        for job in plan["jobs"]:
            fixture.query(job["insert"]["sql"], job["insert"]["params"])
            key = job["artifactPrefix"] + "00000000-0000-0000-0000-000000000000.pdf"
            fixture.objects[key] = PDF
            fixture.db.execute("UPDATE document_jobs SET artifact_key=? WHERE id=?", [key, job["id"]])
        fixture.db.execute("UPDATE document_jobs SET status='running',lease_token='old-lease',attempts=1 WHERE subject=?", [canary.SUBJECT])
        deleted = []
        def deletion(key):
            row = fixture.db.execute("SELECT status,lease_token FROM document_jobs WHERE id=?", [key.split('/')[1]]).fetchone()
            self.assertEqual(row["status"], "cancelled")
            self.assertIsNone(row["lease_token"])
            deleted.append(key)
            fixture.delete(key)
        result = canary.cleanup(plan, fixture.query, fixture.get, deletion, fixture.list)
        self.assertTrue(result["ok"])
        self.assertEqual(fixture.db.execute("SELECT COUNT(*) AS n FROM document_jobs WHERE subject=?", [canary.SUBJECT]).fetchone()["n"], 0)
        self.assertEqual(len(deleted), 2)

    def test_tampered_plan_never_reaches_remote_callbacks(self):
        plan = canary.make_plan()
        changed = copy.deepcopy(plan)
        changed["jobs"][0]["delete"]["sql"] = "DELETE FROM document_jobs"
        with self.assertRaisesRegex(ValueError, "canary_plan_changed"):
            canary.cleanup(changed, lambda *args: self.fail("must not execute"), None, None, None)

    def test_unrelated_object_from_adapter_is_not_deleted(self):
        fixture = self.fixture()
        plan = canary.make_plan()
        result = canary.cleanup(plan, fixture.query, fixture.get, fixture.delete, lambda prefix: [fixture.foreign_key])
        self.assertFalse(result["ok"])
        self.assertEqual(fixture.deleted, [])
        self.assertIn(fixture.foreign_key, fixture.objects)

    def test_callback_errors_are_closed_tokens_and_never_persist_secret_values(self):
        fixture = self.fixture()
        plan = canary.make_plan()
        def failing_get(key):
            raise RuntimeError("private-token-must-never-be-written")
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "report.json"
            result = canary.run_canary(plan, fixture.query, failing_get, fixture.delete, fixture.list, file)
            self.assertFalse(result["ok"])
            self.assertNotIn("private-token", file.read_text())
            self.assertEqual(result["error"], "canary_not_verified")


if __name__ == "__main__":
    unittest.main()
