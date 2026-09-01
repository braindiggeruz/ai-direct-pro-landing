"""Cross-language envelopes built by the real collector, using owned fixtures."""

import json
import tempfile
import unittest
from pathlib import Path

from collector.engine import SCHEMA, Collector, iso_time
from collector.state import StateStore
from collector.transport import Response
from test_collector import Clock, FixtureTransport, html
from extractor_support import fixture_extractor, identity

# Public URL syntax for cross-language validators; FixtureTransport intercepts
# every request, so this synthetic hostname is never resolved or contacted.
SITE = "https://fixture-clinic.uz"


def build_contract_fixtures():
    cases = []
    homepage = '<h1>Fixture Dental</h1><a href="tel:+998901234567">+998 90 123 45 67</a><a href="/contacts">Contacts</a>'

    def job(name, clock, generation=1, resume=None):
        company_identity, identity_digest = identity(SITE)
        return {"schema": SCHEMA, "id": "job-" + name, "orgId": "org-1", "companyId": "company-1",
                "identityDigest": identity_digest, "identity": company_identity, "url": SITE + "/", "leaseGeneration": generation,
                "leaseExpiresAt": iso_time(clock() + 180), "deadlineAt": iso_time(clock() + 120),
                "limits": {"maxPages": 5, "maxPageBytes": 131072, "maxTotalBytes": 524288, "maxRedirects": 3},
                "resumeUrls": resume or []}

    with tempfile.TemporaryDirectory() as directory:
        for index, name in enumerate(("completed", "deferred_with_pages", "terminal_partial", "failed"), 1):
            clock = Clock()
            store = StateStore(Path(directory) / (name + ".sqlite3"))
            try:
                responses = {SITE + "/robots.txt": Response(SITE + "/robots.txt", 404, {}, b""),
                             SITE + "/": html(SITE + "/", homepage),
                             SITE + "/contacts": html(SITE + "/contacts", '<h1>Contact us</h1><a href="tel:+998901234568">Phone</a>')}
                if name == "deferred_with_pages":
                    responses[SITE + "/contacts"] = Response(SITE + "/contacts", 429, {"retry-after": "3600"}, b"")
                elif name == "terminal_partial":
                    responses[SITE + "/contacts"] = Response(SITE + "/contacts", 200, {"content-type": "application/pdf"}, b"owned fixture")
                elif name == "failed":
                    responses[SITE + "/robots.txt"] = Response(SITE + "/robots.txt", 200, {}, b"User-agent: *\nDisallow: /\n")
                transport = FixtureTransport(responses)
                collector = Collector(store, transport, clock=clock, wait=clock.wait, extractor=fixture_extractor())
                claimed_job = job(name, clock)
                result = collector.collect(claimed_job, receipt_id=f"00000000-0000-4000-8000-{index:012d}")
                cases.append({"name": name, "job": claimed_job, "result": result})
                if name == "deferred_with_pages":
                    clock.wait(3601)
                    responses[SITE + "/"] = html(SITE + "/", homepage + '<p>Fresh second-generation ownership anchor.</p>')
                    responses[SITE + "/contacts"] = html(SITE + "/contacts", '<h1>Contact us</h1><a href="tel:+998901234568">Phone</a>')
                    resumed_job = job(name, clock, generation=2, resume=result["resumeUrls"])
                    transport.calls.clear()
                    resumed = collector.collect(resumed_job, receipt_id="00000000-0000-4000-8000-000000000005")
                    cases.append({"name": "resumed_with_fresh_root", "job": resumed_job, "result": resumed})
                    assert transport.calls[:2] == [SITE + "/", SITE + "/contacts"]
                    assert resumed["pages"][0]["fetchedAt"] > result["pages"][0]["fetchedAt"]
                    assert resumed["pages"][0]["sha256"] != result["pages"][0]["sha256"]
            finally:
                store.close()
    return {"fixtureSchema": "gptbot.lead-radar.crawler.fixtures.v2",
            "company": {"id": "company-1", "name": "Fixture Dental", "website": SITE + "/",
                        "phone": "+998901234567", "city": "Tashkent", "address": "Fixture Street 1"},
            "cases": cases}


class ProtocolFixtureTests(unittest.TestCase):
    def test_checked_in_envelopes_match_real_engine(self):
        expected = json.loads((Path(__file__).parent / "fixtures" / "crawler-protocol.json").read_text(encoding="utf-8"))
        self.assertEqual(build_contract_fixtures(), expected)

    def test_continuation_is_deferred_even_with_pages(self):
        cases = {case["name"]: case["result"] for case in build_contract_fixtures()["cases"]}
        self.assertEqual(cases["deferred_with_pages"]["status"], "deferred")
        self.assertEqual(len(cases["deferred_with_pages"]["pages"]), 1)
        self.assertTrue(cases["deferred_with_pages"]["retryAt"])
        self.assertEqual(cases["deferred_with_pages"]["resumeUrls"], [SITE + "/contacts"])
        for name in ("completed", "terminal_partial", "failed", "resumed_with_fresh_root"):
            self.assertIsNone(cases[name]["retryAt"])
            self.assertEqual(cases[name]["resumeUrls"], [])


if __name__ == "__main__":
    unittest.main()
