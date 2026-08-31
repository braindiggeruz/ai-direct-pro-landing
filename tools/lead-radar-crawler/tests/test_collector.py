"""Owned memory/socketpair HTTP fixtures. No DNS, remote site, token or Telegram calls."""

import gzip
import hashlib
import http.client
import io
import socket
import ssl
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from collector.client import ApiClient, ApiError, deliver_outbox, run_once
from collector.engine import SCHEMA, Collector, contact_links, iso_time
from collector.state import StateStore
from collector.transport import (FetchError, Policy, Response, SafeTransport, _BoundedResponse,
                                 _PinnedConnection, normalize_url, origin, retry_after_deadline,
                                 validate_public_addresses)
from extractor_support import empty_result, fixture_extractor, identity


PUBLIC_IP = "93.184.216.34"
SITE = "https://fixture-clinic.uz"


class FakeSocket:
    def __init__(self):
        self.timeouts = []

    def settimeout(self, value):
        self.timeouts.append(value)

    def shutdown(self, how):
        pass


class RawResponse:
    def __init__(self, body=b"<html>fixture</html>", status=200, headers=None):
        self.body = io.BytesIO(body)
        self.status = status
        self.headers = headers if headers is not None else [("Content-Type", "text/html")]

    def getheaders(self):
        return self.headers

    def read1(self, count):
        return self.body.read(count)

    def isclosed(self):
        return self.body.closed

    def close(self):
        pass


class MockConnection:
    def __init__(self, raw):
        self.raw, self.sock, self.closed = raw, FakeSocket(), False
        self.requests = []

    def request(self, *args, **kwargs):
        self.requests.append((args, kwargs))

    def getresponse(self):
        return self.raw

    def close(self):
        self.closed = True


class TransportTests(unittest.TestCase):
    def transport(self, responses, addresses=None, policy=None):
        records, connections = [], []
        resolver = Mock(side_effect=addresses or [[PUBLIC_IP]] * 10)

        def connect(*args):
            records.append(args)
            conn = MockConnection(responses.pop(0))
            connections.append(conn)
            return conn

        return SafeTransport(policy, resolver=resolver, connection_factory=connect), records, connections, resolver

    def test_rejects_private_and_mixed_dns(self):
        for private in ["127.0.0.1", "10.1.1.1", "172.16.0.1", "192.168.1.1", "169.254.169.254",
                        "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fc00::1",
                        "::ffff:93.184.216.34", "2002:5db8:d822::1"]:
            with self.subTest(private=private), self.assertRaisesRegex(FetchError, "non_public_address"):
                validate_public_addresses([PUBLIC_IP, private])

    def test_empty_dns_fails(self):
        with self.assertRaisesRegex(FetchError, "dns_unavailable"):
            validate_public_addresses([])

    def test_url_canonicalization(self):
        self.assertEqual(normalize_url("HTTPS://Fixture-Clinic.Uz:443/контакты#x"), SITE + "/%D0%BA%D0%BE%D0%BD%D1%82%D0%B0%D0%BA%D1%82%D1%8B")
        self.assertEqual(origin(SITE + "/contact"), SITE)

    def test_invalid_url_forms(self):
        for url in ["file:///etc/passwd", "http://127.0.0.1", "http://[::1]", "https://fixture.example:8443",
                    "https://user:pass@fixture.example", "https://fixture.example./", "https://local/",
                    "https://fixture.example\\@evil.example", "https://fixture.example/\r\nX:1",
                    "https://fixture.example/%zz\x7f", "http://fixture.example:0/"]:
            with self.subTest(url=url), self.assertRaises(FetchError):
                normalize_url(url)

    def test_actual_connection_is_pinned_and_tls_hostname_is_original(self):
        raw_socket = Mock()
        wrapped_socket = Mock()
        context = Mock()
        context.wrap_socket.return_value = wrapped_socket
        with patch("collector.transport.socket.socket", return_value=raw_socket), \
                patch("collector.transport.ssl.create_default_context", return_value=context):
            conn = _PinnedConnection("fixture.example", 443, PUBLIC_IP, True, 3)
            conn.connect()
            raw_socket.connect.assert_called_once_with((PUBLIC_IP, 443))
            context.wrap_socket.assert_called_once_with(raw_socket, server_hostname="fixture.example", do_handshake_on_connect=False)
            wrapped_socket.do_handshake.assert_called_once()

    def test_fresh_dns_and_pin_on_every_redirect(self):
        transport, records, connections, resolver = self.transport([
            RawResponse(status=302, headers=[("Location", "/contact")]), RawResponse()
        ], addresses=[[PUBLIC_IP], ["1.1.1.1"]])
        result = transport.get(SITE, SITE)
        self.assertEqual(result.url, SITE + "/contact")
        self.assertEqual([r[2] for r in records], [PUBLIC_IP, "1.1.1.1"])
        self.assertEqual(resolver.call_count, 2)
        self.assertTrue(all(c.closed for c in connections))

    def test_dns_rebinding_is_denied_before_second_connection(self):
        transport, records, _, _ = self.transport([RawResponse(status=302, headers=[("Location", "/contact")])],
                                                  addresses=[[PUBLIC_IP], ["127.0.0.1"]])
        with self.assertRaisesRegex(FetchError, "non_public_address"):
            transport.get(SITE, SITE)
        self.assertEqual(len(records), 1)

    def test_cross_origin_redirect_denied(self):
        for location in ["https://evil.example/contact", "http://fixture.example/contact", "//127.0.0.1/contact"]:
            transport, records, _, _ = self.transport([RawResponse(status=302, headers=[("Location", location)])])
            with self.subTest(location=location), self.assertRaises(FetchError):
                transport.get(SITE, SITE)
            self.assertEqual(len(records), 1)

    def test_redirect_to_robots_disallowed_path_is_not_requested(self):
        transport, records, _, _ = self.transport([RawResponse(status=302, headers=[("Location", "/private")])])
        with self.assertRaisesRegex(FetchError, "robots_disallowed"):
            transport.get(SITE, SITE, url_guard=lambda u: not u.endswith("/private"))
        self.assertEqual(len(records), 1)

    def test_redirect_loop_bounded(self):
        transport, records, _, _ = self.transport([RawResponse(status=302, headers=[("Location", "/")]) for _ in range(4)])
        with self.assertRaisesRegex(FetchError, "too_many_redirects"):
            transport.get(SITE, SITE)
        self.assertEqual(len(records), 4)

    def test_gzip_stream_is_bounded_after_decompression(self):
        transport, _, connections, _ = self.transport([
            RawResponse(gzip.compress(b"x" * 20_000), headers=[("Content-Encoding", "gzip")])
        ], policy=Policy(max_body_bytes=100))
        with self.assertRaisesRegex(FetchError, "decoded_body_too_large"):
            transport.get(SITE, SITE)
        self.assertTrue(connections[0].closed)

    def test_wire_limit_without_content_length(self):
        transport, _, _, _ = self.transport([RawResponse(b"x" * 101)], policy=Policy(max_wire_bytes=100))
        with self.assertRaisesRegex(FetchError, "body_too_large"):
            transport.get(SITE, SITE)

    def test_content_length_limit_before_body_read(self):
        response = RawResponse(b"hello", headers=[("Content-Length", "999999999")])
        transport, _, _, _ = self.transport([response])
        with self.assertRaisesRegex(FetchError, "body_too_large"):
            transport.get(SITE, SITE)
        self.assertEqual(response.body.tell(), 0)

    def test_duplicate_length_rejected(self):
        transport, _, _, _ = self.transport([RawResponse(headers=[("Content-Length", "1"), ("content-length", "2")])])
        with self.assertRaisesRegex(FetchError, "ambiguous_headers"):
            transport.get(SITE, SITE)

    def test_incomplete_or_concatenated_gzip_rejected(self):
        for body in [gzip.compress(b"hello")[:-2], gzip.compress(b"a") + gzip.compress(b"b")]:
            transport, _, _, _ = self.transport([RawResponse(body, headers=[("Content-Encoding", "gzip")])])
            with self.assertRaisesRegex(FetchError, "invalid_compression"):
                transport.get(SITE, SITE)

    def test_retry_after_3600_not_capped_to_60(self):
        self.assertEqual(retry_after_deadline("3600", 1000), 4600)
        self.assertEqual(retry_after_deadline("Thu, 01 Jan 1970 02:00:00 GMT", 1000), 7200)
        self.assertIsNone(retry_after_deadline("garbage", 1000))

    def test_rate_limit_body_is_not_downloaded(self):
        raw = RawResponse(b"x" * 10_000, status=429, headers=[("Retry-After", "3600")])
        transport, _, _, _ = self.transport([raw])
        self.assertEqual(transport.get(SITE, SITE).body, b"")
        self.assertEqual(raw.body.tell(), 0)

    def test_header_budget_applied_while_reading(self):
        sock = Mock()
        sock.makefile.return_value = io.BytesIO(b"HTTP/1.1 200 OK\r\nX-Large: " + b"x" * 1000 + b"\r\n\r\n")
        response = _BoundedResponse(sock, header_limit=128)
        with self.assertRaisesRegex(FetchError, "headers_too_large"):
            response.begin()

    def test_header_budget_includes_interim_responses(self):
        sock = Mock()
        sock.makefile.return_value = io.BytesIO(b"HTTP/1.1 100 Continue\r\n\r\n" * 10 + b"HTTP/1.1 200 OK\r\n\r\n")
        with self.assertRaisesRegex(FetchError, "headers_too_large"):
            _BoundedResponse(sock, header_limit=128).begin()

    def test_wire_budget_includes_chunk_extensions_and_trailers(self):
        for chunked in [b"1;" + b"x" * 1000 + b"\r\na\r\n0\r\n\r\n",
                        b"1\r\na\r\n0\r\nX-Trailer:" + b"x" * 1000 + b"\r\n\r\n"]:
            sock = Mock()
            sock.makefile.return_value = io.BytesIO(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n" + chunked)
            response = _BoundedResponse(sock, header_limit=128, wire_limit=100)
            response.begin()
            with self.assertRaisesRegex(FetchError, "body_too_large"):
                while response.read1(100):
                    pass

    def test_real_http_parser_reads_valid_chunked_owned_fixture(self):
        sock = Mock()
        sock.makefile.return_value = io.BytesIO(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
                                               b"5\r\nhello\r\n0\r\n\r\n")
        response = _BoundedResponse(sock, header_limit=128, wire_limit=100)
        response.begin()
        self.assertEqual(response.read1(100), b"hello")
        self.assertEqual(response.read1(100), b"")

    def socketpair_response(self, packet, policy=None):
        # Real HTTPConnection/HTTPResponse + OS socket lifetime, no remote connection.
        # Tiny fixture packets fit the socket buffer before the request is issued.
        client, peer = socket.socketpair()
        client.settimeout(2)
        peer.settimeout(2)
        try:
            peer.sendall(packet)
            peer.shutdown(socket.SHUT_WR)

            class OwnedConnection(http.client.HTTPConnection):
                def connect(self):
                    self.sock = client

            def connect(host, port, ip, tls, timeout):
                return OwnedConnection(host, port, timeout=timeout)

            transport = SafeTransport(policy or Policy(timeout_seconds=2), resolver=lambda *args: [PUBLIC_IP],
                                      connection_factory=connect)
            return transport.get(SITE + "/", SITE)
        finally:
            client.close()
            peer.close()

    def test_connection_close_content_length_eof_keeps_successful_response(self):
        packet = b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 5\r\n\r\nhello"
        response = self.socketpair_response(packet)
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, b"hello")

    def test_connection_close_empty_error_status_and_chunked_lifecycles(self):
        cases = [
            (b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 0\r\n\r\n", 200, b""),
            (b"HTTP/1.1 404 Missing\r\nConnection: close\r\nContent-Length: 5\r\n\r\nhello", 404, b"hello"),
            (b"HTTP/1.1 403 Denied\r\nConnection: close\r\nContent-Length: 5\r\n\r\nhello", 403, b"hello"),
            (b"HTTP/1.1 200 OK\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n", 200, b"hello"),
            (b"HTTP/1.0 200 OK\r\n\r\nhello", 200, b"hello"),
            (b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello", 200, b"hello"),
        ]
        for packet, status, body in cases:
            with self.subTest(status=status, packet=packet[:60]):
                response = self.socketpair_response(packet)
                self.assertEqual((response.status, response.body), (status, body))

    def test_connection_close_still_rejects_truncation_compression_and_limits(self):
        compressed = gzip.compress(b"hello")
        good = b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Encoding: gzip\r\nContent-Length: "
        self.assertEqual(self.socketpair_response(good + str(len(compressed)).encode() + b"\r\n\r\n" + compressed).body, b"hello")
        invalid = compressed[:-2]
        with self.assertRaisesRegex(FetchError, "invalid_compression"):
            self.socketpair_response(good + str(len(invalid)).encode() + b"\r\n\r\n" + invalid)
        with self.assertRaisesRegex(FetchError, "incomplete_body"):
            self.socketpair_response(b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 10\r\n\r\nhello")
        with self.assertRaisesRegex(FetchError, "body_too_large"):
            self.socketpair_response(b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 101\r\n\r\nhello",
                                     Policy(max_wire_bytes=100))
        bomb = gzip.compress(b"x" * 1000)
        with self.assertRaisesRegex(FetchError, "decoded_body_too_large"):
            self.socketpair_response(good + str(len(bomb)).encode() + b"\r\n\r\n" + bomb,
                                     Policy(max_body_bytes=100))

    def test_unexpected_socket_failure_before_eof_is_not_ignored(self):
        conn = MockConnection(RawResponse(b"hello"))
        conn.sock.settimeout = Mock(side_effect=OSError(10038, "owned invalid socket fixture"))
        transport = SafeTransport(resolver=lambda *args: [PUBLIC_IP], connection_factory=lambda *args: conn)
        with self.assertRaisesRegex(FetchError, "transport_error"):
            transport.get(SITE, SITE)
        self.assertTrue(conn.closed)

    def test_total_deadline_checked_during_body_stream(self):
        now = [0.0]
        raw = RawResponse(b"hello")
        original_read = raw.read1

        def slow_read(count):
            now[0] += 21
            return original_read(count)

        raw.read1 = slow_read
        transport, _, connections, _ = self.transport([raw])
        transport.monotonic = lambda: now[0]
        with self.assertRaisesRegex(FetchError, "fetch_timeout"):
            transport.get(SITE, SITE)
        self.assertTrue(connections[0].closed)

    def test_tls_error_is_not_downgraded_or_retried_insecurely(self):
        conn = MockConnection(RawResponse())
        conn.request = Mock(side_effect=ssl.SSLError("owned invalid certificate fixture"))
        transport = SafeTransport(resolver=lambda *args: [PUBLIC_IP], connection_factory=lambda *args: conn)
        with self.assertRaisesRegex(FetchError, "tls_error"):
            transport.get(SITE, SITE)
        self.assertTrue(conn.closed)

    def test_pacing_callbacks_run_on_each_redirect(self):
        transport, _, _, _ = self.transport([
            RawResponse(status=302, headers=[("Location", "/contact")]), RawResponse()
        ])
        events = []
        transport.get(SITE, SITE, before_request=lambda u: events.append(("before", u)),
                      after_response=lambda r: events.append(("after", r.url)))
        self.assertEqual(events, [("before", SITE + "/"), ("after", SITE + "/"),
                                  ("before", SITE + "/contact"), ("after", SITE + "/contact")])

    def test_redirect_pacing_excludes_wait_from_io_timeout_but_not_job_budget(self):
        now = [0.0]
        transport, records, _, _ = self.transport([
            RawResponse(status=302, headers=[("Location", "/contact")]), RawResponse()
        ])
        transport.monotonic = lambda: now[0]

        def pace(url):
            if url.endswith("/contact"):
                now[0] += 30

        result = transport.get(SITE, SITE, before_request=pace, max_total_seconds=120)
        self.assertEqual(result.status, 200)
        self.assertEqual(len(records), 2)
        self.assertLessEqual(records[1][4], 20)

        transport, records, _, _ = self.transport([
            RawResponse(status=302, headers=[("Location", "/contact")]), RawResponse()
        ])
        now[0] = 0
        transport.monotonic = lambda: now[0]
        with self.assertRaisesRegex(FetchError, "fetch_timeout"):
            transport.get(SITE, SITE, before_request=pace, max_total_seconds=25)
        self.assertEqual(len(records), 1)


class Clock:
    def __init__(self):
        self.now = 1_800_000_000.0

    def __call__(self):
        return self.now

    def wait(self, seconds):
        self.now += seconds


class FixtureTransport:
    def __init__(self, responses):
        self.policy, self.responses, self.calls = Policy(), responses, []

    def get(self, url, allowed_origin, *, url_guard=None, before_request=None, after_response=None, max_total_seconds=None):
        self.calls.append(url)
        if url_guard and not url_guard(url):
            raise FetchError("robots_disallowed")
        item = self.responses[url]
        if isinstance(item, Exception):
            raise item
        if before_request:
            before_request(url)
        if after_response:
            after_response(item)
        return item


def html(url, body):
    return Response(url, 200, {"content-type": "text/html; charset=utf-8"}, body.encode())


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "state.sqlite3"
        self.store = StateStore(self.path)
        self.clock = Clock()
        self.extractor = fixture_extractor()
        company_identity, identity_digest = identity(SITE)
        self.job = {"schema": SCHEMA, "id": "job-1", "orgId": "org-1", "companyId": "company-1",
                    "leaseGeneration": 1, "identityDigest": identity_digest, "identity": company_identity, "url": SITE,
                    "deadlineAt": iso_time(self.clock() + 120), "leaseExpiresAt": iso_time(self.clock() + 180),
                    "limits": {"maxPages": 5, "maxPageBytes": 131072, "maxTotalBytes": 524288, "maxRedirects": 3}}

    def tearDown(self):
        self.store.close()
        self.directory.cleanup()

    def collector(self, responses):
        responses = {SITE + "/robots.txt": Response(SITE + "/robots.txt", 404, {}, b""), **responses}
        transport = FixtureTransport(responses)
        return Collector(self.store, transport, clock=self.clock, wait=self.clock.wait, extractor=self.extractor), transport

    def test_collects_home_and_contact_page_without_claiming_contact_truth(self):
        collector, transport = self.collector({SITE + "/": html(SITE + "/", '<a href="/contacts">Contacts</a>'),
                                               SITE + "/contacts": html(SITE + "/contacts", '<a href="https://t.me/company">Telegram</a>')})
        result = collector.collect(self.job)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(result["pages"]), 2)
        self.assertEqual(result["pages"][0]["sha256"], hashlib.sha256(b'<a href="/contacts">Contacts</a>').hexdigest())
        self.assertNotIn("html", result["pages"][0])
        self.assertGreater(result["pages"][0]["bytes"], 0)
        self.assertIsNone(result["binding"])
        self.assertEqual(result["evidence"], [])
        self.assertNotIn("contacts", result)
        self.assertNotIn("sendable", result)
        self.assertEqual(len(self.store.pending(self.clock())), 1)

    def test_contact_link_allowlist(self):
        fixture = '''<a href="/contacts">Contacts</a><a href="/contacts#same">Contacts</a>
            <a href="https://other.example/contact">Contact</a><a href="javascript:alert(1)">Contact</a>
            <a href="/search?q=contact">Contacts</a><a href="/aloqa">Связаться</a><a href="/products">Products</a>'''
        self.assertEqual(contact_links(fixture, SITE + "/", SITE), [SITE + "/contacts", SITE + "/aloqa"])

    def test_robots_unavailable_never_becomes_allow_all(self):
        collector, transport = self.collector({SITE + "/robots.txt": Response(SITE + "/robots.txt", 503, {}, b"")})
        result = collector.collect(self.job)
        self.assertEqual(result["status"], "deferred")
        self.assertEqual(result["pages"], [])
        self.assertEqual(transport.calls, [SITE + "/robots.txt"])

    def test_robots_disallow_prevents_page_call(self):
        collector, transport = self.collector({SITE + "/robots.txt": Response(SITE + "/robots.txt", 200, {},
                                                                               b"User-agent: *\nDisallow: /\n")})
        result = collector.collect(self.job)
        self.assertEqual(result["reason"], "robots_disallowed")
        self.assertEqual(len(transport.calls), 1)

    def test_robots_crawl_delay_persists_without_busy_wait(self):
        self.job["deadlineAt"] = iso_time(self.clock() + 20)
        collector, transport = self.collector({SITE + "/robots.txt": Response(SITE + "/robots.txt", 200, {},
                                                                               b"User-agent: *\nCrawl-delay: 30\n")})
        result = collector.collect(self.job)
        self.assertEqual(result["reason"], "host_cooldown")
        self.assertEqual(self.store.deadline(SITE), self.clock() + 30)
        self.assertEqual(len(transport.calls), 1)

    def test_30_second_robots_pacing_makes_contact_progress_with_heartbeats(self):
        started = self.clock()
        collector, transport = self.collector({
            SITE + "/robots.txt": Response(SITE + "/robots.txt", 200, {}, b"User-agent: *\nCrawl-delay: 30\n"),
            SITE + "/": html(SITE + "/", '<h1>Owned company</h1><a href="/contacts">Contacts</a>'),
            SITE + "/contacts": html(SITE + "/contacts", '<a href="tel:+998901234567">Phone</a>'),
        })
        heartbeats = []
        result = collector.collect(self.job, heartbeat=lambda: heartbeats.append(self.clock()))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(result["pages"]), 2)
        self.assertEqual(transport.calls, [SITE + "/robots.txt", SITE + "/", SITE + "/contacts"])
        self.assertEqual(self.clock() - started, 60)
        self.assertTrue(any(started + 10 <= stamp <= started + 20 for stamp in heartbeats))
        self.assertTrue(any(started + 40 <= stamp <= started + 50 for stamp in heartbeats))

    def test_pacing_that_does_not_fit_deadline_defers_without_waiting(self):
        self.store.save_robots(SITE, "User-agent: *\nCrawl-delay: 30\n", self.clock() + 3600)
        self.store.postpone(SITE, self.clock() + 30, "pacing")
        self.job["deadlineAt"] = iso_time(self.clock() + 20)
        collector, transport = self.collector({})
        started = self.clock()
        result = collector.collect(self.job)
        self.assertEqual(result["status"], "deferred")
        self.assertEqual(result["reason"], "host_cooldown")
        self.assertEqual(result["retryAt"], iso_time(started + 30))
        self.assertEqual(self.clock(), started)
        self.assertEqual(transport.calls, [])

    def test_external_retry_after_is_deferred_even_when_it_fits_job_budget(self):
        self.store.save_robots(SITE, "User-agent: *", self.clock() + 3600)
        self.store.postpone(SITE, self.clock() + 30, "source_rate_limited")
        collector, transport = self.collector({})
        started = self.clock()
        result = collector.collect(self.job)
        self.assertEqual(result["status"], "deferred")
        self.assertEqual(result["retryAt"], iso_time(started + 30))
        self.assertEqual(self.clock(), started)
        self.assertEqual(transport.calls, [])

    def test_rate_limit_and_robots_cache_survive_restart(self):
        collector, transport = self.collector({SITE + "/": Response(SITE + "/", 429, {"retry-after": "3600"}, b"")})
        result = collector.collect(self.job)
        self.assertEqual(result["reason"], "source_rate_limited")
        deadline = self.store.deadline(SITE)
        self.store.close()
        self.store = StateStore(self.path)
        self.assertEqual(self.store.deadline(SITE), deadline)
        self.assertIsNotNone(self.store.robots(SITE, self.clock()))
        collector = Collector(self.store, transport, clock=self.clock, wait=self.clock.wait, extractor=self.extractor)
        calls = len(transport.calls)
        second = collector.collect(self.job)
        self.assertEqual(second["reason"], "host_cooldown")
        self.assertEqual(len(transport.calls), calls)
        self.assertGreaterEqual(deadline - self.clock(), 3600)

    def test_partial_success_preserved_on_later_failure(self):
        collector, _ = self.collector({SITE + "/": html(SITE + "/", '<a href="/contacts">Contacts</a>'),
                                       SITE + "/contacts": FetchError("transport_error")})
        result = collector.collect(self.job)
        self.assertEqual(result["status"], "deferred")
        self.assertEqual(len(result["pages"]), 1)
        self.assertEqual(result["resumeUrls"], [SITE + "/contacts"])
        self.assertIsNotNone(result["retryAt"])

    def test_past_deadline_does_not_fetch(self):
        self.job["deadlineAt"] = iso_time(self.clock() - 1)
        collector, transport = self.collector({})
        result = collector.collect(self.job)
        self.assertIn(result["status"], ("deferred", "failed"))
        self.assertEqual(transport.calls, [])

    def test_nonpublic_security_failure_not_hidden_as_success(self):
        collector, _ = self.collector({SITE + "/robots.txt": FetchError("non_public_address")})
        result = collector.collect(self.job)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["reason"], "non_public_address")

    def test_foreign_resume_url_rejected(self):
        self.job["resumeUrls"] = ["https://evil.example/contact"]
        collector, transport = self.collector({})
        result = collector.collect(self.job)
        self.assertEqual(result["reason"], "invalid_url")
        self.assertEqual(transport.calls, [])

    def test_utf8_size_checked_after_legacy_charset_conversion(self):
        self.job["limits"]["maxPageBytes"] = 100
        collector, _ = self.collector({SITE + "/": Response(SITE + "/", 200,
                                                               {"content-type": "text/html;charset=windows-1251"}, b"<p>" + b"\xd0" * 80 + b"</p>")})
        result = collector.collect(self.job)
        self.assertEqual(result["reason"], "body_too_large")
        self.assertEqual(result["pages"], [])

    def test_immutable_receipt_conflict_and_idempotent_enqueue(self):
        self.store.enqueue("r1", {"value": 1}, self.clock())
        self.store.enqueue("r1", {"value": 1}, self.clock())
        with self.assertRaisesRegex(ValueError, "receipt_payload_conflict"):
            self.store.enqueue("r1", {"value": 2}, self.clock())
        self.assertEqual(len(self.store.pending(self.clock())), 1)

    def test_later_short_cooldown_does_not_shorten_existing_deadline(self):
        self.store.postpone(SITE, self.clock() + 3600, "rate_limit")
        self.store.postpone(SITE, self.clock() + 30, "pacing")
        self.assertEqual(self.store.deadline(SITE), self.clock() + 3600)

    def test_delivery_retries_same_receipt_after_restart_without_refetch(self):
        payload = empty_result()
        self.store.enqueue("r1", payload, self.clock())
        api = Mock()
        api.post.side_effect = ApiError(503, "unavailable")
        self.assertFalse(deliver_outbox(self.store, api, clock=self.clock))
        self.store.close()
        self.store = StateStore(self.path)
        self.clock.wait(30)
        api.post.side_effect = None
        api.post.return_value = {"ok": True, "receiptId": "r1", "accepted": True}
        self.assertTrue(deliver_outbox(self.store, api, clock=self.clock))
        self.assertEqual(api.post.call_args.args, ("result", payload))

    def test_wrong_ack_is_not_success(self):
        self.store.enqueue("r1", empty_result(), self.clock())
        api = Mock()
        api.post.return_value = {"ok": True, "accepted": True, "receiptId": "other"}
        self.assertFalse(deliver_outbox(self.store, api, clock=self.clock))
        self.assertTrue(self.store.has_pending())

    def test_http_error_body_timeout_preserves_status_and_full_retry_after(self):
        for body_error in (TimeoutError("fixture_timeout"), OSError("fixture_read_error")):
            with self.subTest(body_error=type(body_error).__name__):
                payload = empty_result("fixture-error-receipt")
                self.store.enqueue(payload["receiptId"], payload, self.clock())
                body = Mock()
                body.read.side_effect = body_error
                error = HTTPError(SITE + "/api/lead-radar/crawler/result", 503, "fixture unavailable",
                                  {"Retry-After": "3600"}, body)
                api = ApiClient(SITE + "/api/lead-radar/crawler", "lrcr_" + "a" * 64, clock=self.clock)
                api.opener = Mock()
                api.opener.open.side_effect = error
                self.assertFalse(deliver_outbox(self.store, api, clock=self.clock))
                row = self.store.db.execute("SELECT next_attempt_at,last_error,attempts FROM outbox WHERE receipt_id=?",
                                            (payload["receiptId"],)).fetchone()
                self.assertEqual(row["next_attempt_at"], self.clock() + 3600)
                self.assertEqual(row["last_error"], "api_error")
                self.assertGreaterEqual(row["attempts"], 1)
                self.clock.wait(3600)
                with self.assertRaises(ApiError) as captured:
                    api.post("result", payload)
                self.assertEqual(captured.exception.status, 503)
                self.assertEqual(captured.exception.retry_at, self.clock() + 3600)

    def test_terminal_conflict_is_quarantined_not_retried_forever(self):
        self.store.enqueue("r1", empty_result(), self.clock())
        api = Mock()
        api.post.side_effect = ApiError(409, "crawler_lease_lost")
        self.assertTrue(deliver_outbox(self.store, api, clock=self.clock))
        self.assertFalse(self.store.has_pending())
        self.assertEqual(self.store.db.execute("SELECT state FROM outbox").fetchone()[0], "rejected")

    def test_no_claim_while_previous_result_awaits_delivery(self):
        self.store.enqueue("r1", empty_result(), self.clock())
        self.store.retry("r1", self.clock() + 100, "unavailable")
        api = Mock()
        self.assertEqual(run_once(self.store, api, clock=self.clock), "delivery_waiting")
        api.post.assert_not_called()

    def test_missing_configuration_fails_without_network(self):
        with patch("collector.client.build_opener") as opener:
            with self.assertRaises((ValueError, FetchError)):
                ApiClient("", "")
            opener.assert_not_called()

    def test_base_requires_https_exact_route(self):
        for base in ["http://fixture.example/api/lead-radar/crawler", SITE + "/wrong", SITE + "/api/lead-radar/crawler?x=1"]:
            with self.subTest(base=base), self.assertRaises(ValueError):
                ApiClient(base, "lrcr_" + "a" * 64)

    def test_token_requires_exact_dedicated_format(self):
        for token in ["x" * 32, "lrcr_" + "A" * 64, "lrcr_" + "a" * 63, "lrcr_" + "a" * 65,
                      "Bearer lrcr_" + "a" * 64, "lrcr_" + "a" * 64 + "\n"]:
            with self.subTest(token=token[:10]), self.assertRaisesRegex(ValueError, "invalid dedicated"):
                ApiClient(SITE + "/api/lead-radar/crawler", token)
        with patch("collector.client.build_opener"):
            ApiClient(SITE + "/api/lead-radar/crawler", "lrcr_" + "a" * 64)

    def test_discovery_stops_at_terminal_page_budget(self):
        self.job["limits"]["maxPages"] = 2
        collector, _ = self.collector({SITE + "/": html(SITE + "/", '<a href="/contact1">Contacts</a>'),
                                       SITE + "/contact1": html(SITE + "/contact1", '<a href="/contact2">Contacts</a>')})
        result = collector.collect(self.job)
        self.assertEqual(result["status"], "completed")  # discovery itself is bounded to this two-page budget
        self.assertIsNone(result["retryAt"])
        self.assertEqual(result["resumeUrls"], [])

    def test_omitted_resume_urls_finish_bounded_partial_without_queue(self):
        self.job["limits"]["maxPages"] = 1
        self.job["resumeUrls"] = [SITE + "/contacts"]
        collector, _ = self.collector({SITE + "/": html(SITE + "/", '<h1>Owned homepage</h1>')})
        result = collector.collect(self.job)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["reason"], "page_limit")
        self.assertEqual(result["resumeUrls"], [])
        self.assertIsNone(result["retryAt"])

    def test_empty_or_nul_html_never_invalidates_server_envelope(self):
        for body in ["  \n", "<html>nul\x00fixture</html>"]:
            collector, _ = self.collector({SITE + "/": html(SITE + "/", body)})
            result = collector.collect(self.job)
            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["pages"], [])
            self.assertEqual(result["reason"], "invalid_response")

    def test_duplicate_final_url_from_alias_not_sent_twice(self):
        collector, _ = self.collector({SITE + "/": html(SITE + "/", '<a href="/contacts">Contacts</a>'),
                                       SITE + "/contacts": html(SITE + "/", '<h1>Redirected homepage</h1>')})
        result = collector.collect(self.job)
        self.assertEqual(len(result["pages"]), 1)
        self.assertEqual(result["status"], "completed")

    def test_terminal_rows_clear_html_but_preserve_receipt_digest(self):
        for receipt_id, terminal in (("ack", self.store.acknowledge), ("reject", lambda key: self.store.reject(key, "lease_lost"))):
            payload = {"html": "owned raw HTML fixture", "receiptId": receipt_id}
            self.store.enqueue(receipt_id, payload, self.clock())
            digest = self.store.db.execute("SELECT digest FROM outbox WHERE receipt_id=?", (receipt_id,)).fetchone()[0]
            terminal(receipt_id)
            row = self.store.db.execute("SELECT payload,digest FROM outbox WHERE receipt_id=?", (receipt_id,)).fetchone()
            self.assertEqual(row["payload"], "{}")
            self.assertEqual(row["digest"], digest)
            self.store.enqueue(receipt_id, payload, self.clock())  # tombstone is still idempotent
            with self.assertRaisesRegex(ValueError, "receipt_payload_conflict"):
                self.store.enqueue(receipt_id, {"html": "different"}, self.clock())

    def test_pending_retention_quarantines_unknown_outcome_without_ack(self):
        self.store.enqueue("old", {"html": "old owned fixture"}, self.clock() - 7 * 86400)
        self.store.enqueue("fresh", {"html": "fresh owned fixture"}, self.clock())
        report = self.store.maintenance(self.clock())
        self.assertEqual(report["expired_pending"], 1)
        old = self.store.db.execute("SELECT * FROM outbox WHERE receipt_id='old'").fetchone()
        self.assertEqual(old["state"], "rejected")
        self.assertEqual(old["last_error"], "pending_retention_expired")
        self.assertEqual(old["payload"], "{}")
        self.assertEqual(self.store.pending(self.clock())[0]["payload"], {"html": "fresh owned fixture"})

    def test_maintenance_never_shortens_live_source_deadline(self):
        self.store.postpone(SITE, self.clock() + 3600, "rate_limit")
        self.store.postpone("https://expired.example", self.clock() - 1, "pacing")
        self.store.save_robots(SITE, "User-agent: *", self.clock() + 60)
        self.store.save_robots("https://expired.example", "owned old robots", self.clock() - 1)
        report = self.store.maintenance(self.clock())
        self.assertEqual(report["expired_cooldowns"], 1)
        self.assertEqual(report["expired_robots"], 1)
        self.assertEqual(self.store.deadline(SITE), self.clock() + 3600)
        self.assertIsNotNone(self.store.robots(SITE, self.clock()))

    def test_pending_retry_keeps_exact_serialized_bytes(self):
        self.store.enqueue("pending", {"html": '<a href="/contacts">Связь</a>', "receiptId": "pending"}, self.clock())
        before = self.store.db.execute("SELECT payload FROM outbox WHERE receipt_id='pending'").fetchone()[0]
        self.store.retry("pending", self.clock() + 3600, "control_unavailable")
        self.store.maintenance(self.clock())
        after = self.store.db.execute("SELECT payload FROM outbox WHERE receipt_id='pending'").fetchone()[0]
        self.assertEqual(before.encode("utf-8"), after.encode("utf-8"))

    def test_local_run_lease_prevents_parallel_claims_and_recovers_after_crash(self):
        owner = self.store.acquire_run(self.clock(), ttl=60)
        self.assertIsNotNone(owner)
        self.assertIsNone(self.store.acquire_run(self.clock(), ttl=60))
        api = Mock()
        self.assertEqual(run_once(self.store, api, clock=self.clock), "worker_busy")
        api.post.assert_not_called()
        self.clock.wait(61)
        next_owner = self.store.acquire_run(self.clock(), ttl=60)
        self.assertIsNotNone(next_owner)
        self.store.release_run(owner)
        self.assertIsNone(self.store.acquire_run(self.clock()))
        self.store.release_run(next_owner)
        self.assertIsNotNone(self.store.acquire_run(self.clock()))

    def test_malformed_claim_never_reaches_collector(self):
        api, collector = Mock(), Mock()
        api.post.return_value = {"ok": True, "job": {"schema": SCHEMA}}
        with self.assertRaisesRegex(ApiError, "invalid_claim_response"):
            run_once(self.store, api, collector, clock=self.clock)
        collector.collect.assert_not_called()

    def test_result_json_envelope_stays_bounded(self):
        import json
        # Quotes can double in JSON despite the HTML-only UTF-8 limits.
        large = '"' * 130_000
        responses = {SITE + "/": html(SITE + "/", large + ''.join(
            f'<a href="/contact{i}">Contact</a>' for i in range(4)))}
        responses.update({SITE + f"/contact{i}": html(SITE + f"/contact{i}", large) for i in range(4)})
        collector, _ = self.collector(responses)
        result = collector.collect(self.job)
        self.assertLess(len(json.dumps(result, ensure_ascii=False).encode()), 786432)
        self.assertEqual(result["status"], "partial")

    def test_invalid_runtime_version_fails_closed(self):
        with patch("collector.engine.version", return_value="99.0"):
            with self.assertRaisesRegex(ValueError, "unsupported_scrapling_version"):
                Collector(self.store)


if __name__ == "__main__":
    unittest.main()
