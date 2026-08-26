from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from importlib import metadata
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from .e2e import generate_rsa_identity
from .installer import default_root, install, start, status, uninstall
from .ledger import BridgeLedger
from .mailbox import MailboxClient, PRODUCTION_ORIGINS
from .protocol import PAIRING_CODE, PAIRING_ID, SCHEMA, ProtocolError, b64url_encode
from .runtime import BridgeRuntime, VERSION
from .security import (
    DpapiVault,
    SecurityError,
    encoded_secret,
    secure_directory,
    strict_secret,
    verify_private_acl,
)
from .single_instance import WindowsSingleInstance
from .telegram_adapter import TelethonAccount


VAULT_FILE = "vault.dpapi"
LEDGER_FILE = "bridge-ledger.sqlite3"
PAIRING_URI_ENV = "LEAD_RADAR_TELEGRAM_PAIRING_URI"
API_ID_ENV = "LEAD_RADAR_TELEGRAM_API_ID"
API_HASH_ENV = "LEAD_RADAR_TELEGRAM_API_HASH"
BRIDGE_LABEL = "Lead Radar Windows Bridge"


def _root(value: str | None) -> Path:
    return Path(value).resolve() if value else default_root().resolve()


def _pairing_uri(raw: str) -> tuple[str, str, str]:
    parsed = urlsplit(raw.strip())
    if (parsed.scheme != "gptbot-lead-radar" or parsed.netloc != "pair"
        or parsed.path not in {"", "/"} or parsed.query):
        raise ProtocolError("pairing_uri_invalid")
    values = parse_qs(parsed.fragment, keep_blank_values=True, strict_parsing=True)
    if set(values) != {"id", "code", "origin"} or any(len(value) != 1 for value in values.values()):
        raise ProtocolError("pairing_uri_invalid")
    pairing_id = values["id"][0]
    code = values["code"][0]
    origin = values["origin"][0]
    if not PAIRING_ID.fullmatch(pairing_id) or not PAIRING_CODE.fullmatch(code):
        raise ProtocolError("pairing_uri_invalid")
    if origin not in PRODUCTION_ORIGINS:
        raise ProtocolError("server_origin_not_allowed")
    return pairing_id, code, origin


def _activation_uri(raw: str) -> tuple[str, str]:
    """Parse the non-secret custom-protocol activation URI.

    Windows passes custom protocol URIs in the process command line. Therefore
    the enrollment code is intentionally forbidden here and collected through
    a local masked prompt instead.
    """
    parsed = urlsplit(raw.strip())
    if (parsed.scheme != "gptbot-lead-radar" or parsed.netloc != "pair"
        or parsed.path not in {"", "/"} or parsed.query):
        raise ProtocolError("pairing_uri_invalid")
    values = parse_qs(parsed.fragment, keep_blank_values=True, strict_parsing=True)
    if set(values) != {"id", "origin"} or any(len(value) != 1 for value in values.values()):
        raise ProtocolError("pairing_uri_invalid")
    pairing_id = values["id"][0]
    origin = values["origin"][0]
    if not PAIRING_ID.fullmatch(pairing_id) or origin not in PRODUCTION_ORIGINS:
        raise ProtocolError("pairing_uri_invalid")
    return pairing_id, origin


def _prompt_pairing_code() -> str:
    if os.name != "nt":
        raise SecurityError("windows_runtime_required")
    try:
        import tkinter as tk
        from tkinter import simpledialog
        owner = tk.Tk()
        owner.withdraw()
        owner.attributes("-topmost", True)
        value = simpledialog.askstring(
            "Lead Radar Telegram Bridge",
            "Вставьте одноразовый код из Lead Radar:",
            show="•",
            parent=owner,
        )
        owner.destroy()
    except BaseException as exc:
        raise SecurityError("pairing_code_prompt_failed") from exc
    if not isinstance(value, str) or not PAIRING_CODE.fullmatch(value.strip()):
        raise SecurityError("pairing_code_invalid")
    return value.strip()


def _read_pairing(args: argparse.Namespace) -> str:
    sources = int(bool(args.stdin)) + int(bool(args.file))
    environment = os.environ.pop(PAIRING_URI_ENV, None)
    sources += int(environment is not None)
    if sources != 1:
        raise SecurityError("one_pairing_input_required")
    if args.stdin:
        return sys.stdin.readline(4_096).strip()
    if args.file:
        path = Path(args.file).resolve()
        if os.name == "nt":
            verify_private_acl(path)
        return path.read_text(encoding="utf-8").strip()
    return str(environment)


def _telegram_credentials() -> tuple[int, str]:
    api_id_raw = os.environ.pop(API_ID_ENV, "")
    api_hash = os.environ.pop(API_HASH_ENV, "")
    try:
        api_id = int(api_id_raw)
    except ValueError as exc:
        raise SecurityError("telegram_credentials_missing") from exc
    if not 1_000 <= api_id <= 999_999_999_999 or not __import__("re").fullmatch(
        r"[a-f0-9]{32}", api_hash
    ):
        raise SecurityError("telegram_credentials_missing")
    return api_id, api_hash


def configure_telegram_credentials(root: Path, *, rotate: bool = False) -> None:
    """Import Telegram application credentials into the CurrentUser DPAPI vault.

    Credentials are accepted only through the process environment and are
    removed from ``os.environ`` immediately.  A later custom-URI launch has no
    dependency on the browser process environment.  Rotation is deliberately
    explicit and is forbidden while any Telegram session is under custody.
    """
    secure_directory(root)
    api_id, api_hash = _telegram_credentials()
    vault = DpapiVault(root / VAULT_FILE)
    state = vault.load() or {}
    telegram = state.get("telegram")
    if telegram is not None and not isinstance(telegram, dict):
        raise SecurityError("telegram_state_invalid")
    current = telegram or {}
    existing_id = current.get("api_id")
    existing_hash = current.get("api_hash")
    if existing_id is not None or existing_hash is not None:
        if existing_id == api_id and existing_hash == api_hash:
            return
        if not rotate:
            raise SecurityError("telegram_credentials_conflict")
        if (current.get("session") or current.get("auth_id") or current.get("account_ref")
            or current.get("custody") not in {None, "revoked"}):
            raise SecurityError("telegram_credentials_in_use")
    state["telegram"] = {
        **current,
        "api_id": api_id,
        "api_hash": api_hash,
        "session": str(current.get("session", "")),
        "auth_id": current.get("auth_id"),
        "account_ref": current.get("account_ref"),
        "custody": str(current.get("custody", "revoked")),
        "expires_at": int(current.get("expires_at", 0)),
    }
    vault.save({key: value for key, value in state.items() if key != "schema"})


def _configured_telegram(state: dict[str, object]) -> dict[str, object]:
    telegram = state.get("telegram")
    if not isinstance(telegram, dict):
        raise SecurityError("telegram_credentials_missing")
    api_id = telegram.get("api_id")
    api_hash = telegram.get("api_hash")
    if (not isinstance(api_id, int) or not 1_000 <= api_id <= 999_999_999_999
        or not isinstance(api_hash, str)
        or not __import__("re").fullmatch(r"[a-f0-9]{32}", api_hash)):
        raise SecurityError("telegram_credentials_missing")
    return telegram


def _complete_pending_registration(
    vault: DpapiVault,
    state: dict[str, object],
) -> dict[str, object]:
    device = state.get("device")
    if not isinstance(device, dict):
        raise SecurityError("bridge_pairing_incomplete")
    if isinstance(device.get("device_id"), str):
        return state
    pairing_id = device.get("pairing_id")
    pairing_code = device.get("pairing_code")
    origin = device.get("origin")
    public_key = device.get("public_key_spki")
    if (not isinstance(pairing_id, str) or not PAIRING_ID.fullmatch(pairing_id)
        or not isinstance(pairing_code, str) or not PAIRING_CODE.fullmatch(pairing_code)
        or not isinstance(origin, str) or origin not in PRODUCTION_ORIGINS
        or not isinstance(public_key, str)):
        raise SecurityError("bridge_pairing_incomplete")
    secret = strict_secret(str(device.get("device_secret", "")))
    registered = MailboxClient(origin).register({
        "schema": SCHEMA,
        "pairing_id": pairing_id,
        "pairing_code": pairing_code,
        "device_secret": b64url_encode(secret),
        "label": BRIDGE_LABEL,
        "version": VERSION,
        "encryption_public_key_spki": public_key,
    })
    device["device_id"] = registered.device_id
    device.pop("pairing_id", None)
    device.pop("pairing_code", None)
    vault.save({key: value for key, value in state.items() if key != "schema"})
    return state


def pair_device(root: Path, raw_uri: str) -> None:
    secure_directory(root)
    pairing_id, code, origin = _pairing_uri(raw_uri)
    vault = DpapiVault(root / VAULT_FILE)
    state = vault.load() or {}
    telegram = _configured_telegram(state)
    device = state.get("device")
    same_pending_pairing = False
    if isinstance(device, dict):
        if device.get("device_id"):
            raise SecurityError("bridge_already_paired")
        same_pending_pairing = (
            device.get("pairing_id") == pairing_id and device.get("origin") == origin
        )
        if not same_pending_pairing:
            # A signed registration response may be lost after the server
            # commits. Once the owner revokes that offline/no-account device,
            # a new one-time URI must be recoverable locally. Reset only an
            # unconfirmed device and only when no Telegram custody exists.
            if (telegram.get("session") or telegram.get("auth_id")
                or telegram.get("account_ref")
                or telegram.get("custody") not in {None, "revoked"}):
                raise SecurityError("pairing_retry_conflict")
            device = None
        if same_pending_pairing:
            secret = strict_secret(str(device.get("device_secret", "")))
            private_key = str(device.get("private_key_pkcs8", ""))
            public_key = str(device.get("public_key_spki", ""))
            key_id = str(device.get("key_id", ""))
    if not isinstance(device, dict) or not same_pending_pairing:
        identity = generate_rsa_identity()
        secret = vault.initialize_device_secret()
        private_key = identity.private_key_pkcs8
        public_key = identity.public_key_spki
        key_id = identity.key_id
        state = {key: value for key, value in state.items() if key != "schema"}
    state.update({
        "device": {
            "device_id": None,
            "device_secret": encoded_secret(secret),
            "private_key_pkcs8": private_key,
            "public_key_spki": public_key,
            "key_id": key_id,
            "origin": origin,
            "pairing_id": pairing_id,
            "pairing_code": code,
        },
        "telegram": telegram,
    })
    # Persist all locally generated custody material before registration. A
    # dropped signed response can then repeat registration with the exact same
    # secret/key and recover the already-committed device id.
    vault.save({key: value for key, value in state.items() if key != "schema"})
    _complete_pending_registration(vault, state)


async def run_bridge(root: Path) -> None:
    secure_directory(root)
    secure_directory(root / "tmp")
    vault = DpapiVault(root / VAULT_FILE)
    state = vault.load()
    if not state or not isinstance(state.get("device"), dict) or not isinstance(
        state.get("telegram"), dict
    ):
        raise SecurityError("bridge_not_paired")
    if not isinstance(state["device"].get("device_id"), str):
        state = _complete_pending_registration(vault, state)
    device = state["device"]
    telegram_state = state["telegram"]
    device_id = device.get("device_id")
    if not isinstance(device_id, str):
        raise SecurityError("bridge_pairing_incomplete")
    secret = strict_secret(str(device.get("device_secret", "")))
    mailbox = MailboxClient(
        str(device.get("origin", "")),
        device_id=device_id,
        device_secret=secret,
    )
    ledger = BridgeLedger(root / LEDGER_FILE)
    try:
        telegram = TelethonAccount(
            api_id=int(telegram_state.get("api_id", 0)),
            api_hash=str(telegram_state.get("api_hash", "")),
            session=str(telegram_state.get("session", "")),
            device_id=device_id,
            secure_temp=root / "tmp",
        )
        runtime = BridgeRuntime(
            root=root,
            vault=vault,
            ledger=ledger,
            mailbox=mailbox,
            telegram=telegram,
            vault_state=state,
        )
        await runtime.run_forever()
    finally:
        ledger.close()


def self_test(root: Path) -> None:
    expected = {
        "cryptography": "45.0.7",
        "Pillow": "11.3.0",
        "qrcode": "8.2",
        "Telethon": "1.44.0",
        "cffi": "1.17.1",
        "colorama": "0.4.6",
        "pyaes": "1.6.1",
        "pyasn1": "0.6.1",
        "pycparser": "2.22",
        "rsa": "4.9.1",
    }
    if sys.version_info[:2] != (3, 12):
        raise SecurityError("python_version_unsupported")
    for distribution, version in expected.items():
        if metadata.version(distribution) != version:
            raise SecurityError("dependency_version_mismatch")
    secure_directory(root)
    probe = root / ".dpapi-self-test"
    vault = DpapiVault(probe)
    try:
        vault.save({"probe": "ok"})
        loaded = vault.load()
        if not loaded or loaded.get("probe") != "ok":
            raise SecurityError("self_test_failed")
    finally:
        probe.unlink(missing_ok=True)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="leadradar-telegram-bridge")
    commands = result.add_subparsers(dest="command", required=True)
    for name in ("install", "status", "self-test", "uninstall", "run"):
        command = commands.add_parser(name)
        command.add_argument("--root")
    configure = commands.add_parser("configure")
    configure.add_argument("--root")
    configure.add_argument("--rotate-credentials", action="store_true")
    pair = commands.add_parser("pair")
    pair.add_argument("--root")
    pair.add_argument("--stdin", action="store_true")
    pair.add_argument("--file")
    pair_uri = commands.add_parser("pair-uri")
    pair_uri.add_argument("--root")
    pair_uri.add_argument("uri")
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        root = _root(args.root)
        if args.command == "install":
            print(json.dumps({"status": "installed", "root": str(install(root))}))
        elif args.command == "configure":
            with WindowsSingleInstance():
                configure_telegram_credentials(root, rotate=bool(args.rotate_credentials))
            print('{"status":"configured"}')
        elif args.command == "status":
            print(json.dumps(status(root), separators=(",", ":"), sort_keys=True))
        elif args.command == "self-test":
            self_test(root)
            print('{"status":"ok"}')
        elif args.command == "uninstall":
            uninstall(root)
            print('{"status":"uninstalled","data_retained":true}')
        elif args.command in {"pair", "pair-uri"}:
            if args.command == "pair-uri":
                pairing_id, origin = _activation_uri(args.uri)
                code = _prompt_pairing_code()
                raw = f"gptbot-lead-radar://pair#id={pairing_id}&code={code}&origin={origin}"
            else:
                raw = _read_pairing(args)
            registration_pending = False
            with WindowsSingleInstance():
                try:
                    pair_device(root, raw)
                except OSError:
                    # The request or signed response may have been lost after
                    # server commit. Exact secret/key/code are already under
                    # DPAPI, so the background task can safely retry.
                    registration_pending = True
            # The URI handler runs in a short-lived pythonw process. Start the
            # exact verified per-user task after releasing the mutex so the
            # bridge becomes online immediately, without a reboot/sign-out.
            start(root)
            print('{"status":"pairing_pending"}' if registration_pending else '{"status":"paired"}')
        elif args.command == "run":
            with WindowsSingleInstance():
                asyncio.run(run_bridge(root))
        return 0
    except (ProtocolError, SecurityError, ValueError, OSError) as error:
        # Only stable allowlisted diagnostics cross the CLI boundary. Never
        # echo exception text, paths, enrollment material or provider details.
        raw_code = str(error)
        code_map = {
            "telegram_credentials_missing": "credentials_missing",
            "telegram_credentials_conflict": "credentials_already_configured",
            "telegram_credentials_in_use": "credentials_in_use",
            "bridge_already_paired": "already_paired",
            "pairing_retry_conflict": "pairing_conflict",
            "registration_rejected": "pairing_expired_or_rejected",
            "server_origin_not_allowed": "origin_not_allowed",
            "foreign_scheduled_task": "installation_conflict",
            "foreign_uri_handler": "installation_conflict",
            "bridge_already_running": "already_running",
            "bridge_not_paired": "not_paired",
            "installation_marker_missing": "not_installed",
        }
        code = code_map.get(raw_code, "operation_failed")
        print(json.dumps({"status": "error", "code": code}, separators=(",", ":")), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
