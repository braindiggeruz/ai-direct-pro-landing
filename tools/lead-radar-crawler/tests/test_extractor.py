"""Exercise the actual bundled canonical parser and bounded child-process ABI."""
import copy
import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from collector.client import ApiError, deliver_outbox, run_once
from collector.engine import Collector, iso_time
from collector.extractor import ExtractorError, NodeExtractor, SCHEMA, validate_compact_result
from collector.state import StateStore
from collector.transport import Response
from extractor_support import fixture_extractor, identity
from test_collector import Clock, FixtureTransport, SITE, html


class ExtractorTests(unittest.TestCase):
    def setUp(self):
        self.extractor = fixture_extractor()
        self.clock = Clock()
        company, digest = identity(SITE)
        self.job = {"schema": SCHEMA, "id": "fixture-job", "orgId": "fixture-org", "companyId": "fixture-company",
                    "identity": company, "identityDigest": digest, "url": SITE + "/", "leaseGeneration": 1,
                    "deadlineAt": iso_time(self.clock() + 120), "leaseExpiresAt": iso_time(self.clock() + 180),
                    "limits": {"maxPages": 5, "maxPageBytes": 131072, "maxTotalBytes": 524288, "maxRedirects": 3},
                    "resumeUrls": []}

    def raw(self, body='<h1>Fixture Dental</h1><a href="tel:+998901234567">Reception phone</a>'):
        return {"schema": SCHEMA, "jobId": self.job["id"], "identityDigest": self.job["identityDigest"],
                "receiptId": "fixture-receipt-1", "leaseGeneration": 1, "status": "completed", "reason": "ok",
                "retryAt": None, "resumeUrls": [], "pages": [{"requestedUrl": SITE + "/", "url": SITE + "/",
                "status": 200, "fetchedAt": iso_time(self.clock()), "html": body,
                "sha256": hashlib.sha256(body.encode("utf-8")).hexdigest()}]}

    def test_real_bundle_returns_only_bounded_contact_metadata(self):
        body = ('<h1>Fixture Dental</h1>' + '<p>Owned clinic services.</p>' * 4000
                + '<footer><a href="tel:+998901234567">Reception phone</a>'
                + '<p>Запись в клинику Telegram: <a href="https://t.me/fixture_clinic">Telegram</a></p></footer>')
        result = self.extractor(self.job, self.raw(body))
        self.assertEqual(result["binding"], {"method": "phone", "pageIndex": 0})
        self.assertIn("+998901234567", [fact["value"] for fact in result["evidence"]])
        self.assertIn("https://t.me/fixture_clinic", [fact["value"] for fact in result["evidence"]])
        self.assertNotIn("html", result["pages"][0])
        self.assertEqual(result["pages"][0]["bytes"], len(body.encode("utf-8")))
        self.assertLess(len(json.dumps(result).encode("utf-8")), 3000)
        self.assertTrue(all(f["fieldPath"] != "web.website" for f in result["evidence"]))

    def test_unicode_identity_digest_uses_exact_server_order(self):
        company, digest = identity(SITE, name="Клиника Фикстура — Тест", city="Ташкент")
        self.job.update(identity=dict(reversed(list(company.items()))), identityDigest=digest)
        result = self.extractor(self.job, self.raw())
        self.assertEqual(result["binding"]["method"], "phone")

    def test_conflicting_identity_is_rejected_before_process_start(self):
        self.job["identity"]["name"] = "Other company"
        with patch("collector.extractor.subprocess.Popen") as spawn:
            with self.assertRaisesRegex(ExtractorError, "extractor_invalid_identity"):
                self.extractor(self.job, self.raw())
            spawn.assert_not_called()

    def test_hash_origin_staleness_and_challenge_fail_closed(self):
        original = self.raw()
        samples = []
        for key, value in (("sha256", "a" * 64), ("url", "https://foreign-fixture.uz/"),
                           ("fetchedAt", iso_time(self.clock() - 1))):
            changed = copy.deepcopy(original)
            changed["pages"][0][key] = value
            samples.append(changed)
        samples.append(self.raw('<title>Just a moment</title><h1>Fixture Dental</h1>'))
        for raw in samples:
            with self.subTest(raw_hash=raw["pages"][0]["sha256"]), self.assertRaises(ExtractorError):
                self.extractor(self.job, raw)

    def test_no_binding_cannot_create_evidence(self):
        raw = self.raw('<h1>Completely different company</h1><a href="tel:+998901234568">Company phone</a>')
        result = self.extractor(self.job, raw)
        self.assertIsNone(result["binding"])
        self.assertEqual(result["evidence"], [])

    def test_child_does_not_inherit_tokens_or_runtime_hooks(self):
        real_spawn = subprocess.Popen
        with patch.dict(os.environ, {"CRAWLER_TOKEN": "fixture-sensitive", "BRIDGE_TOKEN": "fixture-bridge",
                                    "NODE_OPTIONS": "--require=must-not-load", "NODE_PATH": "must-not-load",
                                    "HTTP_PROXY": "fixture-proxy"}):
            with patch("collector.extractor.subprocess.Popen", wraps=real_spawn) as spawn:
                result = self.extractor(self.job, self.raw())
        environment = spawn.call_args.kwargs["env"]
        self.assertLessEqual(set(environment), {"SystemRoot", "WINDIR", "LANG", "TZ"})
        self.assertFalse(spawn.call_args.kwargs["shell"])
        self.assertEqual(result["schema"], SCHEMA)

    def test_output_overflow_timeout_and_invalid_json_are_bounded(self):
        fixture = Path(__file__).parent / "fixtures" / "extractor-failure.mjs"
        for mode, code in (("overflow", "extractor_output_too_large"), ("stderr_overflow", "extractor_output_too_large"),
                           ("timeout", "extractor_timeout"), ("invalid", "extractor_invalid_result"),
                           ("raw", "extractor_invalid_result")):
            helper = NodeExtractor(self.extractor.node, fixture, timeout=0.25 if mode == "timeout" else 5)
            raw = self.raw()
            raw["reason"] = mode
            with self.subTest(mode=mode), self.assertRaisesRegex(ExtractorError, code):
                helper(self.job, raw)

    def test_missing_helper_stops_before_claim_and_network(self):
        with tempfile.TemporaryDirectory() as directory:
            store = StateStore(Path(directory) / "state.sqlite3")
            try:
                api = Mock()
                with patch.dict(os.environ, {"CRAWLER_NODE": "", "CRAWLER_EXTRACTOR": ""}):
                    with self.assertRaisesRegex(ExtractorError, "extractor_configuration_invalid"):
                        run_once(store, api, clock=self.clock)
                api.post.assert_not_called()
            finally:
                store.close()

    def test_legacy_outbox_never_uploads_raw_html(self):
        with tempfile.TemporaryDirectory() as directory:
            store = StateStore(Path(directory) / "state.sqlite3")
            try:
                store.enqueue("legacy-receipt", {"schema": "gptbot.lead-radar.crawler.v1", "pages": [{"html": "fixture"}]}, self.clock())
                api = Mock()
                self.assertTrue(deliver_outbox(store, api, clock=self.clock))
                api.post.assert_not_called()
                row = store.db.execute("SELECT state,last_error,payload FROM outbox").fetchone()
                self.assertEqual(tuple(row), ("rejected", "unsupported_result_protocol", "{}"))
            finally:
                store.close()

    def test_extraction_failure_never_queues_raw_result(self):
        with tempfile.TemporaryDirectory() as directory:
            store = StateStore(Path(directory) / "state.sqlite3")
            try:
                store.save_robots(SITE, "", self.clock() + 3600)
                transport = FixtureTransport({SITE + "/": html(SITE + "/", '<h1>Fixture Dental</h1>')})
                collector = Collector(store, transport, clock=self.clock, wait=self.clock.wait,
                                      extractor=Mock(side_effect=ExtractorError("extractor_timeout")))
                result = collector.collect(self.job, receipt_id="failed-extractor-receipt")
                self.assertEqual(result["status"], "failed")
                self.assertEqual(result["reason"], "invalid_response")
                self.assertEqual(result["pages"], [])
                self.assertEqual(result["evidence"], [])
                self.assertIsNone(result["binding"])
                self.assertEqual(result["receiptId"], "failed-extractor-receipt")
                self.assertEqual(result["jobId"], self.job["id"])
                self.assertEqual(result["identityDigest"], self.job["identityDigest"])
                self.assertEqual(result["leaseGeneration"], self.job["leaseGeneration"])
                self.assertEqual(store.pending(self.clock())[0]["payload"], result)
                self.assertTrue(store.has_pending())  # no fabricated server acknowledgment
            finally:
                store.close()

    def test_real_helper_failure_finishes_job_and_next_host_can_progress(self):
        fixture = Path(__file__).parent / "fixtures" / "extractor-failure.mjs"
        next_site = "https://next-fixture-clinic.uz"
        for mode in ("invalid_output", "timeout"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                store = StateStore(Path(directory) / "state.sqlite3")
                try:
                    store.save_robots(SITE, "", self.clock() + 3600)
                    store.save_robots(next_site, "", self.clock() + 3600)
                    body = '<h1>Fixture Dental</h1>' + ('<p>extractor-test-timeout</p>' if mode == "timeout" else '')
                    transport = FixtureTransport({SITE + "/": html(SITE + "/", body),
                        next_site + "/": html(next_site + "/", '<h1>Fixture Dental</h1><a href="tel:+998901234567">Phone</a>')})
                    next_identity, next_digest = identity(next_site)
                    next_job = {**self.job, "id": "fixture-next-job", "companyId": "fixture-next-company",
                                "url": next_site + "/", "identity": next_identity, "identityDigest": next_digest}
                    jobs, receipts = [self.job, next_job], []

                    def post(route, payload):
                        if route == "claim":
                            return {"ok": True, "job": jobs.pop(0)}
                        self.assertEqual(route, "result")
                        receipts.append(payload)
                        return {"ok": True, "accepted": True, "receiptId": payload["receiptId"]}

                    api = Mock()
                    api.post.side_effect = post
                    failing = NodeExtractor(self.extractor.node, fixture, timeout=0.25 if mode == "timeout" else 5)
                    first = Collector(store, transport, clock=self.clock, wait=self.clock.wait, extractor=failing)
                    self.assertEqual(run_once(store, api, first, clock=self.clock), "failed")
                    self.assertEqual(receipts[0]["pages"], [])
                    self.assertEqual(receipts[0]["evidence"], [])
                    self.assertIsNone(receipts[0]["binding"])
                    second = Collector(store, transport, clock=self.clock, wait=self.clock.wait, extractor=self.extractor)
                    self.assertEqual(run_once(store, api, second, clock=self.clock), "completed")
                    self.assertEqual(receipts[1]["jobId"], next_job["id"])
                    self.assertTrue(receipts[1]["evidence"])
                    self.assertFalse(store.has_pending())
                finally:
                    store.close()

    def test_failure_result_still_obeys_server_lease_fence(self):
        with tempfile.TemporaryDirectory() as directory:
            store = StateStore(Path(directory) / "state.sqlite3")
            try:
                store.save_robots(SITE, "", self.clock() + 3600)
                collector = Collector(store, FixtureTransport({SITE + "/": html(SITE + "/", '<h1>Fixture Dental</h1>')}),
                                      clock=self.clock, wait=self.clock.wait,
                                      extractor=Mock(side_effect=ExtractorError("extractor_timeout")))
                result = collector.collect(self.job)
                api = Mock()
                api.post.side_effect = ApiError(409, "crawler_lease_lost")
                self.assertTrue(deliver_outbox(store, api, clock=self.clock))
                row = store.db.execute("SELECT state,last_error FROM outbox WHERE receipt_id=?", (result["receiptId"],)).fetchone()
                self.assertEqual(tuple(row), ("rejected", "crawler_lease_lost"))
            finally:
                store.close()

    def test_deferred_source_deadline_survives_extractor_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            store = StateStore(Path(directory) / "state.sqlite3")
            try:
                store.save_robots(SITE, "", self.clock() + 7200)
                transport = FixtureTransport({
                    SITE + "/": html(SITE + "/", '<h1>Fixture Dental</h1><a href="/contacts">Contacts</a>'),
                    SITE + "/contacts": Response(SITE + "/contacts", 429, {"retry-after": "3600"}, b""),
                })
                failed_helper = Mock(side_effect=ExtractorError("extractor_timeout"))
                collector = Collector(store, transport, clock=self.clock, wait=self.clock.wait, extractor=failed_helper)
                result = collector.collect(self.job, receipt_id="deferred-extractor-receipt")
                raw = failed_helper.call_args.args[1]
                self.assertEqual(len(raw["pages"]), 1)
                self.assertEqual(result["status"], "deferred")
                self.assertEqual(result["reason"], "source_rate_limited")
                self.assertEqual(result["retryAt"], iso_time(self.clock() + 3600))
                self.assertEqual(result["resumeUrls"], [SITE + "/contacts"])
                self.assertEqual(result["pages"], [])
                self.assertEqual(result["evidence"], [])
                self.assertIsNone(result["binding"])
                self.assertEqual(result["receiptId"], "deferred-extractor-receipt")
                self.assertEqual(store.pending(self.clock())[0]["payload"], result)
                self.assertEqual(store.deadline(SITE), self.clock() + 3600)
                validate_compact_result(result, job=self.job, raw=raw)
            finally:
                store.close()

    def test_compact_validator_rejects_nested_html_and_binding_free_facts(self):
        result = self.extractor(self.job, self.raw())
        altered = copy.deepcopy(result)
        altered["pages"][0]["html"] = "secret raw fixture"
        with self.assertRaises(ExtractorError):
            validate_compact_result(altered)
        result["binding"] = None
        with self.assertRaises(ExtractorError):
            validate_compact_result(result)


if __name__ == "__main__":
    unittest.main()
