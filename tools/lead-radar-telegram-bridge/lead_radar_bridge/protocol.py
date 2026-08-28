from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import re
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit


SCHEMA = "gptbot.lead-radar.telegram-bridge.v1"
SIGNATURE_DOMAIN = "LRTG-BRIDGE-V1"
SIGNATURE_DIRECTION = "DEVICE-TO-SERVER"
RESPONSE_SIGNATURE_DIRECTION = "SERVER-TO-DEVICE"
MAX_JSON_BYTES = 256_000
MAX_CLOCK_SKEW_SECONDS = 90
MIN_POLL_SECONDS = 2
DEFAULT_POLL_SECONDS = 15
MAX_POLL_SECONDS = 60

DEVICE_ID = re.compile(r"^lrtgbd_[a-f0-9]{32}$")
PAIRING_ID = re.compile(r"^lrtgbp_[a-f0-9]{32}$")
COMMAND_ID = re.compile(r"^lrtgbc_[a-f0-9]{32}$")
AUTH_ID = re.compile(r"^auth_[A-Za-z0-9_-]{12,96}$")
ACCOUNT_REF = re.compile(r"^[A-Za-z0-9:_-]{16,160}$")
ENTITY_ID = re.compile(r"^[A-Za-z0-9:_-]{8,160}$")
KEY_ID = re.compile(r"^[a-f0-9]{64}$")
SEMVER = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$")
SAFE_CODE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
SAFE_ENDPOINT = re.compile(r"^(?:[A-Za-z0-9_]{5,32}|lrpeer:[a-f0-9]{32})$")
MEDIA_ID = re.compile(r"^lrtgcm_[a-f0-9]{32}$")
DIGEST = re.compile(r"^[a-f0-9]{64}$")
PAIRING_CODE = re.compile(r"^[A-Za-z0-9_-]{22}$")
TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")
NONCE = re.compile(r"^[A-Za-z0-9_-]{22}$")
SPKI = re.compile(r"^[A-Za-z0-9_-]{350,900}$")
PATH = re.compile(r"^/v1/bridge/[A-Za-z0-9_/-]{1,180}$")

COMMAND_KINDS = {
    "connect",
    "connect_phone",
    "submit_auth",
    "cancel_auth",
    "submit_password",
    "disconnect",
    "probe",
    "resolve_contact",
    "validate_media",
    "send",
}
RESULT_STATUSES = {"progress", "succeeded", "failed", "ambiguous"}
CAPABILITIES = ["qr", "phone_code", "two_factor_password", "text", "image"]


class ProtocolError(ValueError):
    pass


def exact_keys(value: dict[str, Any], expected: set[str]) -> bool:
    return set(value) == expected


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def b64url_decode(value: str, *, minimum: int, maximum: int) -> bytes:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ProtocolError("base64url_invalid")
    padded = value + "=" * ((4 - len(value) % 4) % 4)
    try:
        decoded = base64.b64decode(padded, altchars=b"-_", validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ProtocolError("base64url_invalid") from exc
    if not minimum <= len(decoded) <= maximum or b64url_encode(decoded) != value:
        raise ProtocolError("base64url_invalid")
    return decoded


def canonical_json(value: dict[str, Any]) -> bytes:
    raw = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    ).encode("utf-8")
    if len(raw) > MAX_JSON_BYTES:
        raise ProtocolError("json_too_large")
    return raw


def strict_json(raw: bytes) -> dict[str, Any]:
    if not 2 <= len(raw) <= MAX_JSON_BYTES:
        raise ProtocolError("json_size_invalid")
    try:
        decoded = raw.decode("utf-8", errors="strict")
        value = json.loads(decoded)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProtocolError("json_invalid") from exc
    if not isinstance(value, dict):
        raise ProtocolError("json_invalid")
    return value


def request_path(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        raise ProtocolError("path_invalid")
    if not PATH.fullmatch(value) or ".." in value:
        raise ProtocolError("path_invalid")
    return value


def https_base_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ProtocolError("server_url_invalid")
    if parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ProtocolError("server_url_invalid")
    port = f":{parsed.port}" if parsed.port else ""
    return f"https://{parsed.hostname.lower()}{port}"


def body_digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def signature_canonical(
    *,
    device_id: str,
    timestamp: int,
    nonce: str,
    method: str,
    path: str,
    raw_body: bytes,
) -> bytes:
    if not DEVICE_ID.fullmatch(device_id):
        raise ProtocolError("device_id_invalid")
    if not isinstance(timestamp, int) or isinstance(timestamp, bool) or timestamp < 1:
        raise ProtocolError("timestamp_invalid")
    if not NONCE.fullmatch(nonce):
        raise ProtocolError("nonce_invalid")
    normalized_method = method.upper()
    if normalized_method != "POST":
        raise ProtocolError("method_invalid")
    path = request_path(path)
    return (
        f"{SIGNATURE_DOMAIN}\n{SIGNATURE_DIRECTION}\n{device_id}\n{timestamp}\n{nonce}\n"
        f"{normalized_method}\n{path}\n{body_digest(raw_body)}"
    ).encode("utf-8")


def signed_headers(
    *,
    device_id: str,
    device_secret: bytes,
    method: str,
    path: str,
    raw_body: bytes,
    now: int | None = None,
    nonce_bytes: bytes | None = None,
) -> dict[str, str]:
    if len(device_secret) != 32:
        raise ProtocolError("device_secret_invalid")
    timestamp = int(time.time()) if now is None else now
    nonce = b64url_encode(nonce_bytes if nonce_bytes is not None else secrets.token_bytes(16))
    canonical = signature_canonical(
        device_id=device_id,
        timestamp=timestamp,
        nonce=nonce,
        method=method,
        path=path,
        raw_body=raw_body,
    )
    signature = b64url_encode(hmac.new(device_secret, canonical, hashlib.sha256).digest())
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
        "Cache-Control": "no-store",
        "X-Lead-Radar-Device-Id": device_id,
        "X-Lead-Radar-Device-Token": b64url_encode(device_secret),
        "X-Lead-Radar-Timestamp": str(timestamp),
        "X-Lead-Radar-Nonce": nonce,
        "X-Lead-Radar-Signature": signature,
    }


def response_signature_canonical(
    *,
    device_id: str,
    request_nonce: str,
    server_timestamp: int,
    path: str,
    command_id: str,
    sequence: int,
    expires_at: str,
    raw_body: bytes,
) -> bytes:
    if not DEVICE_ID.fullmatch(device_id) or not NONCE.fullmatch(request_nonce):
        raise ProtocolError("response_signature_scope_invalid")
    if not isinstance(server_timestamp, int) or isinstance(server_timestamp, bool) or server_timestamp < 1:
        raise ProtocolError("response_signature_scope_invalid")
    path = request_path(path)
    if command_id != "idle" and not COMMAND_ID.fullmatch(command_id):
        raise ProtocolError("response_signature_scope_invalid")
    if not isinstance(sequence, int) or isinstance(sequence, bool) or not 0 <= sequence <= 32:
        raise ProtocolError("response_signature_scope_invalid")
    if not isinstance(expires_at, str) or not 1 <= len(expires_at) <= 64 or "\n" in expires_at:
        raise ProtocolError("response_signature_scope_invalid")
    return (
        f"{SIGNATURE_DOMAIN}\n{RESPONSE_SIGNATURE_DIRECTION}\n{device_id}\n{request_nonce}\n"
        f"{server_timestamp}\n{path}\n{command_id}\n{sequence}\n{expires_at}\n"
        f"{body_digest(raw_body)}"
    ).encode("utf-8")


def verify_signed_response(
    *,
    headers: dict[str, str],
    device_id: str,
    device_secret: bytes,
    request_nonce: str,
    path: str,
    command_id: str,
    sequence: int,
    expires_at: str,
    raw_body: bytes,
    now: int | None = None,
) -> None:
    try:
        timestamp = int(headers["x-lead-radar-server-timestamp"])
        signature = headers["x-lead-radar-server-signature"]
        reflected_nonce = headers["x-lead-radar-request-nonce"]
    except (KeyError, TypeError, ValueError) as exc:
        raise ProtocolError("response_signature_missing") from exc
    current = int(time.time()) if now is None else now
    if abs(timestamp - current) > MAX_CLOCK_SKEW_SECONDS or reflected_nonce != request_nonce:
        raise ProtocolError("response_signature_expired")
    if not TOKEN.fullmatch(signature):
        raise ProtocolError("response_signature_invalid")
    canonical = response_signature_canonical(
        device_id=device_id,
        request_nonce=request_nonce,
        server_timestamp=timestamp,
        path=path,
        command_id=command_id,
        sequence=sequence,
        expires_at=expires_at,
        raw_body=raw_body,
    )
    expected = b64url_encode(hmac.new(device_secret, canonical, hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        raise ProtocolError("response_signature_invalid")


def verify_registration_response(
    *,
    headers: dict[str, str],
    pairing_id: str,
    device_id: str,
    device_secret: bytes,
    request_body: bytes,
    response_body: bytes,
    now: int | None = None,
) -> None:
    try:
        timestamp = int(headers["x-lead-radar-server-timestamp"])
        signature = headers["x-lead-radar-registration-signature"]
    except (KeyError, TypeError, ValueError) as exc:
        raise ProtocolError("registration_signature_missing") from exc
    current = int(time.time()) if now is None else now
    if abs(timestamp - current) > MAX_CLOCK_SKEW_SECONDS or not TOKEN.fullmatch(signature):
        raise ProtocolError("registration_signature_expired")
    canonical = (
        f"{SIGNATURE_DOMAIN}\nSERVER-TO-DEVICE-REGISTER\n{pairing_id}\n{device_id}\n"
        f"{timestamp}\n{body_digest(request_body)}\n{body_digest(response_body)}"
    ).encode("utf-8")
    expected = b64url_encode(hmac.new(device_secret, canonical, hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        raise ProtocolError("registration_signature_invalid")


def valid_text(value: Any, maximum: int = 4_096) -> bool:
    if not isinstance(value, str) or not 1 <= len(value) <= maximum:
        return False
    if len(value.encode("utf-8")) > 16_384:
        return False
    return not any(
        (ord(character) < 32 and character not in "\n\t")
        or ord(character) == 127
        or 0xD800 <= ord(character) <= 0xDFFF
        for character in value
    )


@dataclass(frozen=True)
class E2EEnvelope:
    key_id: str
    wrapped_key: bytes
    iv: bytes
    ciphertext: bytes

    @classmethod
    def parse(cls, value: Any) -> "E2EEnvelope":
        if not isinstance(value, dict) or not exact_keys(
            value,
            {"alg", "key_id", "wrapped_key", "iv", "ciphertext"},
        ) or value.get("alg") != "RSA-OAEP-256+A256GCM" or not KEY_ID.fullmatch(
            str(value.get("key_id", ""))
        ):
            raise ProtocolError("e2e_envelope_invalid")
        return cls(
            key_id=value["key_id"],
            wrapped_key=b64url_decode(value["wrapped_key"], minimum=256, maximum=512),
            iv=b64url_decode(value["iv"], minimum=12, maximum=12),
            ciphertext=b64url_decode(value["ciphertext"], minimum=17, maximum=98_304),
        )

    def json(self) -> dict[str, str]:
        return {
            "alg": "RSA-OAEP-256+A256GCM",
            "key_id": self.key_id,
            "wrapped_key": b64url_encode(self.wrapped_key),
            "iv": b64url_encode(self.iv),
            "ciphertext": b64url_encode(self.ciphertext),
        }


@dataclass(frozen=True)
class BridgeCommand:
    id: str
    kind: str
    attempt: int
    lease_expires_at: str
    payload: dict[str, Any]


def parse_poll_response(raw: bytes) -> tuple[BridgeCommand | None, int, int]:
    value = strict_json(raw)
    if not exact_keys(
        value,
        {"schema", "status", "server_time", "poll_after_seconds", "command"},
    ) or value.get("schema") != SCHEMA or value.get("status") not in {"idle", "command"}:
        raise ProtocolError("poll_response_invalid")
    server_time = value.get("server_time")
    delay = value.get("poll_after_seconds")
    if not isinstance(server_time, int) or isinstance(server_time, bool):
        raise ProtocolError("poll_response_invalid")
    if not isinstance(delay, int) or isinstance(delay, bool) or not MIN_POLL_SECONDS <= delay <= MAX_POLL_SECONDS:
        raise ProtocolError("poll_response_invalid")
    raw_command = value.get("command")
    if value["status"] == "idle":
        if raw_command is not None:
            raise ProtocolError("poll_response_invalid")
        return None, server_time, delay
    if not isinstance(raw_command, dict) or not exact_keys(
        raw_command,
        {"id", "kind", "attempt", "lease_expires_at", "payload"},
    ):
        raise ProtocolError("command_invalid")
    command_id = raw_command.get("id")
    kind = raw_command.get("kind")
    attempt = raw_command.get("attempt")
    payload = raw_command.get("payload")
    expires = raw_command.get("lease_expires_at")
    if not isinstance(command_id, str) or not COMMAND_ID.fullmatch(command_id):
        raise ProtocolError("command_invalid")
    if kind not in COMMAND_KINDS or not isinstance(attempt, int) or isinstance(attempt, bool) or not 1 <= attempt <= 32:
        raise ProtocolError("command_invalid")
    if not isinstance(expires, str) or not isinstance(payload, dict):
        raise ProtocolError("command_invalid")
    return BridgeCommand(command_id, kind, attempt, expires, payload), server_time, delay


def result_body(
    *,
    command_id: str,
    sequence: int,
    status: str,
    result_code: str,
    result: dict[str, Any],
) -> dict[str, Any]:
    if not COMMAND_ID.fullmatch(command_id):
        raise ProtocolError("command_id_invalid")
    if not isinstance(sequence, int) or isinstance(sequence, bool) or not 1 <= sequence <= 32:
        raise ProtocolError("sequence_invalid")
    if status not in RESULT_STATUSES or not SAFE_CODE.fullmatch(result_code):
        raise ProtocolError("result_invalid")
    if not isinstance(result, dict):
        raise ProtocolError("result_invalid")
    return {
        "schema": SCHEMA,
        "command_id": command_id,
        "sequence": sequence,
        "status": status,
        "result_code": result_code,
        "result": result,
    }
