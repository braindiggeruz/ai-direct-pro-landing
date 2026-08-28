from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import logging
import logging.handlers
import os
import re
import socket
import ssl
import time
import urllib.error
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .e2e import decrypt_password_envelope, encrypt_qr_envelope, envelope_decrypt_context
from .ledger import BridgeLedger, LedgerConflict, payload_digest
from .mailbox import MailboxClient, idle_delay
from .media import sanitize_static_image, verify_media_bytes
from .protocol import (
    ACCOUNT_REF,
    AUTH_ID,
    COMMAND_ID,
    DIGEST,
    ENTITY_ID,
    KEY_ID,
    MEDIA_ID,
    SAFE_ENDPOINT,
    SCHEMA,
    BridgeCommand,
    ProtocolError,
    exact_keys,
    result_body,
    valid_text,
)
from .security import DpapiVault, SecurityError, secure_directory
from .telegram_adapter import ProviderOutcome, TelethonAccount


VERSION = "1.3.2"
MAX_AUTH_SECONDS = 10 * 60
MAX_COMMAND_FUTURE_SECONDS = 10 * 60
RELAY_TTL_SECONDS = 10 * 60
RELAY_SAFETY_SECONDS = 5


def _iso(value: Any, *, maximum_future: int = MAX_COMMAND_FUTURE_SECONDS) -> dt.datetime:
    if not isinstance(value, str) or not 20 <= len(value) <= 64:
        raise ProtocolError("timestamp_invalid")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProtocolError("timestamp_invalid") from exc
    now = dt.datetime.now(dt.timezone.utc)
    if parsed.tzinfo is None or parsed <= now - dt.timedelta(seconds=5):
        raise ProtocolError("timestamp_expired")
    if parsed > now + dt.timedelta(seconds=maximum_future):
        raise ProtocolError("timestamp_invalid")
    return parsed


def _iso_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _safe_logger(log_path: Path) -> logging.Logger:
    logger = logging.getLogger("lead_radar_telegram_bridge")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=512_000, backupCount=3, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s event=%(message)s"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger


def safe_poll_error_code(error: BaseException) -> str:
    """Reduce a poll failure to a secret-free, supportable category."""
    if isinstance(error, ProtocolError):
        code = str(error)
        if code in {
            "poll_device_unauthorized",
            "poll_device_unavailable",
            "poll_rate_limited",
            "poll_server_unavailable",
            "poll_rejected",
            "response_signature_invalid",
            "response_timestamp_invalid",
            "response_nonce_invalid",
        }:
            return code
        return "poll_protocol_invalid"
    if isinstance(error, ssl.SSLError):
        return "poll_tls_failed"
    if isinstance(error, (TimeoutError, socket.timeout)):
        return "poll_timeout"
    if isinstance(error, urllib.error.URLError):
        reason = error.reason
        if isinstance(reason, ssl.SSLError):
            return "poll_tls_failed"
        if isinstance(reason, (TimeoutError, socket.timeout)):
            return "poll_timeout"
        if isinstance(reason, socket.gaierror):
            return "poll_dns_failed"
        return "poll_network_failed"
    if isinstance(error, OSError):
        return "poll_network_failed"
    return "poll_internal_error"


@dataclass
class ActiveConnect:
    command: BridgeCommand
    org_id: str
    auth_id: str
    account_ref: str
    expires_at: int
    password_reported: bool = False


class BridgeRuntime:
    def __init__(
        self,
        *,
        root: Path,
        vault: DpapiVault,
        ledger: BridgeLedger,
        mailbox: MailboxClient,
        telegram: TelethonAccount,
        vault_state: dict[str, Any],
    ) -> None:
        self.root = root
        self.vault = vault
        self.ledger = ledger
        self.mailbox = mailbox
        self.telegram = telegram
        self.state = vault_state
        self.device = self._device_state()
        self.logger = _safe_logger(root / "bridge.log")
        self.active_connect: ActiveConnect | None = None

    def _device_state(self) -> dict[str, Any]:
        device = self.state.get("device")
        if not isinstance(device, dict):
            raise SecurityError("device_state_missing")
        return device

    def _save_state(self) -> None:
        self.vault.save({key: value for key, value in self.state.items() if key != "schema"})

    def _persist_session(
        self,
        *,
        auth_id: str,
        account_ref: str,
        custody: str,
        expires_at: int,
    ) -> None:
        telegram = self.state.setdefault("telegram", {})
        if not isinstance(telegram, dict):
            raise SecurityError("telegram_state_invalid")
        telegram.update({
            "session": self.telegram.export_session(),
            "auth_id": auth_id,
            "account_ref": account_ref,
            "custody": custody,
            "expires_at": expires_at,
        })
        if custody == "finalized":
            telegram.pop("pending_phone", None)
            telegram.pop("pending_phone_code_hash", None)
        self._save_state()

    def _persist_pending_phone(self, *, auth_id: str, phone: str, phone_code_hash: str) -> None:
        telegram = self.state.get("telegram")
        if (not isinstance(telegram, dict)
            or telegram.get("auth_id") != auth_id
            or telegram.get("custody") != "provisional"):
            raise SecurityError("auth_not_provisional")
        telegram["pending_phone"] = phone
        telegram["pending_phone_code_hash"] = phone_code_hash
        self._save_state()

    def _pending_phone(self, auth_id: str) -> tuple[str, str]:
        telegram = self.state.get("telegram")
        if not isinstance(telegram, dict) or telegram.get("auth_id") != auth_id:
            raise SecurityError("phone_auth_missing")
        phone = telegram.get("pending_phone")
        phone_code_hash = telegram.get("pending_phone_code_hash")
        if (not isinstance(phone, str) or not re.fullmatch(r"\+[1-9]\d{6,14}", phone)
            or not isinstance(phone_code_hash, str) or not 8 <= len(phone_code_hash) <= 256):
            raise SecurityError("phone_auth_missing")
        return phone, phone_code_hash

    def _clear_pending_phone(self) -> None:
        telegram = self.state.get("telegram")
        if isinstance(telegram, dict):
            telegram.pop("pending_phone", None)
            telegram.pop("pending_phone_code_hash", None)
        self.telegram.pending_phone = None
        self.telegram.pending_phone_code_hash = None
        self._save_state()

    def _wipe_session_after_confirmed_logout(self) -> None:
        telegram = self.state.get("telegram")
        if isinstance(telegram, dict):
            telegram.update({
                "session": "",
                "auth_id": None,
                "account_ref": None,
                "custody": "revoked",
                "expires_at": 0,
            })
            telegram.pop("pending_phone", None)
            telegram.pop("pending_phone_code_hash", None)
        self._save_state()

    async def cleanup_expired_provisional(self) -> None:
        telegram_state = self.state.get("telegram")
        for custody in self.ledger.expired_provisional_auth():
            auth_id = str(custody["auth_id"])
            if (not isinstance(telegram_state, dict)
                or telegram_state.get("auth_id") != auth_id
                or telegram_state.get("account_ref") != custody["account_ref"]
                or telegram_state.get("custody") not in {"provisional", "finalizing"}):
                self.logger.warning("stale_provisional_custody_ignored")
                continue
            try:
                await self.telegram.logout()
            except BaseException:
                # Keep DPAPI session and provisional row so the next loop can
                # retry remote revocation. Never equate local deletion with a
                # confirmed Telegram logout.
                self.logger.warning("provisional_logout_retry")
                continue
            self._wipe_session_after_confirmed_logout()
            self.ledger.mark_auth_state(auth_id, "revoked")
            self.logger.info("provisional_logout_confirmed")

    def repair_finalizing_custody(self) -> None:
        telegram = self.state.get("telegram")
        for custody in self.ledger.finalizing_auth():
            if (not isinstance(telegram, dict)
                or telegram.get("auth_id") != custody["auth_id"]
                or telegram.get("account_ref") != custody["account_ref"]):
                # Cannot prove the DPAPI session belongs to this transition.
                # Leave it finalizing; expiry cleanup will revoke fail-closed.
                continue
            if telegram.get("custody") != "finalized":
                telegram["custody"] = "finalized"
                self._save_state()
            self.ledger.mark_auth_state(str(custody["auth_id"]), "finalized")

    async def _submit(self, command: BridgeCommand, body: dict[str, Any]) -> None:
        terminal = body["status"] in {"succeeded", "failed", "ambiguous"}
        self.ledger.store_result(body, terminal=terminal)
        await asyncio.to_thread(self.mailbox.submit_result, command, body)
        self.ledger.acknowledge_result(body)

    async def _resend_pending(self, command: BridgeCommand) -> bool:
        pending = self.ledger.pending_result(command.id)
        if pending is None:
            return False
        # Do not derive a later result until the signed server acknowledgement
        # for these exact canonical bytes has been observed. This covers both
        # a request dropped before commit and a response dropped after commit.
        await asyncio.to_thread(self.mailbox.submit_result, command, pending)
        self.ledger.acknowledge_result(pending)
        return True

    def _connect_payload(self, command: BridgeCommand) -> tuple[str, str, str, dict[str, Any], dt.datetime]:
        payload = command.payload
        if not exact_keys(payload, {"org_id", "auth_id", "account_ref", "browser_key", "expires_at"}):
            raise ProtocolError("connect_payload_invalid")
        org_id = payload.get("org_id")
        auth_id = payload.get("auth_id")
        account_ref = payload.get("account_ref")
        browser = payload.get("browser_key")
        expires = _iso(payload.get("expires_at"))
        if (not isinstance(org_id, str) or not ENTITY_ID.fullmatch(org_id)
            or not isinstance(auth_id, str) or not AUTH_ID.fullmatch(auth_id)
            or not isinstance(account_ref, str) or not ACCOUNT_REF.fullmatch(account_ref)
            or not isinstance(browser, dict)
            or not exact_keys(browser, {"alg", "key_id", "spki", "expires_at"})
            or browser.get("alg") != "RSA-OAEP-256"
            or not isinstance(browser.get("key_id"), str) or not KEY_ID.fullmatch(browser["key_id"])
            or not isinstance(browser.get("spki"), str)):
            raise ProtocolError("connect_payload_invalid")
        _iso(browser.get("expires_at"), maximum_future=95)
        return org_id, auth_id, account_ref, browser, expires

    def _phone_connect_payload(self, command: BridgeCommand) -> tuple[str, str, str, dt.datetime]:
        payload = command.payload
        if not exact_keys(payload, {"org_id", "auth_id", "account_ref", "expires_at"}):
            raise ProtocolError("phone_connect_payload_invalid")
        org_id = payload.get("org_id")
        auth_id = payload.get("auth_id")
        account_ref = payload.get("account_ref")
        expires = _iso(payload.get("expires_at"))
        if (not isinstance(org_id, str) or not ENTITY_ID.fullmatch(org_id)
            or not isinstance(auth_id, str) or not AUTH_ID.fullmatch(auth_id)
            or not isinstance(account_ref, str) or not ACCOUNT_REF.fullmatch(account_ref)):
            raise ProtocolError("phone_connect_payload_invalid")
        return org_id, auth_id, account_ref, expires

    @staticmethod
    def _relay_expiry(expires_at: int) -> str:
        deadline = min(
            expires_at,
            int(time.time()) + RELAY_TTL_SECONDS - RELAY_SAFETY_SECONDS,
        )
        if deadline <= int(time.time()) + 5:
            raise ProtocolError("auth_relay_expired")
        return dt.datetime.fromtimestamp(
            deadline, tz=dt.timezone.utc,
        ).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    async def _new_qr_progress(self, command: BridgeCommand, sequence: int) -> dict[str, Any]:
        org_id, auth_id, account_ref, browser, expires = self._connect_payload(command)
        qr_url = await self.telegram.begin_qr(auth_id)
        browser_expiry = _iso(
            browser["expires_at"], maximum_future=RELAY_TTL_SECONDS + RELAY_SAFETY_SECONDS,
        )
        relay_expiry_value = min(
            expires,
            browser_expiry,
            dt.datetime.now(dt.timezone.utc) + dt.timedelta(
                seconds=RELAY_TTL_SECONDS - RELAY_SAFETY_SECONDS,
            ),
        )
        if relay_expiry_value <= dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=5):
            raise ProtocolError("browser_key_expired")
        relay_expiry = relay_expiry_value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        envelope = encrypt_qr_envelope(
            public_key_spki=browser["spki"],
            key_id=browser["key_id"],
            org_id=org_id,
            device_id=self.device["device_id"],
            command_id=command.id,
            auth_id=auth_id,
            expires_at=relay_expiry,
            qr_login_url=qr_url,
        )
        expires_epoch = int(expires.timestamp())
        # The local cleanup marker precedes the DPAPI session write, and neither
        # boundary exposes the QR. A restart can therefore reconcile either a
        # marker-only record or a provisional vault session fail-closed.
        self.ledger.put_auth_custody(
            auth_id=auth_id,
            command_id=command.id,
            account_ref=account_ref,
            state="provisional",
            expires_at=expires_epoch,
        )
        self._persist_session(
            auth_id=auth_id,
            account_ref=account_ref,
            custody="provisional",
            expires_at=expires_epoch,
        )
        self.active_connect = ActiveConnect(
            command=command,
            org_id=org_id,
            auth_id=auth_id,
            account_ref=account_ref,
            expires_at=expires_epoch,
        )
        return result_body(
            command_id=command.id,
            sequence=sequence,
            status="progress",
            result_code="awaiting_qr",
            result={
                "auth_id": auth_id,
                "auth_state": "awaiting_qr",
                "qr_envelope": envelope,
                "expires_at": relay_expiry,
            },
        )

    async def _connected_result(
        self,
        command: BridgeCommand,
        *,
        auth_id: str,
        account_ref: str,
        expires_at: int,
        sequence: int,
    ) -> dict[str, Any]:
        resolved_ref, label = await self.telegram.connected_identity(account_ref)
        telegram_state = self.state.get("telegram")
        if isinstance(telegram_state, dict):
            telegram_state.pop("pending_phone", None)
            telegram_state.pop("pending_phone_code_hash", None)
        self.telegram.pending_phone = None
        self.telegram.pending_phone_code_hash = None
        self._persist_session(
            auth_id=auth_id,
            account_ref=resolved_ref,
            custody="provisional",
            expires_at=expires_at,
        )
        self.ledger.put_auth_custody(
            auth_id=auth_id,
            command_id=command.id,
            account_ref=resolved_ref,
            state="provisional",
            expires_at=expires_at,
        )
        return result_body(
            command_id=command.id,
            sequence=sequence,
            status="succeeded",
            result_code="connected",
            result={
                "auth_id": auth_id,
                "account_ref": resolved_ref,
                "masked_label": label,
                "connected_at": _iso_now(),
            },
        )

    async def _advance_connect(self) -> None:
        active = self.active_connect
        if active is None:
            return
        if active.expires_at <= int(time.time()):
            await self.cleanup_expired_provisional()
            self.active_connect = None
            return
        if await self._resend_pending(active.command):
            return
        if await self.telegram.is_authorized():
            previous = self.ledger.last_result(active.command.id)
            sequence = int(previous.get("sequence", 0)) + 1 if previous else 1
            await self._submit(active.command, await self._connected_result(
                active.command,
                auth_id=active.auth_id,
                account_ref=active.account_ref,
                expires_at=active.expires_at,
                sequence=sequence,
            ))
            self.active_connect = None
            self.logger.info("authorization_provisional")
            return
        state = await self.telegram.wait_qr(timeout_seconds=1)
        previous = self.ledger.last_result(active.command.id)
        sequence = int(previous.get("sequence", 0)) + 1 if previous else 1
        if state == "awaiting_qr":
            return
        if state == "qr_expired":
            if sequence > 32:
                raise ProtocolError("connect_sequence_exhausted")
            await self._submit(active.command, await self._new_qr_progress(active.command, sequence))
            return
        if state == "awaiting_password":
            # Persist the authorization key under DPAPI before announcing 2FA;
            # it remains provisional and is automatically logged out at TTL.
            self._persist_session(
                auth_id=active.auth_id,
                account_ref=active.account_ref,
                custody="provisional",
                expires_at=active.expires_at,
            )
            self.ledger.put_auth_custody(
                auth_id=active.auth_id,
                command_id=active.command.id,
                account_ref=active.account_ref,
                state="provisional",
                expires_at=active.expires_at,
            )
            if not active.password_reported:
                relay_deadline = min(
                    active.expires_at,
                    int(time.time()) + RELAY_TTL_SECONDS - RELAY_SAFETY_SECONDS,
                )
                if relay_deadline <= int(time.time()) + 5:
                    raise ProtocolError("password_relay_expired")
                relay_expires_at = dt.datetime.fromtimestamp(
                    relay_deadline, tz=dt.timezone.utc,
                ).isoformat(timespec="milliseconds").replace("+00:00", "Z")
                body = result_body(
                    command_id=active.command.id,
                    sequence=sequence,
                    status="progress",
                    result_code="awaiting_password",
                    result={
                        "auth_id": active.auth_id,
                        "auth_state": "awaiting_password",
                        "expires_at": relay_expires_at,
                    },
                )
                await self._submit(active.command, body)
                active.password_reported = True
            return
        body = await self._connected_result(
            active.command,
            auth_id=active.auth_id,
            account_ref=active.account_ref,
            expires_at=active.expires_at,
            sequence=sequence,
        )
        await self._submit(active.command, body)
        self.active_connect = None
        self.logger.info("authorization_provisional")

    async def _connect(self, command: BridgeCommand) -> dict[str, Any]:
        return await self._new_qr_progress(command, 1)

    async def _connect_phone(self, command: BridgeCommand) -> dict[str, Any]:
        org_id, auth_id, account_ref, expires = self._phone_connect_payload(command)
        self._clear_pending_phone()
        await self.telegram.begin_phone(auth_id)
        expires_epoch = int(expires.timestamp())
        self.ledger.put_auth_custody(
            auth_id=auth_id,
            command_id=command.id,
            account_ref=account_ref,
            state="provisional",
            expires_at=expires_epoch,
        )
        self._persist_session(
            auth_id=auth_id,
            account_ref=account_ref,
            custody="provisional",
            expires_at=expires_epoch,
        )
        return result_body(
            command_id=command.id,
            sequence=1,
            status="succeeded",
            result_code="awaiting_phone",
            result={
                "auth_id": auth_id,
                "auth_state": "awaiting_phone",
                "expires_at": self._relay_expiry(expires_epoch),
            },
        )

    async def _submit_auth(self, command: BridgeCommand) -> dict[str, Any]:
        payload = command.payload
        if not exact_keys(payload, {"org_id", "auth_id", "action", "auth_envelope"}):
            raise ProtocolError("auth_input_payload_invalid")
        org_id = payload.get("org_id")
        auth_id = payload.get("auth_id")
        action = payload.get("action")
        if (not isinstance(org_id, str) or not ENTITY_ID.fullmatch(org_id)
            or not isinstance(auth_id, str) or not AUTH_ID.fullmatch(auth_id)
            or action not in {"phone", "code"}):
            raise ProtocolError("auth_input_payload_invalid")
        custody = self.ledger.auth_custody(auth_id)
        if custody is None or custody["state"] != "provisional":
            raise ProtocolError("auth_not_provisional")
        value = envelope_decrypt_context(
            self.device["private_key_pkcs8"],
            payload.get("auth_envelope"),
            purpose=str(action),
            org_id=org_id,
            device_id=self.device["device_id"],
            command_id=command.id,
            auth_id=auth_id,
        )
        if action == "phone":
            if not isinstance(value, str) or not re.fullmatch(r"\+[1-9]\d{6,14}", value):
                raise ProtocolError("phone_invalid")
            try:
                try:
                    phone_code_hash = await self.telegram.submit_phone(value)
                except BaseException as error:
                    if error.__class__.__name__ in {
                        "PhoneNumberInvalidError", "PhoneNumberBannedError", "PhoneNumberUnoccupiedError",
                    }:
                        return result_body(
                            command_id=command.id,
                            sequence=1,
                            status="failed",
                            result_code="phone_invalid",
                            result={},
                        )
                    raise
                self.telegram.pending_phone = value
                self.telegram.pending_phone_code_hash = phone_code_hash
                self._persist_session(
                    auth_id=auth_id,
                    account_ref=str(custody["account_ref"]),
                    custody="provisional",
                    expires_at=int(custody["expires_at"]),
                )
                self._persist_pending_phone(
                    auth_id=auth_id,
                    phone=value,
                    phone_code_hash=phone_code_hash,
                )
                # Deliberately omit the phone and challenge identifiers. This
                # lets support distinguish a real Telegram acknowledgement
                # from a browser/mailbox timeout without logging private data.
                self.logger.info("phone_code_requested")
            finally:
                value = ""
            return result_body(
                command_id=command.id,
                sequence=1,
                status="succeeded",
                result_code="awaiting_code",
                result={
                    "auth_id": auth_id,
                    "auth_state": "awaiting_code",
                    "expires_at": self._relay_expiry(int(custody["expires_at"])),
                },
            )

        if not isinstance(value, str) or not re.fullmatch(r"[0-9A-Za-z_-]{3,16}", value):
            raise ProtocolError("code_invalid")
        phone, phone_code_hash = self._pending_phone(auth_id)
        try:
            try:
                next_state = await self.telegram.submit_code(
                    value,
                    phone=phone,
                    phone_code_hash=phone_code_hash,
                )
            except BaseException as error:
                if error.__class__.__name__ in {"PhoneCodeInvalidError", "PhoneCodeEmptyError"}:
                    return result_body(
                        command_id=command.id,
                        sequence=1,
                        status="failed",
                        result_code="code_invalid",
                        result={},
                    )
                if error.__class__.__name__ == "PhoneCodeExpiredError":
                    return result_body(
                        command_id=command.id,
                        sequence=1,
                        status="failed",
                        result_code="code_expired",
                        result={},
                    )
                raise
        finally:
            value = ""
        self._clear_pending_phone()
        if next_state == "awaiting_password":
            self._persist_session(
                auth_id=auth_id,
                account_ref=str(custody["account_ref"]),
                custody="provisional",
                expires_at=int(custody["expires_at"]),
            )
            return result_body(
                command_id=command.id,
                sequence=1,
                status="succeeded",
                result_code="awaiting_password",
                result={
                    "auth_id": auth_id,
                    "auth_state": "awaiting_password",
                    "expires_at": self._relay_expiry(int(custody["expires_at"])),
                },
            )
        return await self._connected_result(
            command,
            auth_id=auth_id,
            account_ref=str(custody["account_ref"]),
            expires_at=int(custody["expires_at"]),
            sequence=1,
        )

    async def _password(self, command: BridgeCommand) -> dict[str, Any]:
        payload = command.payload
        if not exact_keys(payload, {"org_id", "auth_id", "password_envelope"}):
            raise ProtocolError("password_payload_invalid")
        org_id = payload.get("org_id")
        auth_id = payload.get("auth_id")
        if (not isinstance(org_id, str) or not ENTITY_ID.fullmatch(org_id)
            or not isinstance(auth_id, str) or not AUTH_ID.fullmatch(auth_id)):
            raise ProtocolError("password_payload_invalid")
        custody = self.ledger.auth_custody(auth_id)
        if custody is None or custody["state"] != "provisional":
            raise ProtocolError("auth_not_provisional")
        if await self.telegram.is_authorized():
            return await self._connected_result(
                command,
                auth_id=auth_id,
                account_ref=str(custody["account_ref"]),
                expires_at=int(custody["expires_at"]),
                sequence=1,
            )
        password = decrypt_password_envelope(
            self.device["private_key_pkcs8"],
            payload.get("password_envelope"),
            key_id=self.device["key_id"],
            org_id=org_id,
            device_id=self.device["device_id"],
            command_id=command.id,
            auth_id=auth_id,
        )
        try:
            try:
                await self.telegram.submit_password(password)
            except BaseException as error:
                if error.__class__.__name__ in {"PasswordHashInvalidError", "PasswordInvalidError"}:
                    return result_body(
                        command_id=command.id,
                        sequence=1,
                        status="failed",
                        result_code="password_invalid",
                        result={},
                    )
                raise
        finally:
            password = ""
        return await self._connected_result(
            command,
            auth_id=auth_id,
            account_ref=str(custody["account_ref"]),
            expires_at=int(custody["expires_at"]),
            sequence=1,
        )

    async def _cancel_auth(self, command: BridgeCommand) -> dict[str, Any]:
        if not exact_keys(command.payload, {"auth_id"}) or not AUTH_ID.fullmatch(
            str(command.payload.get("auth_id", ""))
        ):
            raise ProtocolError("cancel_payload_invalid")
        auth_id = str(command.payload["auth_id"])
        custody = self.ledger.auth_custody(auth_id)
        telegram_state = self.state.get("telegram")
        current_auth_id = telegram_state.get("auth_id") if isinstance(telegram_state, dict) else None
        if custody and custody["state"] == "finalized":
            raise ProtocolError("auth_already_finalized")
        if custody and custody["state"] == "provisional" and current_auth_id == auth_id:
            await self.telegram.close_unauthorized_auth()
            self._wipe_session_after_confirmed_logout()
            self.ledger.mark_auth_state(auth_id, "revoked")
        if self.active_connect and self.active_connect.auth_id == auth_id:
            self.active_connect = None
        return result_body(
            command_id=command.id,
            sequence=1,
            status="succeeded",
            result_code="cancelled",
            result={},
        )

    async def _disconnect(self, command: BridgeCommand) -> dict[str, Any]:
        if not exact_keys(command.payload, {"account_ref", "auth_id"}) or not ACCOUNT_REF.fullmatch(
            str(command.payload.get("account_ref", ""))
        ) or not AUTH_ID.fullmatch(str(command.payload.get("auth_id", ""))):
            raise ProtocolError("disconnect_payload_invalid")
        account_ref = str(command.payload["account_ref"])
        auth_id = str(command.payload["auth_id"])
        custody = self.ledger.auth_custody_for_account(account_ref)
        telegram_state = self.state.get("telegram")
        if not custody or custody["auth_id"] != auth_id:
            raise ProtocolError("disconnect_custody_mismatch")
        last = self.ledger.last_result(command.id)
        prior_progress = last if last and last.get("status") == "progress" else None
        sequence = int(prior_progress.get("sequence", 0)) + 1 if prior_progress else 1
        if custody["state"] == "revoked":
            # Telegram logout was durably confirmed before a possible crash.
            # Finishing the local vault wipe and returning the terminal ACK is
            # safe and does not require a second provider operation.
            if isinstance(telegram_state, dict) and telegram_state.get("auth_id") == auth_id:
                self._wipe_session_after_confirmed_logout()
            return result_body(
                command_id=command.id,
                sequence=sequence,
                status="succeeded",
                result_code="revoked",
                result={},
            )
        if (not isinstance(telegram_state, dict)
            or telegram_state.get("auth_id") != auth_id
            or telegram_state.get("account_ref") != account_ref):
            raise ProtocolError("disconnect_custody_mismatch")
        self.ledger.mark_auth_state(auth_id, "revoking")
        try:
            await self.telegram.logout()
        except BaseException:
            if prior_progress:
                return prior_progress
            return result_body(
                command_id=command.id,
                sequence=1,
                status="progress",
                result_code="logout_retrying",
                result={},
            )
        # Provider confirmation is the durable cutover point. If power fails
        # after this write, the retry path above completes the DPAPI wipe and
        # terminal result without attempting Telegram logout again.
        self.ledger.mark_auth_state(auth_id, "revoked")
        self._wipe_session_after_confirmed_logout()
        return result_body(
            command_id=command.id,
            sequence=sequence,
            status="succeeded",
            result_code="revoked",
            result={},
        )

    async def _probe(self, command: BridgeCommand) -> dict[str, Any]:
        if not (exact_keys(command.payload, {"account_ref"})
            or exact_keys(command.payload, {"account_ref", "finalize_auth_id"})):
            raise ProtocolError("probe_payload_invalid")
        account_ref = command.payload.get("account_ref")
        finalize_auth_id = command.payload.get("finalize_auth_id")
        if (not isinstance(account_ref, str) or not ACCOUNT_REF.fullmatch(account_ref)
            or (finalize_auth_id is not None
                and (not isinstance(finalize_auth_id, str) or not AUTH_ID.fullmatch(finalize_auth_id)))):
            raise ProtocolError("probe_payload_invalid")
        state = await self.telegram.probe()
        masked_label = "Telegram account"
        if state == "connected":
            _confirmed_ref, masked_label = await self.telegram.connected_identity(account_ref)
        if finalize_auth_id and state == "connected":
            custody = self.ledger.auth_custody(finalize_auth_id)
            if (not custody
                or custody["account_ref"] != account_ref
                or custody["state"] not in {"provisional", "finalizing", "finalized"}):
                raise ProtocolError("finalize_custody_mismatch")
            # Resumable two-store transition: SQLite first records a non-sendable
            # finalizing marker, then the DPAPI vault is committed, then SQLite
            # becomes finalized. Startup repairs either crash boundary; expiry
            # cleanup still includes finalizing until completion.
            if custody["state"] == "provisional":
                self.ledger.mark_auth_state(finalize_auth_id, "finalizing")
            telegram = self.state.get("telegram")
            if (not isinstance(telegram, dict)
                or telegram.get("auth_id") != finalize_auth_id
                or telegram.get("account_ref") != account_ref):
                raise ProtocolError("finalize_vault_mismatch")
            if telegram.get("custody") != "finalized":
                telegram["custody"] = "finalized"
                self._save_state()
            if custody["state"] != "finalized":
                self.ledger.mark_auth_state(finalize_auth_id, "finalized")
        return result_body(
            command_id=command.id,
            sequence=1,
            status="succeeded",
            result_code="probed",
            result={
                "account_ref": account_ref,
                "state": state,
                "masked_label": masked_label,
                "checked_at": _iso_now(),
            },
        )

    @staticmethod
    def _send_result(command_id: str, outcome: ProviderOutcome) -> dict[str, Any]:
        if outcome.kind == "sent" and outcome.provider_message_id:
            return result_body(
                command_id=command_id,
                sequence=1,
                status="succeeded",
                result_code="sent",
                result={"effect_id": "", "provider_message_id": outcome.provider_message_id},
            )
        if outcome.kind == "failed":
            result: dict[str, Any] = {"effect_id": "", "retryable": False}
            if outcome.retry_after_seconds:
                result["retry_after_seconds"] = outcome.retry_after_seconds
            return result_body(
                command_id=command_id,
                sequence=1,
                status="failed",
                result_code=outcome.code or "provider_rejected",
                result=result,
            )
        return result_body(
            command_id=command_id,
            sequence=1,
            status="ambiguous",
            result_code="provider_outcome_unknown",
            result={"effect_id": ""},
        )

    async def _send(self, command: BridgeCommand) -> dict[str, Any]:
        payload = command.payload
        if not exact_keys(payload, {
            "effect_id", "account_ref", "endpoint", "text", "link_preview", "media",
            "paid_message_policy", "allow_paid_floodskip",
        }):
            raise ProtocolError("send_payload_invalid")
        effect_id = payload.get("effect_id")
        account_ref = payload.get("account_ref")
        endpoint = payload.get("endpoint")
        text = payload.get("text")
        media = payload.get("media")
        if (not isinstance(effect_id, str) or not ENTITY_ID.fullmatch(effect_id)
            or not isinstance(account_ref, str) or not ACCOUNT_REF.fullmatch(account_ref)
            or not isinstance(endpoint, str) or not SAFE_ENDPOINT.fullmatch(endpoint)
            or not valid_text(text, 1_024 if media else 4_096)
            or payload.get("link_preview") is not False
            or payload.get("paid_message_policy") != "reject"
            or payload.get("allow_paid_floodskip") is not False):
            raise ProtocolError("send_payload_invalid")
        custody = self.ledger.auth_custody_for_account(account_ref)
        if custody is None or custody["state"] != "finalized":
            raise ProtocolError("account_not_finalized")
        digest = payload_digest(payload)
        decision = self.ledger.reserve_send(effect_id, digest)
        if decision.kind == "replay":
            result = decision.result or {"kind": "ambiguous"}
            outcome = ProviderOutcome(
                str(result.get("kind", "ambiguous")),
                provider_message_id=result.get("provider_message_id"),
                code=result.get("code"),
                retry_after_seconds=result.get("retry_after_seconds"),
            )
        elif media is None:
            outcome = await self.telegram.send_text(endpoint, text)
            self.ledger.finish_send(effect_id, digest, outcome.kind, {
                "kind": outcome.kind,
                "provider_message_id": outcome.provider_message_id,
                "code": outcome.code,
                "retry_after_seconds": outcome.retry_after_seconds,
            })
        else:
            try:
                if not isinstance(media, dict) or not exact_keys(media, {
                    "media_id", "media_digest", "mime_type", "size_bytes", "download_path",
                }):
                    raise ProtocolError("media_payload_invalid")
                raw = await asyncio.to_thread(self.mailbox.download_media, command, str(media.get("download_path", "")))
                verify_media_bytes(
                    raw,
                    media_id=str(media.get("media_id", "")),
                    media_digest=str(media.get("media_digest", "")),
                    mime_type=str(media.get("mime_type", "")),
                    size_bytes=media.get("size_bytes", -1),
                )
            except (ProtocolError, SecurityError, OSError):
                # No Telegram provider call has occurred. Close the locally
                # reserved effect with the exact failure shape accepted by the
                # mailbox so an invalid/unavailable media command cannot become
                # a poison outbox result or be retried across a restart.
                outcome = ProviderOutcome("failed", code="local_validation_failed")
            else:
                outcome = await self.telegram.send_photo(endpoint, text, raw)
            self.ledger.finish_send(effect_id, digest, outcome.kind, {
                "kind": outcome.kind,
                "provider_message_id": outcome.provider_message_id,
                "code": outcome.code,
                "retry_after_seconds": outcome.retry_after_seconds,
            })
        body = self._send_result(command.id, outcome)
        body["result"]["effect_id"] = effect_id
        return body

    async def _validate_media(self, command: BridgeCommand) -> dict[str, Any]:
        if not exact_keys(command.payload, {"media"}) or not isinstance(
            command.payload.get("media"), dict
        ):
            raise ProtocolError("media_payload_invalid")
        media = command.payload["media"]
        if not exact_keys(media, {
            "media_id", "media_digest", "mime_type", "size_bytes", "download_path",
        }):
            raise ProtocolError("media_payload_invalid")
        try:
            raw = await asyncio.to_thread(self.mailbox.download_media, command, str(media.get("download_path", "")))
            verify_media_bytes(
                raw,
                media_id=str(media.get("media_id", "")),
                media_digest=str(media.get("media_digest", "")),
                mime_type=str(media.get("mime_type", "")),
                size_bytes=media.get("size_bytes", -1),
            )
            sanitize_static_image(raw)
        except (ProtocolError, SecurityError, OSError):
            return result_body(
                command_id=command.id,
                sequence=1,
                status="failed",
                result_code="media_invalid",
                result={},
            )
        return result_body(
            command_id=command.id,
            sequence=1,
            status="succeeded",
            result_code="media_valid",
            result={},
        )

    async def handle_command(self, command: BridgeCommand) -> None:
        _iso(command.lease_expires_at, maximum_future=180)
        if await self._resend_pending(command):
            return
        previous = self.ledger.last_result(command.id)
        # Terminal results are durable before HTTP acknowledgement; a re-lease
        # re-posts the same bytes and never repeats Telegram provider I/O.
        if previous and previous.get("status") in {"succeeded", "failed", "ambiguous"}:
            await asyncio.to_thread(self.mailbox.submit_result, command, previous)
            return
        if previous and previous.get("status") == "progress" and command.kind == "connect":
            if self.active_connect and self.active_connect.command.id == command.id:
                return
            if previous.get("result_code") == "awaiting_password":
                # The password command is a separate one-use mailbox item. A
                # restarted bridge must not create another QR while 2FA awaits.
                return
            if previous.get("result_code") == "awaiting_qr":
                sequence = int(previous.get("sequence", 0)) + 1
                if sequence > 32:
                    raise ProtocolError("connect_sequence_exhausted")
                if await self.telegram.is_authorized():
                    _org, auth_id, account_ref, _browser, expires = self._connect_payload(command)
                    body = await self._connected_result(
                        command,
                        auth_id=auth_id,
                        account_ref=account_ref,
                        expires_at=int(expires.timestamp()),
                        sequence=sequence,
                    )
                else:
                    body = await self._new_qr_progress(command, sequence)
                await self._submit(command, body)
                return
        if command.kind == "connect":
            body = await self._connect(command)
        elif command.kind == "connect_phone":
            body = await self._connect_phone(command)
        elif command.kind == "submit_auth":
            body = await self._submit_auth(command)
        elif command.kind == "submit_password":
            body = await self._password(command)
        elif command.kind == "cancel_auth":
            body = await self._cancel_auth(command)
        elif command.kind == "disconnect":
            body = await self._disconnect(command)
        elif command.kind == "probe":
            body = await self._probe(command)
        elif command.kind == "validate_media":
            body = await self._validate_media(command)
        elif command.kind == "send":
            body = await self._send(command)
        else:
            raise ProtocolError("command_kind_invalid")
        await self._submit(command, body)

    async def run_once(self) -> int:
        self.repair_finalizing_custody()
        await self.cleanup_expired_provisional()
        await self._advance_connect()
        # urllib is synchronous. Keep Telegram's MTProto updates and heartbeats
        # running while the outbound mailbox request is in flight.
        command, delay = await asyncio.to_thread(self.mailbox.poll, VERSION)
        if command:
            try:
                await self.handle_command(command)
            except (ProtocolError, LedgerConflict, SecurityError):
                self.logger.warning("command_rejected_locally")
                # `_submit` durably writes before transport. If either the
                # request or signed ACK was lost, that exact body must be the
                # only next result. Never append a synthetic failure behind an
                # unacknowledged sequence.
                if self.ledger.pending_result(command.id) is not None:
                    return idle_delay(delay)
                # A closed local validation failure is safe to report without
                # echoing command content or exception text.
                previous = self.ledger.last_result(command.id)
                sequence = int(previous.get("sequence", 0)) + 1 if previous else 1
                if sequence <= 32:
                    effect_id = command.payload.get("effect_id")
                    if (command.kind == "send" and isinstance(effect_id, str)
                        and ENTITY_ID.fullmatch(effect_id)):
                        # This handler also covers a ledger conflict after an
                        # attempted provider call. We cannot prove the boundary
                        # was not crossed, so retain the permanent server guard
                        # with the exact send result contract.
                        body = result_body(
                            command_id=command.id,
                            sequence=sequence,
                            status="ambiguous",
                            result_code="provider_outcome_unknown",
                            result={"effect_id": effect_id},
                        )
                    else:
                        body = result_body(
                            command_id=command.id,
                            sequence=sequence,
                            status="failed",
                            result_code="local_validation_failed",
                            result={},
                        )
                    await self._submit(command, body)
            except Exception as error:
                self.logger.warning("command_outcome_ambiguous")
                if self.ledger.pending_result(command.id) is not None:
                    return idle_delay(delay)
                if command.kind == "send":
                    previous = self.ledger.last_result(command.id)
                    sequence = int(previous.get("sequence", 0)) + 1 if previous else 1
                    if sequence <= 32:
                        body = result_body(
                            command_id=command.id,
                            sequence=sequence,
                            status="ambiguous",
                            result_code="provider_outcome_unknown",
                            result={"effect_id": str(command.payload.get("effect_id", ""))},
                        )
                        await self._submit(command, body)
                elif command.kind in {"connect", "connect_phone", "submit_auth", "submit_password", "probe"}:
                    # Authentication provider/network failures must always
                    # close the browser request with an explicit uncertain
                    # outcome. Leaving these commands leased makes the owner
                    # stare at a spinner until both relay and HTTP deadlines
                    # expire, while providing no safe retry signal.
                    previous = self.ledger.last_result(command.id)
                    sequence = int(previous.get("sequence", 0)) + 1 if previous else 1
                    if sequence <= 32:
                        body = result_body(
                            command_id=command.id,
                            sequence=sequence,
                            status="ambiguous",
                            result_code="telegram_timeout" if isinstance(error, TimeoutError) else "provider_outcome_unknown",
                            result={},
                        )
                        await self._submit(command, body)
        return idle_delay(delay)

    async def run_forever(self) -> None:
        self.ledger.recover_inflight_sends()
        delay = 1
        last_error_code: str | None = None
        while True:
            try:
                delay = await self.run_once()
                if last_error_code is not None:
                    self.logger.info("poll_recovered")
                last_error_code = None
            except Exception as error:
                code = safe_poll_error_code(error)
                delay = min(max(delay * 2, 15), 60)
                if code != last_error_code:
                    self.logger.warning(f"poll_retry code={code} next_seconds={delay}")
                last_error_code = code
            await asyncio.sleep(delay)
