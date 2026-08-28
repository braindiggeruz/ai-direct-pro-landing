from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from importlib import metadata
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from .e2e import generate_rsa_identity
from .installer import default_root, install, start, status, stop, uninstall
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


def _pairing_error_copy(error: BaseException) -> str:
    code = str(error)
    return {
        "pairing_code_invalid": "Код имеет неверный формат. Скопируйте его целиком из Lead Radar.",
        "registration_rejected": "Код истёк или уже использован. Создайте новую привязку на сайте.",
        "registration_rate_limited": "Слишком много попыток привязки. Подождите и создайте новый код на сайте.",
        "registration_server_unavailable": "Сервис привязки временно недоступен. Окно останется открытым — повторите попытку позже.",
        "bridge_already_running": "Фоновый Bridge не остановился. Подождите несколько секунд и повторите.",
        "foreign_scheduled_task": "Установка Bridge повреждена. Переустановите локальную программу.",
        "foreign_uri_handler": "Обработчик кнопки принадлежит другой программе. Переустановите Bridge.",
        "telegram_credentials_missing": "В Bridge не настроены Telegram API ID и hash.",
        "bridge_already_paired": "Этот Bridge уже привязан. Обновите страницу Lead Radar.",
        "pairing_retry_conflict": "Нельзя безопасно заменить текущую привязку.",
    }.get(code, "Не удалось завершить привязку. Проверьте интернет и повторите попытку.")


def _normalize_clipboard_pairing_code(raw: object) -> str | None:
    """Accept only a complete one-use pairing code from the local clipboard."""
    if not isinstance(raw, str):
        return None
    code = raw.strip()
    return code if PAIRING_CODE.fullmatch(code) else None


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


def pair_device(root: Path, raw_uri: str, *, replace_existing: bool = False) -> None:
    secure_directory(root)
    pairing_id, code, origin = _pairing_uri(raw_uri)
    vault = DpapiVault(root / VAULT_FILE)
    state = vault.load() or {}
    telegram = _configured_telegram(state)
    device = state.get("device")
    same_pending_pairing = False
    replacing_confirmed_device = False
    if isinstance(device, dict):
        if device.get("device_id"):
            if not replace_existing:
                raise SecurityError("bridge_already_paired")
            previous_id = device.get("device_id")
            previous_origin = device.get("origin")
            if (
                not isinstance(previous_id, str)
                or not __import__("re").fullmatch(r"lrtgbd_[a-f0-9]{32}", previous_id)
                or previous_origin not in PRODUCTION_ORIGINS
            ):
                raise SecurityError("pairing_retry_conflict")
            # The owner explicitly approved a fresh web pairing and entered
            # its one-use code locally. Rotate only the cloud device identity;
            # keep Telegram credentials/session inside the same DPAPI vault.
            device = None
            replacing_confirmed_device = True
        same_pending_pairing = (
            isinstance(device, dict)
            and device.get("pairing_id") == pairing_id
            and device.get("origin") == origin
        )
        if not same_pending_pairing:
            # A signed registration response may be lost after the server
            # commits. Once the owner revokes that offline/no-account device,
            # a new one-time URI must be recoverable locally. Reset only an
            # unconfirmed device and only when no Telegram custody exists.
            if (not replacing_confirmed_device
                and (telegram.get("session") or telegram.get("auth_id")
                     or telegram.get("account_ref")
                     or telegram.get("custody") not in {None, "revoked"})):
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


def _pair_with_background_restart(
    root: Path,
    raw_uri: str,
    *,
    replace_existing: bool,
) -> bool:
    """Serialize vault mutation against the scheduled background runtime."""
    stop(root)
    registration_pending = False
    try:
        deadline = time.monotonic() + 10.0
        while True:
            try:
                with WindowsSingleInstance():
                    try:
                        pair_device(root, raw_uri, replace_existing=replace_existing)
                    except OSError:
                        # Exact key/code material is already durable in DPAPI;
                        # the restarted runtime can retry registration safely.
                        registration_pending = True
                break
            except SecurityError as error:
                if str(error) != "bridge_already_running" or time.monotonic() >= deadline:
                    raise
                time.sleep(0.1)
    finally:
        # Pairing failure must not strand the outbound worker offline.
        start(root)
    return registration_pending


def _run_pairing_window(root: Path, raw_activation_uri: str) -> None:
    """Show a persistent local window; never disappear on an operation error."""
    if os.name != "nt":
        raise SecurityError("windows_runtime_required")
    pairing_id, origin = _activation_uri(raw_activation_uri)
    try:
        import tkinter as tk
        from tkinter import ttk
    except (ImportError, OSError) as exc:
        raise SecurityError("pairing_code_prompt_failed") from exc

    window = tk.Tk()
    window.title("Lead Radar — привязка Telegram Bridge")
    window.geometry("560x360")
    window.minsize(520, 330)
    window.configure(bg="#07111d")
    window.attributes("-topmost", True)
    window.after(250, window.focus_force)

    frame = tk.Frame(window, bg="#07111d", padx=28, pady=24)
    frame.pack(fill="both", expand=True)
    tk.Label(
        frame,
        text="Привязать этот компьютер",
        bg="#07111d",
        fg="#f8fafc",
        font=("Segoe UI", 18, "bold"),
    ).pack(anchor="w")
    tk.Label(
        frame,
        text="Скопируйте одноразовый код на странице Lead Radar и вставьте его сюда.",
        bg="#07111d",
        fg="#a8b3c2",
        font=("Segoe UI", 10),
        wraplength=495,
        justify="left",
    ).pack(anchor="w", pady=(8, 18))
    code_value = tk.StringVar()
    code_entry = ttk.Entry(frame, textvariable=code_value, show="•", font=("Consolas", 13))
    code_entry.pack(fill="x", ipady=8)
    status_value = tk.StringVar(value="Проверяем локальный буфер Windows — код вставится автоматически.")
    status_label = tk.Label(
        frame,
        textvariable=status_value,
        bg="#07111d",
        fg="#a8b3c2",
        font=("Segoe UI", 10),
        wraplength=495,
        justify="left",
    )
    status_label.pack(anchor="w", pady=(14, 14))
    actions = tk.Frame(frame, bg="#07111d")
    actions.pack(fill="x", side="bottom")
    succeeded = False

    def finish() -> None:
        window.destroy()

    def submit() -> None:
        nonlocal succeeded
        if succeeded:
            finish()
            return
        code = code_value.get().strip()
        if not PAIRING_CODE.fullmatch(code):
            status_label.configure(fg="#fbbf24")
            status_value.set(_pairing_error_copy(SecurityError("pairing_code_invalid")))
            code_entry.focus_set()
            code_entry.selection_range(0, "end")
            return
        submit_button.configure(state="disabled", text="Привязываем…")
        code_entry.configure(state="disabled")
        status_label.configure(fg="#67e8f9")
        status_value.set("Останавливаем фоновый Bridge и безопасно обновляем привязку…")
        window.update_idletasks()
        raw = f"gptbot-lead-radar://pair#id={pairing_id}&code={code}&origin={origin}"
        try:
            pending = _pair_with_background_restart(root, raw, replace_existing=True)
        except (ProtocolError, SecurityError, ValueError, OSError) as error:
            status_label.configure(fg="#fbbf24")
            status_value.set(_pairing_error_copy(error))
            code_entry.configure(state="normal")
            submit_button.configure(state="normal", text="Повторить привязку")
            code_entry.focus_set()
            return
        code_value.set("")
        succeeded = True
        status_label.configure(fg="#6ee7b7")
        status_value.set(
            "Компьютер привязан. Bridge запущен и подключается к Lead Radar. "
            "Теперь нажмите «Закрыть» и обновите статус на сайте."
            if not pending
            else "Данные сохранены. Bridge запущен и завершает регистрацию; "
            "подождите несколько секунд и обновите статус на сайте."
        )
        submit_button.configure(state="normal", text="Закрыть")
        cancel_button.configure(state="disabled")

    submit_button = tk.Button(
        actions,
        text="Привязать",
        command=submit,
        bg="#2dd4bf",
        fg="#031013",
        activebackground="#5eead4",
        relief="flat",
        padx=18,
        pady=10,
        font=("Segoe UI", 10, "bold"),
    )
    submit_button.pack(side="left")
    cancel_button = tk.Button(
        actions,
        text="Отмена",
        command=finish,
        bg="#1e293b",
        fg="#e2e8f0",
        activebackground="#334155",
        activeforeground="#ffffff",
        relief="flat",
        padx=18,
        pady=10,
        font=("Segoe UI", 10),
    )
    cancel_button.pack(side="left", padx=(10, 0))
    code_entry.bind("<Return>", lambda _event: submit())

    clipboard_attempts = 0

    def prefill_from_clipboard() -> None:
        nonlocal clipboard_attempts
        if succeeded or code_value.get().strip():
            return
        clipboard_attempts += 1
        try:
            code = _normalize_clipboard_pairing_code(window.clipboard_get())
        except tk.TclError:
            code = None
        if code:
            code_value.set(code)
            code_entry.icursor("end")
            status_label.configure(fg="#6ee7b7")
            status_value.set("Код вставлен автоматически. Нажмите «Привязать».")
            window.after(50, code_entry.focus_set)
            return
        if clipboard_attempts < 30:
            window.after(100, prefill_from_clipboard)
        else:
            status_value.set("Автовставка не сработала. Нажмите «Скопировать код» на сайте и Ctrl+V здесь.")

    window.after(100, prefill_from_clipboard)
    code_entry.focus_set()
    window.mainloop()


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
                _run_pairing_window(root, args.uri)
                return 0
            else:
                raw = _read_pairing(args)
            registration_pending = _pair_with_background_restart(
                root,
                raw,
                replace_existing=False,
            )
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
            "registration_rate_limited": "pairing_rate_limited",
            "registration_server_unavailable": "pairing_service_unavailable",
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
