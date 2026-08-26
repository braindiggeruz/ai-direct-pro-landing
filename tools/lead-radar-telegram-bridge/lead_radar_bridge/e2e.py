from __future__ import annotations

import hashlib
import datetime as dt
import base64
import io
import time
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .protocol import E2EEnvelope, ProtocolError, b64url_decode, b64url_encode, canonical_json, exact_keys, strict_json


MAX_ENVELOPE_LIFETIME_SECONDS = 90
COMMON_CONTEXT_KEYS = {
    "schema", "purpose", "org_id", "device_id", "command_id", "auth_id", "expires_at",
}


@dataclass(frozen=True)
class RsaIdentity:
    private_key_pkcs8: str
    public_key_spki: str
    key_id: str


def generate_rsa_identity(bits: int = 3072) -> RsaIdentity:
    if bits not in {2048, 3072, 4096}:
        raise ProtocolError("rsa_bits_invalid")
    private = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    private_der = private.private_bytes(
        serialization.Encoding.DER,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    public_der = private.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return RsaIdentity(
        private_key_pkcs8=b64url_encode(private_der),
        public_key_spki=b64url_encode(public_der),
        key_id=hashlib.sha256(public_der).hexdigest(),
    )


def load_private_key(value: str) -> rsa.RSAPrivateKey:
    raw = b64url_decode(value, minimum=1_000, maximum=5_000)
    try:
        key = serialization.load_der_private_key(raw, password=None)
    except (TypeError, ValueError) as exc:
        raise ProtocolError("private_key_invalid") from exc
    if not isinstance(key, rsa.RSAPrivateKey) or key.key_size < 2048:
        raise ProtocolError("private_key_invalid")
    return key


def load_public_key(value: str) -> tuple[rsa.RSAPublicKey, str]:
    raw = b64url_decode(value, minimum=256, maximum=1_024)
    try:
        key = serialization.load_der_public_key(raw)
    except (TypeError, ValueError) as exc:
        raise ProtocolError("public_key_invalid") from exc
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size < 2048:
        raise ProtocolError("public_key_invalid")
    return key, hashlib.sha256(raw).hexdigest()


def envelope_encrypt(
    public_key_spki: str,
    context: dict[str, Any],
    *,
    key_id: str | None = None,
) -> dict[str, str]:
    public_key, derived_key_id = load_public_key(public_key_spki)
    envelope_key_id = derived_key_id if key_id is None else key_id
    if not isinstance(envelope_key_id, str) or not __import__("re").fullmatch(
        r"[A-Za-z0-9:_-]{8,80}", envelope_key_id
    ):
        raise ProtocolError("e2e_key_id_invalid")
    if envelope_key_id != derived_key_id:
        raise ProtocolError("e2e_key_mismatch")
    plaintext = canonical_json(context)
    content_key = AESGCM.generate_key(bit_length=256)
    iv = __import__("secrets").token_bytes(12)
    ciphertext = AESGCM(content_key).encrypt(iv, plaintext, None)
    wrapped = public_key.encrypt(
        content_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return E2EEnvelope(envelope_key_id, wrapped, iv, ciphertext).json()


def envelope_decrypt_context(
    private_key_pkcs8: str,
    value: Any,
    *,
    purpose: str,
    org_id: str,
    device_id: str,
    command_id: str,
    auth_id: str,
    now: int | None = None,
) -> Any:
    envelope = E2EEnvelope.parse(value)
    private_key = load_private_key(private_key_pkcs8)
    public_der = private_key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    if not __import__("hmac").compare_digest(envelope.key_id, hashlib.sha256(public_der).hexdigest()):
        raise ProtocolError("e2e_key_mismatch")
    try:
        content_key = private_key.decrypt(
            envelope.wrapped_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
        plaintext = AESGCM(content_key).decrypt(envelope.iv, envelope.ciphertext, None)
        context = strict_json(plaintext)
    except (ValueError, ProtocolError) as exc:
        raise ProtocolError("e2e_decrypt_failed") from exc
    if set(context) != COMMON_CONTEXT_KEYS | {"value"}:
        raise ProtocolError("e2e_context_invalid")
    expected = {
        "schema": "gptbot.lead-radar.telegram-bridge.v1",
        "purpose": purpose,
        "org_id": org_id,
        "device_id": device_id,
        "command_id": command_id,
        "auth_id": auth_id,
    }
    if any(context.get(key) != expected_value for key, expected_value in expected.items()):
        raise ProtocolError("e2e_context_mismatch")
    expires_at = context.get("expires_at")
    current = int(time.time()) if now is None else now
    if not isinstance(expires_at, int) or isinstance(expires_at, bool):
        raise ProtocolError("e2e_expiry_invalid")
    if expires_at < current or expires_at > current + MAX_ENVELOPE_LIFETIME_SECONDS:
        raise ProtocolError("e2e_expired")
    return context.get("value")


def _parse_iso_expiry(value: Any, *, now: dt.datetime | None = None) -> dt.datetime:
    if not isinstance(value, str) or not 20 <= len(value) <= 40:
        raise ProtocolError("e2e_expiry_invalid")
    try:
        expires = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProtocolError("e2e_expiry_invalid") from exc
    if expires.tzinfo is None:
        raise ProtocolError("e2e_expiry_invalid")
    current = now or dt.datetime.now(dt.timezone.utc)
    if expires <= current - dt.timedelta(seconds=5) or expires > current + dt.timedelta(
        seconds=MAX_ENVELOPE_LIFETIME_SECONDS
    ):
        raise ProtocolError("e2e_expired")
    return expires


def encrypt_qr_envelope(
    *,
    public_key_spki: str,
    key_id: str,
    org_id: str,
    device_id: str,
    command_id: str,
    auth_id: str,
    expires_at: str,
    qr_login_url: str,
) -> dict[str, str]:
    _parse_iso_expiry(expires_at)
    if not __import__("re").fullmatch(r"tg://login\?token=[A-Za-z0-9_-]{16,512}={0,2}", qr_login_url):
        raise ProtocolError("qr_login_url_invalid")
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=8,
            border=4,
        )
        qr.add_data(qr_login_url)
        qr.make(fit=True)
        image = qr.make_image(fill_color="black", back_color="white")
        output = io.BytesIO()
        image.save(output, format="PNG", optimize=True)
        png = output.getvalue()
    except (ImportError, OSError, ValueError) as exc:
        raise ProtocolError("qr_render_failed") from exc
    qr_code_data_url = "data:image/png;base64," + base64.b64encode(png).decode("ascii")
    # Shared/browser envelope bound is 131,072 base64 characters. Leave ample
    # room for encrypted context and OAEP/GCM framing.
    if len(qr_code_data_url) > 90_000:
        raise ProtocolError("qr_render_failed")
    return envelope_encrypt(public_key_spki, {
        "schema": "gptbot.lead-radar.telegram-bridge.v1",
        "purpose": "qr",
        "org_id": org_id,
        "device_id": device_id,
        "command_id": command_id,
        "auth_id": auth_id,
        "expires_at": expires_at,
        "qr_login_url": qr_login_url,
        "qr_code_data_url": qr_code_data_url,
    }, key_id=key_id)


def decrypt_password_envelope(
    private_key_pkcs8: str,
    value: Any,
    *,
    key_id: str,
    org_id: str,
    device_id: str,
    command_id: str,
    auth_id: str,
    now: dt.datetime | None = None,
) -> str:
    envelope = E2EEnvelope.parse(value)
    if envelope.key_id != key_id:
        raise ProtocolError("e2e_key_mismatch")
    private_key = load_private_key(private_key_pkcs8)
    try:
        content_key = private_key.decrypt(
            envelope.wrapped_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
        plaintext = AESGCM(content_key).decrypt(envelope.iv, envelope.ciphertext, None)
        context = strict_json(plaintext)
    except (ValueError, ProtocolError) as exc:
        raise ProtocolError("e2e_decrypt_failed") from exc
    if (set(context) != COMMON_CONTEXT_KEYS | {"password"}
        or context.get("schema") != "gptbot.lead-radar.telegram-bridge.v1"
        or context.get("purpose") != "password"
        or context.get("org_id") != org_id
        or context.get("device_id") != device_id
        or context.get("command_id") != command_id
        or context.get("auth_id") != auth_id):
        raise ProtocolError("e2e_context_mismatch")
    _parse_iso_expiry(context.get("expires_at"), now=now)
    password = context.get("password")
    if not isinstance(password, str) or not 1 <= len(password.encode("utf-8")) <= 256 or "\x00" in password:
        raise ProtocolError("password_invalid")
    return password


def public_spki_key_id(value: str) -> str:
    _key, key_id = load_public_key(value)
    return key_id
