from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

from .media import private_photo_file, sanitize_static_image
from .protocol import ProtocolError, valid_text


@dataclass(frozen=True)
class ProviderOutcome:
    kind: str
    provider_message_id: str | None = None
    code: str | None = None
    retry_after_seconds: int | None = None


class TelegramBridgeError(RuntimeError):
    pass


class PeerNotRegularUserError(TelegramBridgeError):
    pass


def masked_account_label(_user: Any) -> str:
    """Return a recognizable but non-identifying account hint.

    A full username, phone number, name or numeric Telegram id never crosses
    the bridge boundary. Two accounts remain distinguishable enough for an
    owner confirmation without turning D1 into an identity store.
    """
    username = getattr(_user, "username", None)
    if isinstance(username, str) and __import__("re").fullmatch(r"[A-Za-z0-9_]{5,32}", username):
        if len(username) < 8:
            return f"@{username[:1]}{'•' * min(5, max(3, len(username) - 2))}{username[-1:]}"
        return f"@{username[:2]}{'•' * min(5, max(3, len(username) - 4))}{username[-2:]}"
    phone = getattr(_user, "phone", None)
    if isinstance(phone, str):
        digits = "".join(character for character in phone if character.isascii() and character.isdigit())
        if len(digits) >= 4:
            return f"Telegram ••••{digits[-4:]}"
    initials: list[str] = []
    for value in (getattr(_user, "first_name", None), getattr(_user, "last_name", None)):
        if isinstance(value, str):
            clean = "".join(character for character in value.strip() if character.isalpha())
            if clean:
                initials.append(clean[0].upper())
    return f"Telegram {'·'.join(initials[:2])}" if initials else "Telegram account"


def classify_provider_exception(error: BaseException) -> ProviderOutcome:
    name = error.__class__.__name__
    explicit: dict[str, str] = {
        "PeerIdInvalidError": "peer_invalid",
        "UsernameInvalidError": "peer_invalid",
        "UsernameNotOccupiedError": "peer_invalid",
        "UserPrivacyRestrictedError": "privacy_restricted",
        "ChatWriteForbiddenError": "privacy_restricted",
        "UserIsBlockedError": "privacy_restricted",
        "FloodWaitError": "flood_wait",
        "FloodPremiumWaitError": "flood_premium_wait",
        "SlowModeWaitError": "slow_mode",
        "UserRestrictedError": "account_restricted",
        "AuthKeyUnregisteredError": "account_restricted",
        "SessionRevokedError": "account_restricted",
        "ChatWriteForbidden": "privacy_restricted",
        "PeerNotRegularUserError": "peer_invalid",
    }
    code = explicit.get(name)
    if code:
        seconds = getattr(error, "seconds", None)
        return ProviderOutcome(
            "failed",
            code=code,
            retry_after_seconds=(seconds if isinstance(seconds, int) and 1 <= seconds <= 86_400 else None),
        )
    # Only known, explicit Telegram RPC rejections are definitive. Network,
    # timeout, cancellation and unknown library responses cross an uncertain
    # provider boundary and must never be retried automatically.
    return ProviderOutcome("ambiguous")


class TelethonAccount:
    def __init__(
        self,
        *,
        api_id: int,
        api_hash: str,
        session: str,
        device_id: str,
        secure_temp: Path,
        client_factory: Callable[[str, int, str], Any] | None = None,
        request_timeout: float = 20.0,
    ) -> None:
        if not 1_000 <= api_id <= 999_999_999_999 or not __import__("re").fullmatch(
            r"[a-f0-9]{32}", api_hash
        ):
            raise TelegramBridgeError("telegram_credentials_invalid")
        self.api_id = api_id
        self.api_hash = api_hash
        self.device_id = device_id
        self.secure_temp = secure_temp
        self._session_value = session
        self._factory = client_factory or self._default_factory
        self.request_timeout = request_timeout
        self.client: Any | None = None
        self.qr_login: Any | None = None
        self.auth_id: str | None = None
        self.pending_phone: str | None = None
        self.pending_phone_code_hash: str | None = None

    @staticmethod
    def _default_factory(session: str, api_id: int, api_hash: str) -> Any:
        try:
            from telethon import TelegramClient
            from telethon.sessions import StringSession
        except ImportError as exc:
            raise TelegramBridgeError("telethon_dependency_missing") from exc
        return TelegramClient(
            StringSession(session), api_id, api_hash,
            timeout=10, connection_retries=1, request_retries=1,
            retry_delay=1, flood_sleep_threshold=0, raise_last_call_error=True,
            device_model="Lead Radar Windows Bridge", app_version="1.3.1",
        )

    async def _request(self, request: Awaitable[Any]) -> Any:
        # Telethon's `timeout` only bounds connecting, not awaited RPCs.
        # Never sleep through FloodWait or leave a mailbox command leased forever.
        return await asyncio.wait_for(request, timeout=self.request_timeout)

    async def ensure_connected(self) -> Any:
        if self.client is None:
            self.client = self._factory(self._session_value, self.api_id, self.api_hash)
        if not self.client.is_connected():
            await self._request(self.client.connect())
        return self.client

    async def begin_qr(self, auth_id: str) -> str:
        client = await self.ensure_connected()
        self.auth_id = auth_id
        self.qr_login = await self._request(client.qr_login())
        url = getattr(self.qr_login, "url", None)
        if not isinstance(url, str) or not __import__("re").fullmatch(
            r"tg://login\?token=[A-Za-z0-9_-]{16,512}={0,2}", url
        ):
            raise TelegramBridgeError("qr_invalid")
        return url

    async def begin_phone(self, auth_id: str) -> None:
        await self.ensure_connected()
        self.auth_id = auth_id
        self.qr_login = None
        self.pending_phone = None
        self.pending_phone_code_hash = None

    async def submit_phone(self, phone: str) -> str:
        if not isinstance(phone, str) or not __import__("re").fullmatch(r"\+[1-9]\d{6,14}", phone):
            raise ProtocolError("phone_invalid")
        client = await self.ensure_connected()
        sent = await self._request(client.send_code_request(phone, force_sms=False))
        phone_code_hash = getattr(sent, "phone_code_hash", None)
        if not isinstance(phone_code_hash, str) or not 8 <= len(phone_code_hash) <= 256:
            raise TelegramBridgeError("phone_code_hash_invalid")
        self.pending_phone = phone
        self.pending_phone_code_hash = phone_code_hash
        return phone_code_hash

    async def submit_code(self, code: str, *, phone: str, phone_code_hash: str) -> str:
        if (not isinstance(code, str) or not __import__("re").fullmatch(r"[0-9A-Za-z_-]{3,16}", code)
            or not isinstance(phone, str) or not __import__("re").fullmatch(r"\+[1-9]\d{6,14}", phone)
            or not isinstance(phone_code_hash, str) or not 8 <= len(phone_code_hash) <= 256):
            raise ProtocolError("code_invalid")
        client = await self.ensure_connected()
        try:
            await self._request(client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash))
        except BaseException as error:
            if error.__class__.__name__ == "SessionPasswordNeededError":
                return "awaiting_password"
            raise
        if not await self.is_authorized():
            raise TelegramBridgeError("code_rejected")
        self.pending_phone = None
        self.pending_phone_code_hash = None
        return "connected"

    async def wait_qr(self, timeout_seconds: int = 1) -> str:
        if self.qr_login is None:
            raise TelegramBridgeError("qr_not_started")
        try:
            await self.qr_login.wait(timeout=timeout_seconds)
        except asyncio.TimeoutError:
            return "awaiting_qr"
        except BaseException as error:
            if error.__class__.__name__ == "SessionPasswordNeededError":
                return "awaiting_password"
            if error.__class__.__name__ == "AuthTokenExpiredError":
                return "qr_expired"
            raise
        return "connected" if await self.is_authorized() else "awaiting_qr"

    async def submit_password(self, password: str) -> None:
        if not isinstance(password, str) or not 1 <= len(password.encode("utf-8")) <= 256 or "\x00" in password:
            raise ProtocolError("password_invalid")
        client = await self.ensure_connected()
        await self._request(client.sign_in(password=password))
        if not await self.is_authorized():
            raise TelegramBridgeError("password_rejected")

    async def is_authorized(self) -> bool:
        client = await self.ensure_connected()
        return bool(await self._request(client.is_user_authorized()))

    async def connected_identity(self, expected_account_ref: str) -> tuple[str, str]:
        if not __import__("re").fullmatch(r"lracct_[A-Za-z0-9_-]{43}", expected_account_ref):
            raise TelegramBridgeError("account_ref_invalid")
        client = await self.ensure_connected()
        user = await self._request(client.get_me())
        identifier = getattr(user, "id", None)
        if not isinstance(identifier, int) or identifier < 1:
            raise TelegramBridgeError("telegram_identity_invalid")
        return expected_account_ref, masked_account_label(user)

    def export_session(self) -> str:
        if self.client is None:
            raise TelegramBridgeError("telegram_client_missing")
        saved = self.client.session.save()
        if not isinstance(saved, str) or not 1 <= len(saved) <= 16_384:
            raise TelegramBridgeError("telegram_session_invalid")
        return saved

    async def probe(self) -> str:
        try:
            return "connected" if await self.is_authorized() else "reauth_required"
        except Exception as error:
            if error.__class__.__name__ in {"AuthKeyUnregisteredError", "SessionRevokedError"}:
                return "revoked"
            if error.__class__.__name__ == "UserRestrictedError":
                return "restricted"
            # A network outage is not a Telegram restriction or revocation.
            raise

    async def logout(self) -> None:
        client = await self.ensure_connected()
        confirmed = False
        try:
            if not await self._request(client.is_user_authorized()):
                confirmed = True
            else:
                result = await self._request(client.log_out())
                if result is False:
                    raise TelegramBridgeError("telegram_logout_unconfirmed")
                confirmed = True
        except BaseException as error:
            if error.__class__.__name__ in {
                "AuthKeyUnregisteredError", "SessionRevokedError", "SessionExpiredError"
            }:
                confirmed = True
            else:
                # Preserve the StringSession so a later pending-revocation poll
                # can retry the provider logout. Local deletion alone is not a
                # revocation acknowledgement.
                try:
                    await self._request(client.disconnect())
                finally:
                    self.client = None
                raise
        finally:
            if confirmed:
                try:
                    await self._request(client.disconnect())
                finally:
                    self.client = None
                    self.qr_login = None
                    self.pending_phone = None
                    self.pending_phone_code_hash = None
                    self._session_value = ""

    async def close_unauthorized_auth(self) -> None:
        client = await self.ensure_connected()
        if await self._request(client.is_user_authorized()):
            await self.logout()
            return
        await self._request(client.disconnect())
        self.client = None
        self.qr_login = None
        self.pending_phone = None
        self.pending_phone_code_hash = None
        self._session_value = ""

    async def _resolved_regular_user(self, endpoint: str) -> tuple[Any, Any]:
        client = await self.ensure_connected()
        try:
            from telethon.tl.types import User
        except ImportError as exc:
            raise TelegramBridgeError("telethon_dependency_missing") from exc
        # Prefixing with `@` forces username resolution. Passing a bare digit
        # sequence lets Telethon interpret it as an id/phone/contact lookup.
        entity = await self._request(client.get_entity(f"@{endpoint}"))
        if (not isinstance(entity, User)
            or bool(getattr(entity, "bot", False))
            or bool(getattr(entity, "deleted", False))
            or not isinstance(getattr(entity, "username", None), str)
            or entity.username.casefold() != endpoint.casefold()):
            raise PeerNotRegularUserError("peer_not_regular_user")
        return client, entity

    async def send_text(self, endpoint: str, text: str) -> ProviderOutcome:
        if not valid_text(text, 4_096):
            return ProviderOutcome("failed", code="provider_rejected")
        try:
            client, entity = await self._resolved_regular_user(endpoint)
            message = await self._request(client.send_message(
                entity,
                text,
                parse_mode=None,
                formatting_entities=[],
                link_preview=False,
            ))
            message_id = getattr(message, "id", None)
            if not isinstance(message_id, int) or message_id < 1:
                return ProviderOutcome("ambiguous")
            return ProviderOutcome("sent", provider_message_id=str(message_id))
        except BaseException as error:
            return classify_provider_exception(error)

    async def send_photo(self, endpoint: str, text: str, value: bytes) -> ProviderOutcome:
        if not valid_text(text, 1_024):
            return ProviderOutcome("failed", code="provider_rejected")
        try:
            sanitized = sanitize_static_image(value)
        except ProtocolError:
            return ProviderOutcome("failed", code="media_invalid")
        try:
            client, entity = await self._resolved_regular_user(endpoint)
            with private_photo_file(sanitized, self.secure_temp) as photo:
                message = await self._request(client.send_file(
                    entity,
                    str(photo),
                    caption=text,
                    parse_mode=None,
                    formatting_entities=[],
                    force_document=False,
                ))
            message_id = getattr(message, "id", None)
            if not isinstance(message_id, int) or message_id < 1:
                return ProviderOutcome("ambiguous")
            return ProviderOutcome("sent", provider_message_id=str(message_id))
        except BaseException as error:
            return classify_provider_exception(error)
