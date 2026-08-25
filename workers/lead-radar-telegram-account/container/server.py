#!/usr/bin/env python3
"""Content-safe private HTTP adapter around the official TDLib JSON API.

The process has no public listener: Cloudflare exposes port 8080 only to the
owning Durable Object. Authentication secrets and message bodies are never
logged or persisted by this adapter. The local effect ledger stores request
digests and closed-list outcomes only.
"""

from __future__ import annotations

import base64
import ctypes
import hashlib
import io
import json
import os
import queue
import re
import shutil
import sqlite3
import tarfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import qrcode

from correlation import SendCorrelation


SCHEMA = "gptbot.lead-radar.tdlib-container.v1"
DATA_DIR = Path("/var/lib/tdlib")
DB_DIR = DATA_DIR / "db"
FILES_DIR = DATA_DIR / "files"
LEDGER_PATH = DATA_DIR / "gateway-effects.sqlite3"
MAX_BODY_BYTES = 24_000
MAX_ARCHIVE_BYTES = 24 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 96 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 4_096
TDLIB_TIMEOUT_SECONDS = 25.0
SAFE_OPERATION = re.compile(r"^[A-Za-z0-9:_-]{8,160}$")
SAFE_DIGEST = re.compile(r"^[a-f0-9]{64}$")
SAFE_USERNAME = re.compile(r"^[A-Za-z0-9_]{5,32}$")
SAFE_PHONE = re.compile(r"^\+[1-9]\d{6,14}$")
SAFE_CODE = re.compile(r"^[0-9A-Za-z_-]{3,16}$")
SAFE_QR_LOGIN_URL = re.compile(r"^tg://login\?token=[A-Za-z0-9_-]{16,512}={0,2}$")


def exact_keys(value: dict[str, Any], expected: set[str]) -> bool:
    return set(value.keys()) == expected


def safe_json_bytes(value: dict[str, Any]) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def response(status: str, **fields: Any) -> dict[str, Any]:
    return {"schema": SCHEMA, "status": status, **fields}


def ambiguous() -> dict[str, Any]:
    return response("ambiguous")


def rejected(code: str, retry_after_seconds: int | None = None) -> dict[str, Any]:
    value = response("rejected", code=code)
    if retry_after_seconds is not None:
        value["retry_after_seconds"] = max(1, min(retry_after_seconds, 31_536_000))
    return value


class TdError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__("tdlib_error")
        self.code = code
        self.message = message


class TdTimeout(Exception):
    pass


class TdClient:
    def __init__(self) -> None:
        self._library = ctypes.CDLL("/usr/local/lib/libtdjson.so")
        self._library.td_create_client_id.restype = ctypes.c_int
        self._library.td_send.argtypes = [ctypes.c_int, ctypes.c_char_p]
        self._library.td_receive.argtypes = [ctypes.c_double]
        self._library.td_receive.restype = ctypes.c_char_p
        self._client_id = 0
        self._receiver: threading.Thread | None = None
        self._receiver_stop = threading.Event()
        self._pending: dict[str, queue.Queue[dict[str, Any]]] = {}
        self._send_correlation = SendCorrelation(maximum_early_results=128)
        self._lock = threading.RLock()
        self._state_event = threading.Event()
        self.authorization_state = "starting"
        self.qr_link: str | None = None
        self.reason_code: str | None = None
        self.identity_label: str | None = None
        self.identity_verified_at: str | None = None

    @property
    def running(self) -> bool:
        return self._client_id > 0

    def start(self) -> None:
        with self._lock:
            if self.running:
                return
            self._client_id = int(self._library.td_create_client_id())
            self.authorization_state = "starting"
            self.qr_link = None
            self.reason_code = None
            self.identity_label = None
            self.identity_verified_at = None
            self._state_event.clear()
            if self._receiver is None or not self._receiver.is_alive():
                self._receiver_stop.clear()
                self._receiver = threading.Thread(
                    target=self._receive_loop,
                    name="tdlib-receiver",
                    daemon=True,
                )
                self._receiver.start()
        self.wait_for(lambda state: state != "starting", 12.0)

    def _send_raw(self, payload: dict[str, Any]) -> None:
        client_id = self._client_id
        if client_id <= 0:
            raise TdError(401, "AUTH_KEY_UNREGISTERED")
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self._library.td_send(client_id, raw)

    def request(self, payload: dict[str, Any], timeout: float = TDLIB_TIMEOUT_SECONDS) -> dict[str, Any]:
        extra = uuid.uuid4().hex
        waiter: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        with self._lock:
            self._pending[extra] = waiter
        try:
            self._send_raw({**payload, "@extra": extra})
            try:
                result = waiter.get(timeout=timeout)
            except queue.Empty as exc:
                raise TdTimeout() from exc
        finally:
            with self._lock:
                self._pending.pop(extra, None)
        if result.get("@type") == "error":
            raise TdError(int(result.get("code", 500)), str(result.get("message", "UNKNOWN")))
        return result

    def wait_for(self, predicate: Any, timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate(self.authorization_state):
                return True
            self._state_event.wait(min(0.25, max(0.0, deadline - time.monotonic())))
            self._state_event.clear()
        return bool(predicate(self.authorization_state))

    def _receive_loop(self) -> None:
        while not self._receiver_stop.is_set():
            raw = self._library.td_receive(0.5)
            if not raw:
                continue
            try:
                event = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if not isinstance(event, dict):
                continue
            extra = event.get("@extra")
            if isinstance(extra, str):
                with self._lock:
                    waiter = self._pending.get(extra)
                if waiter is not None:
                    try:
                        waiter.put_nowait(event)
                    except queue.Full:
                        pass
                    continue
            self._handle_update(event)

    def _handle_update(self, event: dict[str, Any]) -> None:
        kind = event.get("@type")
        if kind == "updateAuthorizationState":
            state = event.get("authorization_state")
            if isinstance(state, dict):
                self._handle_authorization_state(state)
            return
        if kind not in {"updateMessageSendSucceeded", "updateMessageSendFailed"}:
            return
        old_message_id = event.get("old_message_id")
        if not isinstance(old_message_id, int):
            return
        self._send_correlation.complete(old_message_id, event)

    def _handle_authorization_state(self, state: dict[str, Any]) -> None:
        kind = state.get("@type")
        mapping = {
            "authorizationStateWaitPhoneNumber": "awaiting_phone",
            "authorizationStateWaitCode": "awaiting_code",
            "authorizationStateWaitPassword": "awaiting_password",
            "authorizationStateReady": "connected",
            "authorizationStateLoggingOut": "revoked",
            "authorizationStateClosing": "revoked",
            "authorizationStateClosed": "revoked",
        }
        if kind == "authorizationStateWaitTdlibParameters":
            self.authorization_state = "starting"
            self._send_raw({
                "@type": "setTdlibParameters",
                "use_test_dc": False,
                "database_directory": str(DB_DIR),
                "files_directory": str(FILES_DIR),
                "database_encryption_key": database_key_standard_base64(),
                "use_file_database": False,
                "use_chat_info_database": True,
                "use_message_database": False,
                "use_secret_chats": False,
                "api_id": int(os.environ["TELEGRAM_API_ID"]),
                "api_hash": os.environ["TELEGRAM_API_HASH"],
                "system_language_code": "en",
                "device_model": "GPTBot Lead Radar",
                "system_version": "Cloudflare Container",
                "application_version": os.environ.get("GATEWAY_VERSION", "1.0.0"),
            })
        elif kind == "authorizationStateWaitOtherDeviceConfirmation":
            link = state.get("link")
            if isinstance(link, str) and SAFE_QR_LOGIN_URL.fullmatch(link):
                self.qr_link = link
                self.authorization_state = "awaiting_qr"
            else:
                self.qr_link = None
                self.authorization_state = "error"
                self.reason_code = "provider_response_invalid"
        elif isinstance(kind, str) and kind in mapping:
            self.authorization_state = mapping[kind]
            if self.authorization_state != "awaiting_qr":
                self.qr_link = None
        elif kind in {
            "authorizationStateWaitPremiumPurchase",
            "authorizationStateWaitEmailAddress",
            "authorizationStateWaitEmailCode",
            "authorizationStateWaitRegistration",
        }:
            self.authorization_state = "error"
            self.reason_code = "premium_required" if kind == "authorizationStateWaitPremiumPurchase" else "unsupported_auth_step"
        self._state_event.set()

    def request_qr(self) -> None:
        self.request({"@type": "requestQrCodeAuthentication", "other_user_ids": []}, 12.0)
        self.wait_for(lambda state: state in {"awaiting_qr", "connected", "error"}, 12.0)

    def set_phone(self, phone_number: str) -> None:
        self.request({
            "@type": "setAuthenticationPhoneNumber",
            "phone_number": phone_number,
            "settings": {
                "@type": "phoneNumberAuthenticationSettings",
                "allow_flash_call": False,
                "allow_missed_call": False,
                "is_current_phone_number": False,
                "has_unknown_phone_number": False,
                "allow_sms_retriever_api": False,
                "firebase_authentication_settings": None,
                "authentication_tokens": [],
            },
        }, 15.0)
        self.wait_for(lambda state: state != "awaiting_phone", 12.0)

    def set_code(self, code: str) -> None:
        self.request({"@type": "checkAuthenticationCode", "code": code}, 15.0)
        self.wait_for(lambda state: state != "awaiting_code", 12.0)

    def resend_code(self) -> None:
        self.request({"@type": "resendAuthenticationCode", "reason": None}, 15.0)

    def set_password(self, password: str) -> None:
        self.request({"@type": "checkAuthenticationPassword", "password": password}, 15.0)
        self.wait_for(lambda state: state != "awaiting_password", 12.0)

    def close(self, action: str = "close") -> bool:
        if not self.running:
            return True
        if action not in {"close", "logOut", "destroy"}:
            raise ValueError("close_action_invalid")
        try:
            self.request({"@type": action}, 10.0)
        except (TdError, TdTimeout):
            return False
        if not self.wait_for(lambda state: state == "revoked", 12.0):
            return False
        with self._lock:
            self._client_id = 0
            self.authorization_state = "revoked"
            self.qr_link = None
            self._pending.clear()
            self._send_correlation.clear()
        return True

    def verified_identity(self) -> tuple[str, str]:
        if self.authorization_state != "connected":
            raise TdError(401, "AUTH_KEY_UNREGISTERED")
        if self.identity_label and self.identity_verified_at:
            return self.identity_label, self.identity_verified_at
        user = self.request({"@type": "getMe"}, 15.0)
        first_name = user.get("first_name")
        phone_number = user.get("phone_number")
        usernames = user.get("usernames")
        active_usernames = usernames.get("active_usernames") if isinstance(usernames, dict) else None
        username = active_usernames[0] if isinstance(active_usernames, list) and active_usernames else None
        initial = next((character.upper() for character in str(first_name) if character.isalpha()), "T")
        suffix = ""
        digits = "".join(character for character in str(phone_number) if character.isdigit())
        if len(digits) >= 4:
            suffix = f" · •••• {digits[-4:]}"
        elif isinstance(username, str) and len(username) >= 2:
            suffix = f" · •••{username[-2:]}"
        self.identity_label = f"{initial}•••{suffix}"[:40]
        self.identity_verified_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        return self.identity_label, self.identity_verified_at

    def send_text(self, username: str, text: str, operation_id: str) -> dict[str, Any]:
        if self.authorization_state != "connected":
            return rejected("account_restricted")
        sending_id = int.from_bytes(hashlib.sha256(operation_id.encode()).digest()[:4], "big") & 0x7FFFFFFF
        sending_id = sending_id or 1
        temporary_message_id: int | None = None
        try:
            chat = self.request({"@type": "searchPublicChat", "username": username}, 15.0)
            chat_id = chat.get("id")
            chat_type = chat.get("type")
            if not isinstance(chat_id, int) \
                    or not isinstance(chat_type, dict) \
                    or chat_type.get("@type") != "chatTypePrivate" \
                    or not isinstance(chat_type.get("user_id"), int):
                return rejected("peer_invalid")
            user = self.request({"@type": "getUser", "user_id": chat_type["user_id"]}, 15.0)
            user_type = user.get("type")
            if not isinstance(user_type, dict) or user_type.get("@type") != "userTypeRegular":
                return rejected("peer_invalid")
            sent = self.request({
                "@type": "sendMessage",
                "chat_id": chat_id,
                "topic_id": None,
                "reply_to": None,
                "options": {
                    "@type": "messageSendOptions",
                    "suggested_post_info": None,
                    "disable_notification": False,
                    "from_background": True,
                    "protect_content": False,
                    "allow_paid_broadcast": False,
                    "paid_message_star_count": 0,
                    "update_order_of_installed_sticker_sets": False,
                    "scheduling_state": None,
                    "effect_id": 0,
                    "sending_id": sending_id,
                    "only_preview": False,
                },
                "reply_markup": None,
                "input_message_content": {
                    "@type": "inputMessageText",
                    "text": {"@type": "formattedText", "text": text, "entities": []},
                    "link_preview_options": {
                        "@type": "linkPreviewOptions",
                        "is_disabled": True,
                        "url": "",
                        "force_small_media": False,
                        "force_large_media": False,
                        "show_above_text": False,
                    },
                    "clear_draft": False,
                },
            }, 20.0)
            sending_state = sent.get("sending_state")
            if sending_state is None:
                message_id = sent.get("id")
                return response("sent", provider_message_id=str(message_id))
            temporary_message_id = sent.get("id")
            if not isinstance(temporary_message_id, int):
                return ambiguous()
            early, waiter = self._send_correlation.register(temporary_message_id)
            if early is not None:
                update = early
            else:
                try:
                    update = waiter.get(timeout=TDLIB_TIMEOUT_SECONDS)
                except queue.Empty:
                    return ambiguous()
            if update.get("@type") == "updateMessageSendSucceeded":
                message = update.get("message")
                message_id = message.get("id") if isinstance(message, dict) else None
                return response("sent", provider_message_id=str(message_id))
            error = update.get("error")
            if isinstance(error, dict):
                return map_td_error(int(error.get("code", 500)), str(error.get("message", "UNKNOWN")))
            return rejected("provider_rejected")
        except TdError as error:
            return map_td_error(error.code, error.message)
        except TdTimeout:
            return ambiguous()
        finally:
            if temporary_message_id is not None:
                self._send_correlation.cleanup(temporary_message_id)


def database_key_standard_base64() -> str:
    value = os.environ["TDLIB_DATABASE_KEY"]
    padded = value.replace("-", "+").replace("_", "/")
    padded += "=" * ((4 - len(padded) % 4) % 4)
    decoded = base64.b64decode(padded, validate=True)
    if len(decoded) != 32:
        raise RuntimeError("database_key_invalid")
    return base64.b64encode(decoded).decode("ascii")


def map_td_error(code: int, message: str) -> dict[str, Any]:
    normalized = message.upper()
    wait_patterns = [
        ("FLOOD_PREMIUM_WAIT", "flood_premium_wait"),
        ("FLOOD_WAIT", "flood_wait"),
        ("SLOWMODE_WAIT", "slow_mode"),
    ]
    for marker, safe_code in wait_patterns:
        if marker in normalized:
            match = re.search(rf"{marker}[_ ](\d+)", normalized)
            seconds = int(match.group(1)) if match else None
            return rejected(safe_code, seconds)
    if "ALLOW_PAYMENT_REQUIRED" in normalized or "PAID_MESSAGE" in normalized:
        return rejected("paid_message_required")
    if any(marker in normalized for marker in (
        "USERNAME_NOT_OCCUPIED",
        "USERNAME_INVALID",
        "PEER_ID_INVALID",
        "CHAT_ID_INVALID",
        "CHAT_NOT_FOUND",
    )):
        return rejected("peer_invalid")
    if any(marker in normalized for marker in (
        "USER_PRIVACY_RESTRICTED",
        "CHAT_WRITE_FORBIDDEN",
        "USER_IS_BLOCKED",
        "YOU_BLOCKED_USER",
    )):
        return rejected("privacy_restricted")
    if any(marker in normalized for marker in (
        "AUTH_KEY_UNREGISTERED",
        "AUTH_KEY_DUPLICATED",
        "SESSION_REVOKED",
        "USER_DEACTIVATED",
        "PEER_FLOOD",
        "USER_RESTRICTED",
    )):
        return rejected("account_restricted")
    if code == 429:
        return rejected("flood_wait")
    return rejected("provider_rejected")


def map_auth_error(code: int, message: str) -> str:
    normalized = message.upper()
    if "PHONE_NUMBER_INVALID" in normalized:
        return "phone_invalid"
    if "PHONE_CODE_EXPIRED" in normalized:
        return "code_expired"
    if "PHONE_CODE_INVALID" in normalized:
        return "code_invalid"
    if "PASSWORD_HASH_INVALID" in normalized:
        return "password_invalid"
    if "FLOOD" in normalized or code == 429:
        return "auth_rate_limited"
    return "authorization_failed"


class EffectLedger:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._connection: sqlite3.Connection | None = None
        self.open()

    def open(self) -> None:
        with self._lock:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            self._connection = sqlite3.connect(LEDGER_PATH, check_same_thread=False)
            self._connection.execute("PRAGMA journal_mode=WAL")
            self._connection.execute("PRAGMA synchronous=FULL")
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS effects (
                  operation_id TEXT PRIMARY KEY,
                  payload_digest TEXT NOT NULL,
                  status TEXT NOT NULL CHECK (status IN ('in_flight','sent','rejected','ambiguous')),
                  response_json TEXT,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL
                ) STRICT
                """
            )
            self._connection.commit()

    def close(self) -> None:
        with self._lock:
            if self._connection is not None:
                self._connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                self._connection.close()
                self._connection = None

    def reserve(self, operation_id: str, payload_digest: str) -> tuple[str, dict[str, Any] | None]:
        with self._lock:
            assert self._connection is not None
            self._connection.execute("BEGIN IMMEDIATE")
            row = self._connection.execute(
                "SELECT payload_digest, status, response_json FROM effects WHERE operation_id = ?",
                (operation_id,),
            ).fetchone()
            if row is not None:
                self._connection.commit()
                if row[0] != payload_digest:
                    return ("conflict", None)
                if row[2]:
                    return ("replay", json.loads(row[2]))
                return ("replay", ambiguous())
            now = int(time.time())
            self._connection.execute(
                "INSERT INTO effects(operation_id,payload_digest,status,response_json,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                (operation_id, payload_digest, "in_flight", None, now, now),
            )
            self._connection.commit()
            return ("reserved", None)

    def finish(self, operation_id: str, payload_digest: str, result: dict[str, Any]) -> None:
        with self._lock:
            assert self._connection is not None
            status = str(result.get("status"))
            safe_status = status if status in {"sent", "rejected", "ambiguous"} else "ambiguous"
            cursor = self._connection.execute(
                "UPDATE effects SET status=?,response_json=?,updated_at=? WHERE operation_id=? AND payload_digest=?",
                (
                    safe_status,
                    json.dumps(result, separators=(",", ":")),
                    int(time.time()),
                    operation_id,
                    payload_digest,
                ),
            )
            self._connection.commit()
            if cursor.rowcount != 1:
                raise RuntimeError("effect_ledger_conflict")

    def reconcile(self, operation_id: str, payload_digest: str) -> tuple[str, dict[str, Any] | None]:
        with self._lock:
            assert self._connection is not None
            row = self._connection.execute(
                "SELECT payload_digest,response_json FROM effects WHERE operation_id=?",
                (operation_id,),
            ).fetchone()
            if row is None:
                return ("missing", None)
            if row[0] != payload_digest:
                return ("conflict", None)
            return ("found", json.loads(row[1]) if row[1] else ambiguous())


class Runtime:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        DB_DIR.mkdir(parents=True, exist_ok=True)
        FILES_DIR.mkdir(parents=True, exist_ok=True)
        self.boot_id = uuid.uuid4().hex
        self.client: TdClient | None = None
        self.ledger = EffectLedger()
        self.lock = threading.RLock()

    def ensure_client(self) -> TdClient:
        with self.lock:
            if self.client is None:
                self.client = TdClient()
            self.client.start()
            return self.client

    def auth_state(self) -> dict[str, Any]:
        client = self.client
        state = client.authorization_state if client else "starting"
        result = response(state)
        if state == "awaiting_qr" and client and client.qr_link:
            image = qrcode.make(client.qr_link)
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            result["qr_code_data_url"] = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
            result["qr_login_url"] = client.qr_link
        if client and client.reason_code:
            result["reason_code"] = client.reason_code
        if state == "connected" and client:
            label, verified_at = client.verified_identity()
            result["masked_label"] = label
            result["identity_verified_at"] = verified_at
        return result

    def export_session(self) -> bytes:
        with self.lock:
            if self.client:
                if not self.client.close(action="close"):
                    raise RuntimeError("tdlib_close_unconfirmed")
                self.client = None
            self.ledger.close()
            try:
                buffer = io.BytesIO()
                with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
                    for path in sorted(DATA_DIR.rglob("*")):
                        if path.is_file():
                            archive.add(path, arcname=path.relative_to(DATA_DIR), recursive=False)
                value = buffer.getvalue()
                if len(value) > MAX_ARCHIVE_BYTES:
                    raise RuntimeError("snapshot_too_large")
                return value
            finally:
                self.ledger.open()

    def import_session(self, archive_bytes: bytes) -> None:
        if len(archive_bytes) > MAX_ARCHIVE_BYTES:
            raise RuntimeError("snapshot_too_large")
        with self.lock:
            if self.client is not None and self.client.running:
                raise RuntimeError("client_already_started")
            self.ledger.close()
            try:
                shutil.rmtree(DATA_DIR, ignore_errors=True)
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
                    members = archive.getmembers()
                    if len(members) > MAX_ARCHIVE_MEMBERS:
                        raise RuntimeError("snapshot_member_limit")
                    total_size = sum(member.size for member in members if member.isfile())
                    if total_size > MAX_UNCOMPRESSED_BYTES:
                        raise RuntimeError("snapshot_uncompressed_limit")
                    for member in members:
                        target = (DATA_DIR / member.name).resolve()
                        if DATA_DIR.resolve() not in target.parents and target != DATA_DIR.resolve():
                            raise RuntimeError("snapshot_path_invalid")
                        if not member.isfile() and not member.isdir():
                            raise RuntimeError("snapshot_member_invalid")
                    for member in members:
                        target = (DATA_DIR / member.name).resolve()
                        if member.isdir():
                            target.mkdir(parents=True, exist_ok=True)
                            continue
                        source = archive.extractfile(member)
                        if source is None:
                            raise RuntimeError("snapshot_member_invalid")
                        target.parent.mkdir(parents=True, exist_ok=True)
                        remaining = member.size
                        with target.open("xb") as output:
                            while remaining > 0:
                                chunk = source.read(min(1024 * 1024, remaining))
                                if not chunk:
                                    raise RuntimeError("snapshot_member_truncated")
                                output.write(chunk)
                                remaining -= len(chunk)
                            if source.read(1):
                                raise RuntimeError("snapshot_member_oversize")
                DB_DIR.mkdir(parents=True, exist_ok=True)
                FILES_DIR.mkdir(parents=True, exist_ok=True)
            finally:
                self.ledger.open()

    def reset(self, logout: bool) -> None:
        with self.lock:
            if self.client:
                action = "logOut" if logout and self.client.authorization_state == "connected" else "destroy"
                if not self.client.close(action=action):
                    raise RuntimeError("tdlib_revoke_unconfirmed")
                self.client = None
            self.ledger.close()
            shutil.rmtree(DATA_DIR, ignore_errors=True)
            DB_DIR.mkdir(parents=True, exist_ok=True)
            FILES_DIR.mkdir(parents=True, exist_ok=True)
            self.ledger.open()


RUNTIME = Runtime()


class Handler(BaseHTTPRequestHandler):
    server_version = "gptbot-tdlib-gateway"
    sys_version = ""

    def log_message(self, _format: str, *_args: Any) -> None:
        # Request paths, payloads, errors and client addresses are deliberately
        # omitted. Platform metrics supply content-free status/duration data.
        return

    def _write_json(self, status_code: int, value: dict[str, Any]) -> None:
        body = safe_json_bytes(value)
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any] | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length < 2 or length > MAX_BODY_BYTES:
            return None
        raw = self.rfile.read(length)
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return value if isinstance(value, dict) else None

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/v1/health":
            self._write_json(404, response("error", reason_code="not_found"))
            return
        state = RUNTIME.client.authorization_state if RUNTIME.client else "not_started"
        self._write_json(200, response(
            "ok",
            boot_id=RUNTIME.boot_id,
            client_state=state,
            tdlib_source_commit=os.environ.get("TDLIB_SOURCE_COMMIT", "unconfigured"),
        ))

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/v1/session/import":
            self._import_session()
            return
        if self.path == "/v1/session/export":
            self._export_session()
            return
        value = self._read_json()
        if value is None or value.get("schema") != SCHEMA:
            self._write_json(400, response("error", reason_code="invalid_request"))
            return
        try:
            result = self._route(value)
            self._write_json(200, result)
        except TdError as error:
            if self.path.startswith("/v1/auth/"):
                state = RUNTIME.auth_state()
                state["reason_code"] = map_auth_error(error.code, error.message)
                self._write_json(200, state)
            else:
                self._write_json(200, map_td_error(error.code, error.message))
        except TdTimeout:
            self._write_json(200, ambiguous())
        except Exception:
            self._write_json(503, response("error", reason_code="container_error"))

    def _route(self, value: dict[str, Any]) -> dict[str, Any]:
        if self.path == "/v1/auth/start" and exact_keys(value, {"schema"}):
            RUNTIME.ensure_client()
            return RUNTIME.auth_state()
        if self.path == "/v1/auth/state" and exact_keys(value, {"schema"}):
            return RUNTIME.auth_state()
        if self.path == "/v1/auth/qr" and exact_keys(value, {"schema"}):
            RUNTIME.ensure_client().request_qr()
            return RUNTIME.auth_state()
        if self.path == "/v1/auth/phone/start" and exact_keys(value, {"schema"}):
            RUNTIME.ensure_client()
            return RUNTIME.auth_state()
        if self.path == "/v1/auth/phone" and exact_keys(value, {"schema", "phone_number"}):
            phone = value.get("phone_number")
            if not isinstance(phone, str) or not SAFE_PHONE.fullmatch(phone):
                return response("error", reason_code="phone_invalid")
            RUNTIME.ensure_client().set_phone(phone)
            return RUNTIME.auth_state()
        if self.path == "/v1/auth/code" and exact_keys(value, {"schema", "code"}):
            code = value.get("code")
            if not isinstance(code, str) or not SAFE_CODE.fullmatch(code):
                return response("error", reason_code="code_invalid")
            RUNTIME.ensure_client().set_code(code)
            return RUNTIME.auth_state()
        if self.path == "/v1/auth/resend" and exact_keys(value, {"schema"}):
            RUNTIME.ensure_client().resend_code()
            return RUNTIME.auth_state()
        if self.path == "/v1/auth/password" and exact_keys(value, {"schema", "password"}):
            password = value.get("password")
            if not isinstance(password, str) or not 1 <= len(password) <= 256 or "\x00" in password:
                return response("error", reason_code="password_invalid")
            RUNTIME.ensure_client().set_password(password)
            return RUNTIME.auth_state()
        if self.path == "/v1/auth/cancel" and exact_keys(value, {"schema"}):
            RUNTIME.reset(logout=False)
            return response("revoked")
        if self.path == "/v1/account/disconnect" and exact_keys(value, {"schema"}):
            RUNTIME.reset(logout=True)
            return response("revoked")
        if self.path == "/v1/messages/send":
            return self._send(value)
        if self.path == "/v1/messages/reconcile":
            return self._reconcile(value)
        return response("error", reason_code="not_found")

    def _send(self, value: dict[str, Any]) -> dict[str, Any]:
        if not exact_keys(value, {
            "schema",
            "operation_id",
            "payload_digest",
            "username",
            "text",
            "paid_message_policy",
            "allow_paid_floodskip",
        }):
            return response("error", reason_code="invalid_request")
        operation_id = value.get("operation_id")
        payload_digest = value.get("payload_digest")
        username = value.get("username")
        text = value.get("text")
        if not isinstance(operation_id, str) or not SAFE_OPERATION.fullmatch(operation_id):
            return response("error", reason_code="invalid_request")
        if not isinstance(payload_digest, str) or not SAFE_DIGEST.fullmatch(payload_digest):
            return response("error", reason_code="invalid_request")
        if not isinstance(username, str) or not SAFE_USERNAME.fullmatch(username):
            return response("error", reason_code="invalid_request")
        if not isinstance(text, str) or not 1 <= len(text) <= 4_096:
            return response("error", reason_code="invalid_request")
        if value.get("paid_message_policy") != "reject" or value.get("allow_paid_floodskip") is not False:
            return response("error", reason_code="invalid_request")
        disposition, stored = RUNTIME.ledger.reserve(operation_id, payload_digest)
        if disposition == "conflict":
            return response("error", reason_code="effect_conflict")
        if disposition == "replay" and stored is not None:
            return stored
        result = RUNTIME.ensure_client().send_text(username, text, operation_id)
        RUNTIME.ledger.finish(operation_id, payload_digest, result)
        return result

    def _reconcile(self, value: dict[str, Any]) -> dict[str, Any]:
        if not exact_keys(value, {"schema", "operation_id", "payload_digest"}):
            return response("error", reason_code="invalid_request")
        operation_id = value.get("operation_id")
        payload_digest = value.get("payload_digest")
        if not isinstance(operation_id, str) or not SAFE_OPERATION.fullmatch(operation_id):
            return response("error", reason_code="invalid_request")
        if not isinstance(payload_digest, str) or not SAFE_DIGEST.fullmatch(payload_digest):
            return response("error", reason_code="invalid_request")
        disposition, stored = RUNTIME.ledger.reconcile(operation_id, payload_digest)
        if disposition == "conflict":
            return response("error", reason_code="effect_conflict")
        if disposition == "missing":
            return ambiguous()
        return stored or ambiguous()

    def _import_session(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length < 1 or length > MAX_ARCHIVE_BYTES:
            self._write_json(400, response("error", reason_code="snapshot_invalid"))
            return
        try:
            RUNTIME.import_session(self.rfile.read(length))
            self._write_json(200, response("imported"))
        except Exception:
            self._write_json(400, response("error", reason_code="snapshot_invalid"))

    def _export_session(self) -> None:
        try:
            archive = RUNTIME.export_session()
        except Exception:
            self._write_json(503, response("error", reason_code="snapshot_export_failed"))
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(archive)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(archive)


def validate_environment() -> None:
    api_id = os.environ.get("TELEGRAM_API_ID", "")
    api_hash = os.environ.get("TELEGRAM_API_HASH", "")
    database_key = os.environ.get("TDLIB_DATABASE_KEY", "")
    source_commit = os.environ.get("TDLIB_SOURCE_COMMIT", "")
    if not re.fullmatch(r"[1-9]\d{3,11}", api_id):
        raise RuntimeError("api_id_invalid")
    if not re.fullmatch(r"[a-f0-9]{32}", api_hash):
        raise RuntimeError("api_hash_invalid")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", database_key):
        raise RuntimeError("database_key_invalid")
    if not re.fullmatch(r"[a-f0-9]{40}", source_commit):
        raise RuntimeError("source_commit_invalid")
    database_key_standard_base64()


if __name__ == "__main__":
    validate_environment()
    server = ThreadingHTTPServer(("0.0.0.0", 8_080), Handler)
    server.daemon_threads = True
    server.serve_forever(poll_interval=0.25)
