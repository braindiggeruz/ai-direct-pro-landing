"""A completed local crawl is not successful delivery without its exact ACK."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from collector.client import ApiError, run_once
from collector.engine import Collector, iso_time
from collector.extractor import SCHEMA
from collector.state import StateStore
from extractor_support import empty_result, fixture_extractor, identity
from test_collector import Clock, FixtureTransport, SITE, html


class DeliveryTruthTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = StateStore(Path(self.directory.name) / "state.sqlite3")
        self.clock = Clock()
        company, digest = identity(SITE)
        self.job = {"schema": SCHEMA, "id": "fixture-job", "orgId": "fixture-org", "companyId": "fixture-company",
                    "identity": company, "identityDigest": digest, "url": SITE + "/", "leaseGeneration": 1,
                    "deadlineAt": iso_time(self.clock() + 120), "leaseExpiresAt": iso_time(self.clock() + 180),
                    "limits": {"maxPages": 5, "maxPageBytes": 131072, "maxTotalBytes": 524288, "maxRedirects": 3},
                    "resumeUrls": []}
        self.store.save_robots(SITE, "", self.clock() + 3600)
        transport = FixtureTransport({SITE + "/": html(SITE + "/", '<h1>Fixture Dental</h1><a href="tel:+998901234567">Phone</a>')})
        self.collector = Collector(self.store, transport, clock=self.clock, wait=self.clock.wait,
                                   extractor=fixture_extractor())

    def tearDown(self):
        self.store.close()
        self.directory.cleanup()

    def api(self, result_response):
        api = Mock()

        def post(route, payload):
            if route == "claim":
                return {"ok": True, "job": self.job}
            self.assertEqual(route, "result")
            return result_response(payload)

        api.post.side_effect = post
        return api

    def test_current_rejected_receipt_never_reports_completed(self):
        errors = [(400, "crawler_invalid_result"), (413, "crawler_body_too_large"), (422, "result_rejected"),
                  (409, "crawler_lease_lost"), (409, "crawler_identity_changed"), (409, "crawler_receipt_conflict")]
        for status, code in errors:
            with self.subTest(status=status, code=code):
                receipts = []

                def reject(payload):
                    receipts.append(payload["receiptId"])
                    raise ApiError(status, code)

                with self.assertRaisesRegex(ApiError, "delivery_rejected"):
                    run_once(self.store, self.api(reject), self.collector, clock=self.clock)
                self.assertEqual(self.store.receipt_state(receipts[0]), "rejected")
                self.assertFalse(self.store.has_pending())
                self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM process_lease").fetchone()[0], 0)

    def test_matching_ack_reports_completed_and_persists_exact_receipt(self):
        receipts = []

        def accept(payload):
            receipts.append(payload["receiptId"])
            return {"ok": True, "accepted": True, "receiptId": payload["receiptId"]}

        self.assertEqual(run_once(self.store, self.api(accept), self.collector, clock=self.clock), "completed")
        self.assertEqual(self.store.receipt_state(receipts[0]), "acknowledged")
        self.assertIsNone(self.store.receipt_state("different-receipt"))

    def test_matching_api_ack_without_durable_receipt_row_is_not_success(self):
        def lose_row_then_ack(payload):
            # Simulate concurrent local-state corruption after upload, not a real
            # runtime deletion. Even a positive wire ACK cannot prove our row.
            with self.store.db:
                self.store.db.execute("DELETE FROM outbox WHERE receipt_id=?", (payload["receiptId"],))
            return {"ok": True, "accepted": True, "receiptId": payload["receiptId"]}

        with self.assertRaisesRegex(ApiError, "delivery_rejected"):
            run_once(self.store, self.api(lose_row_then_ack), self.collector, clock=self.clock)

    def test_missing_unqueued_current_receipt_is_not_success(self):
        local_result = empty_result("never-enqueued-receipt")
        local_result["status"] = "completed"
        collector = Mock()
        collector.collect.return_value = local_result
        api = self.api(lambda payload: self.fail("No result should be uploaded without an outbox row"))
        with self.assertRaisesRegex(ApiError, "delivery_rejected"):
            run_once(self.store, api, collector, clock=self.clock)
        self.assertEqual([call.args[0] for call in api.post.call_args_list], ["claim"])

    def test_wrong_ack_waits_instead_of_using_another_acknowledged_receipt(self):
        self.store.enqueue("prior-receipt", empty_result("prior-receipt"), self.clock())
        self.store.acknowledge("prior-receipt")
        api = self.api(lambda payload: {"ok": True, "accepted": True, "receiptId": "prior-receipt"})
        self.assertEqual(run_once(self.store, api, self.collector, clock=self.clock), "delivery_waiting")
        self.assertTrue(self.store.has_pending())
        self.assertEqual(self.store.pending(self.clock() + 31)[0]["attempts"], 1)

    def test_draining_old_rejected_receipt_still_permits_next_job(self):
        self.store.enqueue("old-rejected-receipt", empty_result("old-rejected-receipt"), self.clock())
        accepted = []

        def response(payload):
            if payload["receiptId"] == "old-rejected-receipt":
                raise ApiError(400, "crawler_invalid_result")
            accepted.append(payload["receiptId"])
            return {"ok": True, "accepted": True, "receiptId": payload["receiptId"]}

        self.assertEqual(run_once(self.store, self.api(response), self.collector, clock=self.clock), "completed")
        self.assertEqual(self.store.receipt_state("old-rejected-receipt"), "rejected")
        self.assertEqual(self.store.receipt_state(accepted[0]), "acknowledged")


if __name__ == "__main__":
    unittest.main()
