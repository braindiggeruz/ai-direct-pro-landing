"""Public-only HTTP transport with DNS pinning, no proxies or browser execution.

Scrapling's ordinary fetchers are deliberately not the security boundary. This
transport validates DNS and connects a numeric sockaddr, while TLS still checks
the original hostname. Redirects are manually revalidated, never auto-followed.
"""

from __future__ import annotations

import http.client
import ipaddress
import queue
import socket
import ssl
import threading
import time
import zlib
from functools import partial
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from urllib.parse import quote, urljoin, urlsplit, urlunsplit


class FetchError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class Policy:
    max_body_bytes: int = 600_000
    max_wire_bytes: int = 600_000
    max_header_bytes: int = 32_768
    timeout_seconds: float = 20.0
    max_redirects: int = 3
    user_agent: str = "GPTBotLeadRadar/0.1 (+https://gptbot.uz/)"


@dataclass(frozen=True)
class Response:
    url: str
    status: int
    headers: dict[str, str]
    body: bytes


def normalize_url(url: str) -> str:
    if not isinstance(url, str) or len(url) > 2048 or any(ord(c) < 33 or ord(c) == 127 for c in url):
        raise FetchError("invalid_url")
    if "\\" in url:
        raise FetchError("invalid_url")
    try:
        parts = urlsplit(url)
        if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
            raise ValueError()
        if parts.username is not None or parts.password is not None:
            raise ValueError()
        host = parts.hostname.encode("idna").decode("ascii").lower()
        if host.endswith(".") or "%" in host or len(host) > 253:
            raise ValueError()
        # Domain names only. Numeric IP URLs are not official-site candidates.
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise ValueError()
        if "." not in host or any(not label or len(label) > 63 or label.startswith("-") or
                                  label.endswith("-") or any(not (c.isalnum() or c == "-") for c in label)
                                  for label in host.split(".")):
            raise ValueError()
        default_port = 443 if parts.scheme.lower() == "https" else 80
        if parts.port not in (None, default_port):
            raise ValueError()
        return urlunsplit((parts.scheme.lower(), host, quote(parts.path or "/", safe="/%:@!$&'()*+,;=-._~"),
                           quote(parts.query, safe="/%?:@!$&'()*+,;=-._~"), ""))
    except (ValueError, UnicodeError):
        raise FetchError("invalid_url") from None


def origin(url: str) -> str:
    parts = urlsplit(normalize_url(url))
    return f"{parts.scheme}://{parts.netloc}"


def validate_public_addresses(addresses: list[str]) -> list[str]:
    if not addresses or len(addresses) > 64:
        raise FetchError("dns_unavailable")
    result = []
    for value in addresses:
        try:
            ip = ipaddress.ip_address(value)
        except ValueError:
            raise FetchError("dns_invalid") from None
        if (not ip.is_global or ip.is_multicast or ip.is_reserved or ip.is_unspecified or
                ip.is_loopback or ip.is_link_local or ip.is_private or
                (isinstance(ip, ipaddress.IPv6Address) and
                 (ip.ipv4_mapped is not None or ip.sixtofour is not None or ip.teredo is not None))):
            raise FetchError("non_public_address")
        result.append(str(ip))
    return list(dict.fromkeys(result))


_DNS_SLOTS = threading.BoundedSemaphore(2)


def resolve_public(host: str, port: int, timeout: float) -> list[str]:
    """A bounded daemon resolver: a wedged OS DNS lookup cannot block exit.

    At most two outstanding lookups survive caller timeouts. When occupied,
    subsequent jobs defer rather than creating an unbounded thread queue.
    """
    if not _DNS_SLOTS.acquire(blocking=False):
        raise FetchError("dns_busy")
    result: queue.Queue = queue.Queue(maxsize=1)

    def resolve() -> None:
        try:
            records = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
            result.put((True, [r[4][0] for r in records]))
        except OSError:
            result.put((False, []))
        finally:
            _DNS_SLOTS.release()

    threading.Thread(target=resolve, daemon=True, name="collector-dns").start()
    try:
        ok, addresses = result.get(timeout=max(timeout, 0.001))
    except queue.Empty:
        raise FetchError("dns_timeout") from None
    if not ok:
        raise FetchError("dns_unavailable")
    return validate_public_addresses(addresses)


def retry_after_deadline(value: str | None, now: float) -> float | None:
    if not value:
        return None
    value = value.strip()
    try:
        if value.isdigit():
            # No 60-second cap. Preserve the server's full absolute deadline.
            seconds = int(value)
            if seconds > 315_576_000:
                return float("inf")  # never shorten an implausibly long server deadline
            return now + seconds
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            return None
        return max(now, parsed.timestamp())
    except (ValueError, TypeError, OverflowError):
        return None


class _PinnedConnection(http.client.HTTPConnection):
    def __init__(self, host: str, port: int, ip: str, tls: bool, timeout: float):
        # HTTPConnection serializes Host using default_port; TLS must use HTTPS's
        # default without changing the pinned destination or other instances.
        self.default_port = 443 if tls else 80
        super().__init__(host, port, timeout=timeout)
        self.ip = ip
        self.tls = tls

    def connect(self) -> None:
        ip = ipaddress.ip_address(self.ip)
        sock = socket.socket(socket.AF_INET6 if ip.version == 6 else socket.AF_INET, socket.SOCK_STREAM)
        try:
            self.sock = sock
            sock.settimeout(self.timeout)
            sock.connect((self.ip, self.port))  # numeric sockaddr; no second DNS lookup
            if self.tls:
                context = ssl.create_default_context()
                sock = context.wrap_socket(sock, server_hostname=self.host, do_handshake_on_connect=False)
                self.sock = sock
                sock.do_handshake()
            self.sock = sock
        except BaseException:
            sock.close()
            raise


class _HeaderBudgetReader:
    def __init__(self, wrapped, limit: int, wire_limit: int):
        self.wrapped, self.remaining, self.headers = wrapped, limit, True
        self.wire_remaining = wire_limit

    def _body_count(self, value):
        self.wire_remaining -= len(value)
        if self.wire_remaining < 0:
            raise FetchError("body_too_large")
        return value

    def _body_size(self, requested):
        return min(requested, self.wire_remaining + 1) if requested >= 0 else self.wire_remaining + 1

    def readline(self, limit: int = -1):
        if not self.headers:
            return self._body_count(self.wrapped.readline(self._body_size(limit)))
        line = self.wrapped.readline(min(limit, self.remaining + 1) if limit >= 0 else self.remaining + 1)
        self.remaining -= len(line)
        if self.remaining < 0:
            raise FetchError("headers_too_large")
        return line

    def read(self, size=-1):
        return self._body_count(self.wrapped.read(self._body_size(size)))

    def read1(self, size=-1):
        return self._body_count(self.wrapped.read1(self._body_size(size)))

    def readinto(self, buffer):
        count = self.wrapped.readinto(memoryview(buffer)[:self._body_size(len(buffer))])
        self.wire_remaining -= count
        if self.wire_remaining < 0:
            raise FetchError("body_too_large")
        return count

    def __getattr__(self, name):
        return getattr(self.wrapped, name)


class _BoundedResponse(http.client.HTTPResponse):
    def __init__(self, *args, header_limit: int, wire_limit: int = 600_000, **kwargs):
        super().__init__(*args, **kwargs)
        self.fp = _HeaderBudgetReader(self.fp, header_limit, wire_limit)

    def begin(self):
        super().begin()
        if self.fp:
            self.fp.headers = False


class SafeTransport:
    def __init__(self, policy: Policy | None = None, *, resolver=resolve_public,
                 connection_factory=_PinnedConnection, monotonic=time.monotonic):
        self.policy = policy or Policy()
        self.resolver = resolver
        self.connection_factory = connection_factory
        self.monotonic = monotonic

    def _remaining(self, deadline: float) -> float:
        remaining = deadline - self.monotonic()
        if remaining <= 0:
            raise FetchError("fetch_timeout")
        return remaining

    def get(self, url: str, allowed_origin: str, *, url_guard=None, before_request=None, after_response=None,
            max_total_seconds: float | None = None) -> Response:
        url = normalize_url(url)
        allowed_origin = origin(allowed_origin)
        started = self.monotonic()
        deadline = started + self.policy.timeout_seconds
        hard_deadline = started + max_total_seconds if max_total_seconds is not None else deadline
        deadline = min(deadline, hard_deadline)
        for redirect in range(self.policy.max_redirects + 1):
            if origin(url) != allowed_origin:
                raise FetchError("cross_origin_url")
            if url_guard is not None and not url_guard(url):
                raise FetchError("robots_disallowed")
            if before_request is not None:
                before_wait = self.monotonic()
                before_request(url)
                # Intentional robots pacing does not consume HTTP I/O timeout,
                # but it always consumes the caller's overall job deadline.
                deadline = min(hard_deadline, deadline + max(0, self.monotonic() - before_wait))
            response = self._request(url, deadline)
            if after_response is not None:
                after_response(response)
            if response.status not in (301, 302, 303, 307, 308):
                return response
            if redirect == self.policy.max_redirects:
                raise FetchError("too_many_redirects")
            location = response.headers.get("location")
            if not location:
                raise FetchError("redirect_without_location")
            url = normalize_url(urljoin(url, location))
        raise FetchError("too_many_redirects")

    def _request(self, url: str, deadline: float) -> Response:
        parts = urlsplit(url)
        port = 443 if parts.scheme == "https" else 80
        addresses = validate_public_addresses(self.resolver(parts.hostname, port, self._remaining(deadline)))
        conn = self.connection_factory(parts.hostname, port, addresses[0], parts.scheme == "https",
                                       self._remaining(deadline))
        conn.response_class = partial(_BoundedResponse, header_limit=self.policy.max_header_bytes,
                                      wire_limit=self.policy.max_wire_bytes)
        active_socket = [None]

        def abort_at_deadline():
            sock = active_socket[0] or conn.sock
            if sock:
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass

        watchdog = threading.Timer(self._remaining(deadline), abort_at_deadline)
        watchdog.daemon = True
        watchdog.start()
        raw = None
        try:
            target = parts.path + (f"?{parts.query}" if parts.query else "")
            conn.request("GET", target, headers={"User-Agent": self.policy.user_agent,
                         "Accept": "text/html,text/plain,application/xhtml+xml;q=0.9",
                         "Accept-Encoding": "gzip, deflate", "Connection": "close"})
            active_socket[0] = conn.sock
            if active_socket[0]:
                active_socket[0].settimeout(self._remaining(deadline))
            raw = conn.getresponse()
            pairs = raw.getheaders()
            if sum(len(k) + len(v) + 4 for k, v in pairs) > self.policy.max_header_bytes:
                raise FetchError("headers_too_large")
            headers = {k.lower(): v for k, v in pairs}
            if len([k for k, _ in pairs if k.lower() in ("content-length", "content-encoding", "location")]) != \
                    len({k.lower() for k, _ in pairs if k.lower() in ("content-length", "content-encoding", "location")}):
                raise FetchError("ambiguous_headers")
            if "transfer-encoding" in headers and "content-length" in headers:
                raise FetchError("ambiguous_headers")
            if raw.status in (301, 302, 303, 307, 308, 429, 503):
                return Response(url, raw.status, headers, b"")
            length = headers.get("content-length")
            if length and (not length.isdigit() or int(length) > self.policy.max_wire_bytes):
                raise FetchError("body_too_large")
            encoding = headers.get("content-encoding", "identity").strip().lower()
            if encoding not in ("identity", "gzip", "deflate"):
                raise FetchError("unsupported_content_encoding")
            decoder = zlib.decompressobj(16 + zlib.MAX_WBITS if encoding == "gzip" else zlib.MAX_WBITS) \
                if encoding != "identity" else None
            body = bytearray()
            wire_size = 0
            while True:
                remaining = self._remaining(deadline)
                # read1() closes HTTPResponse at exact Content-Length EOF, which
                # can also release the final socket handle after Connection: close.
                # Do not set a timeout on that closed handle. Length/compression/
                # deadline validation below still rejects incomplete responses.
                if raw.isclosed():
                    break
                # HTTPResponse retains the socket file even with Connection: close.
                if active_socket[0]:
                    active_socket[0].settimeout(remaining)
                chunk = raw.read1(min(16_384, self.policy.max_wire_bytes - wire_size + 1))
                if not chunk:
                    break
                wire_size += len(chunk)
                if wire_size > self.policy.max_wire_bytes:
                    raise FetchError("body_too_large")
                output = decoder.decompress(chunk, self.policy.max_body_bytes - len(body) + 1) if decoder else chunk
                body.extend(output)
                if len(body) > self.policy.max_body_bytes or (decoder and decoder.unconsumed_tail):
                    raise FetchError("decoded_body_too_large")
            self._remaining(deadline)
            if decoder and (not decoder.eof or decoder.unused_data):
                raise FetchError("invalid_compression")
            if length and wire_size != int(length):
                raise FetchError("incomplete_body")
            return Response(url, raw.status, headers, bytes(body))
        except FetchError:
            raise
        except (socket.timeout, TimeoutError):
            raise FetchError("fetch_timeout") from None
        except ssl.SSLError:
            raise FetchError("tls_error") from None
        except (OSError, http.client.HTTPException, zlib.error, ValueError):
            raise FetchError("transport_error") from None
        finally:
            watchdog.cancel()
            if raw is not None:
                raw.close()
            conn.close()
