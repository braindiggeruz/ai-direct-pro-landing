from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable

from .protocol import (
    CAPABILITIES,
    COMMAND_ID,
    DEFAULT_POLL_SECONDS,
    SCHEMA,
    BridgeCommand,
    ProtocolError,
    canonical_json,
    https_base_url,
    parse_poll_response,
    signed_headers,
    strict_json,
    verify_registration_response,
    verify_signed_response,
)


REGISTER_PATH = "/v1/bridge/register"
POLL_PATH = "/v1/bridge/poll"
RESULT_PATH_PREFIX = "/v1/bridge/commands/"
PRODUCTION_ORIGINS = frozenset({
    "https://gptbot-lead-radar-telegram-account.braindigger-uz.workers.dev",
    # Retained for a no-session-loss cutover once the owner grants the
    # Cloudflare token Zone/Workers Routes Edit.
    "https://lead-radar-bridge.gptbot.uz",
})
MAX_RESPONSE_BYTES = 512_000
MAX_MEDIA_RESPONSE_BYTES = 5_000_000


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: dict[str, str]
    body: bytes


Transport = Callable[[str, str, dict[str, str], bytes, int], HttpResponse]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


def system_https_transport(
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes,
    maximum: int,
) -> HttpResponse:
    # Cloudflare rejects urllib's default ``Python-urllib/*`` fingerprint with
    # Error 1010 before the request reaches the Worker.  Identify the installed
    # first-party client explicitly; authenticated bridge routes still require
    # their device HMAC, so this header grants no access by itself.
    request_headers = {
        "User-Agent": "GPTBot-LeadRadar-Telegram-Bridge/1.1.2",
        **headers,
    }
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers=request_headers,
    )
    context = ssl.create_default_context()
    try:
        opener = urllib.request.build_opener(
            _NoRedirect(),
            urllib.request.HTTPSHandler(context=context),
        )
        with opener.open(request, timeout=40) as response:
            declared = int(response.headers.get("Content-Length", "0") or "0")
            if declared > maximum:
                raise ProtocolError("response_too_large")
            raw = response.read(maximum + 1)
            if len(raw) > maximum:
                raise ProtocolError("response_too_large")
            return HttpResponse(
                status=response.status,
                headers={key.lower(): value for key, value in response.headers.items()},
                body=raw,
            )
    except urllib.error.HTTPError as error:
        raw = error.read(min(maximum + 1, 64_001))
        return HttpResponse(
            status=error.code,
            headers={key.lower(): value for key, value in error.headers.items()},
            body=raw,
        )


@dataclass(frozen=True)
class RegisteredDevice:
    device_id: str
    poll_after_seconds: int


class MailboxClient:
    def __init__(
        self,
        origin: str,
        *,
        device_id: str | None = None,
        device_secret: bytes | None = None,
        transport: Transport = system_https_transport,
        allowed_origins: frozenset[str] = PRODUCTION_ORIGINS,
    ) -> None:
        self.origin = https_base_url(origin)
        if self.origin not in allowed_origins:
            raise ProtocolError("server_origin_not_allowed")
        self.device_id = device_id
        self.device_secret = device_secret
        self._transport = transport

    def register(self, body: dict[str, object]) -> RegisteredDevice:
        raw = canonical_json(body)
        response = self._transport(
            "POST",
            self.origin + REGISTER_PATH,
            {
                "Content-Type": "application/json; charset=utf-8",
                "Accept": "application/json",
                "Cache-Control": "no-store",
            },
            raw,
            MAX_RESPONSE_BYTES,
        )
        if response.status != 201:
            raise ProtocolError("registration_rejected")
        parsed = strict_json(response.body)
        if set(parsed) != {"schema", "status", "device_id", "poll_after_seconds"}:
            raise ProtocolError("registration_response_invalid")
        if parsed.get("schema") != SCHEMA or parsed.get("status") != "registered":
            raise ProtocolError("registration_response_invalid")
        device_id = parsed.get("device_id")
        delay = parsed.get("poll_after_seconds")
        from .protocol import DEVICE_ID
        if not isinstance(device_id, str) or not DEVICE_ID.fullmatch(device_id):
            raise ProtocolError("registration_response_invalid")
        if not isinstance(delay, int) or isinstance(delay, bool) or not 15 <= delay <= 60:
            raise ProtocolError("registration_response_invalid")
        pairing_id = body.get("pairing_id")
        encoded_secret = body.get("device_secret")
        if not isinstance(pairing_id, str) or not isinstance(encoded_secret, str):
            raise ProtocolError("registration_response_invalid")
        from .protocol import b64url_decode
        verify_registration_response(
            headers=response.headers,
            pairing_id=pairing_id,
            device_id=device_id,
            device_secret=b64url_decode(encoded_secret, minimum=32, maximum=32),
            request_body=raw,
            response_body=response.body,
        )
        return RegisteredDevice(device_id, delay)

    def _signed_post(
        self,
        path: str,
        raw: bytes,
        maximum: int,
    ) -> tuple[HttpResponse, str]:
        if self.device_id is None or self.device_secret is None:
            raise ProtocolError("device_not_registered")
        headers = signed_headers(
            device_id=self.device_id,
            device_secret=self.device_secret,
            method="POST",
            path=path,
            raw_body=raw,
        )
        nonce = headers["X-Lead-Radar-Nonce"]
        return self._transport("POST", self.origin + path, headers, raw, maximum), nonce

    def poll(self, version: str) -> tuple[BridgeCommand | None, int]:
        body = {
            "schema": SCHEMA,
            "version": version,
            "capabilities": CAPABILITIES,
        }
        raw = canonical_json(body)
        response, nonce = self._signed_post(POLL_PATH, raw, MAX_RESPONSE_BYTES)
        if response.status != 200:
            raise ProtocolError("poll_rejected")
        command, server_time, delay = parse_poll_response(response.body)
        verify_signed_response(
            headers=response.headers,
            device_id=self.device_id or "",
            device_secret=self.device_secret or b"",
            request_nonce=nonce,
            path=POLL_PATH,
            command_id=command.id if command else "idle",
            sequence=command.attempt if command else 0,
            expires_at=command.lease_expires_at if command else "none",
            raw_body=response.body,
            now=server_time,
        )
        return command, delay

    def submit_result(self, command: BridgeCommand, result: dict[str, object]) -> None:
        path = f"{RESULT_PATH_PREFIX}{command.id}/result"
        raw = canonical_json(result)
        response, nonce = self._signed_post(path, raw, MAX_RESPONSE_BYTES)
        if response.status not in {200, 201}:
            raise ProtocolError("result_rejected")
        parsed = strict_json(response.body)
        sequence = result.get("sequence")
        if (set(parsed) != {"schema", "status", "command_id", "sequence"}
            or parsed.get("schema") != SCHEMA
            or parsed.get("status") != "accepted"
            or parsed.get("command_id") != command.id
            or parsed.get("sequence") != sequence):
            raise ProtocolError("result_response_invalid")
        verify_signed_response(
            headers=response.headers,
            device_id=self.device_id or "",
            device_secret=self.device_secret or b"",
            request_nonce=nonce,
            path=path,
            command_id=command.id,
            sequence=int(sequence),
            expires_at="ack",
            raw_body=response.body,
        )

    def download_media(self, command: BridgeCommand, download_path: str) -> bytes:
        expected = f"{RESULT_PATH_PREFIX}{command.id}/media"
        if download_path != expected or not COMMAND_ID.fullmatch(command.id):
            raise ProtocolError("media_path_invalid")
        raw = canonical_json({"schema": SCHEMA, "command_id": command.id})
        response, nonce = self._signed_post(download_path, raw, MAX_MEDIA_RESPONSE_BYTES)
        if response.status != 200:
            raise ProtocolError("media_download_rejected")
        verify_signed_response(
            headers=response.headers,
            device_id=self.device_id or "",
            device_secret=self.device_secret or b"",
            request_nonce=nonce,
            path=download_path,
            command_id=command.id,
            sequence=command.attempt,
            expires_at=command.lease_expires_at,
            raw_body=response.body,
        )
        return response.body


def idle_delay(value: int | None) -> int:
    return value if isinstance(value, int) and 15 <= value <= 60 else DEFAULT_POLL_SECONDS
