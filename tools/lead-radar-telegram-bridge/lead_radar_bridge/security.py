from __future__ import annotations

import ctypes
import json
import os
import re
import secrets
import subprocess
import tempfile
from ctypes import wintypes
from pathlib import Path
from typing import Any, Callable

from .protocol import ProtocolError, b64url_decode, b64url_encode, canonical_json, strict_json


VAULT_SCHEMA = "gptbot.lead-radar.telegram-bridge-vault.v1"
DPAPI_ENTROPY = b"gptbot-lead-radar-telegram-bridge-v1\x00current-user"
CRYPTPROTECT_UI_FORBIDDEN = 0x1
SID_PATTERN = re.compile(r"^S-1-(?:\d+-){1,14}\d+$", re.IGNORECASE)
SYSTEM_SID = "S-1-5-18"
POWERSHELL_ARGUMENTS_ENV = "LEAD_RADAR_BRIDGE_POWERSHELL_ARGUMENTS"
POWERSHELL_MODULE_PATH_ENV = "LEAD_RADAR_BRIDGE_POWERSHELL_MODULE_PATH"


class SecurityError(RuntimeError):
    pass


def run_powershell(script: str, *arguments: str) -> subprocess.CompletedProcess[str]:
    """Run Windows PowerShell with data-only arguments and deterministic UTF-8.

    ``powershell.exe -Command <script> <argument>`` concatenates the trailing
    values back into the command text instead of exposing them as ``$args``.
    Apart from breaking paths with spaces, that behavior also creates a command
    injection boundary.  Transfer arguments through a private child-process
    environment value, deserialize them as JSON, and splat them into an inner
    script block instead.
    """
    if os.name != "nt":
        raise SecurityError("windows_runtime_required")
    environment = os.environ.copy()
    system_root = environment.get("SystemRoot", r"C:\Windows")
    # A Python process started from PowerShell 7 inherits PS7 module paths.
    # Passing those paths to Windows PowerShell 5.1 makes built-in modules such
    # as Microsoft.PowerShell.Security fail with duplicate TypeData entries.
    # The bridge needs only inbox Windows modules; pin that trusted location
    # and exclude user-writable module discovery from this privileged boundary.
    environment["PSModulePath"] = str(
        Path(system_root) / "System32" / "WindowsPowerShell" / "v1.0" / "Modules"
    )
    environment[POWERSHELL_MODULE_PATH_ENV] = environment["PSModulePath"]
    environment[POWERSHELL_ARGUMENTS_ENV] = json.dumps(
        list(arguments),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    wrapper = (
        f"$env:PSModulePath=$env:{POWERSHELL_MODULE_PATH_ENV};"
        "$ErrorActionPreference='Stop';"
        "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);"
        "$OutputEncoding=[System.Text.UTF8Encoding]::new($false);"
        f"$lrArgs=ConvertFrom-Json -InputObject $env:{POWERSHELL_ARGUMENTS_ENV};"
        f"& {{ {script} }} @lrArgs"
    )
    powershell = (
        Path(system_root)
        / "System32"
        / "WindowsPowerShell"
        / "v1.0"
        / "powershell.exe"
    )
    if not powershell.is_file():
        raise SecurityError("windows_powershell_missing")
    return subprocess.run(
        [str(powershell), "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", wrapper],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="strict",
        env=environment,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


def _blob(value: bytes) -> tuple[_DataBlob, Any]:
    buffer = (ctypes.c_ubyte * max(1, len(value)))()
    if value:
        ctypes.memmove(buffer, value, len(value))
    return _DataBlob(len(value), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte))), buffer


def _windows_dpapi(value: bytes, *, protect: bool) -> bytes:
    if os.name != "nt":
        raise SecurityError("dpapi_windows_required")
    crypt32 = ctypes.WinDLL("crypt32.dll", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32.dll", use_last_error=True)
    source, source_buffer = _blob(value)
    entropy, entropy_buffer = _blob(DPAPI_ENTROPY)
    output = _DataBlob()
    function = crypt32.CryptProtectData if protect else crypt32.CryptUnprotectData
    function.argtypes = (
        [ctypes.POINTER(_DataBlob), wintypes.LPCWSTR, ctypes.POINTER(_DataBlob),
         wintypes.LPVOID, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(_DataBlob)]
        if protect else
        [ctypes.POINTER(_DataBlob), ctypes.POINTER(wintypes.LPWSTR), ctypes.POINTER(_DataBlob),
         wintypes.LPVOID, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(_DataBlob)]
    )
    description = None if protect else wintypes.LPWSTR()
    args = (
        (ctypes.byref(source), "Lead Radar Telegram Bridge", ctypes.byref(entropy), None,
         None, CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(output))
        if protect else
        (ctypes.byref(source), ctypes.byref(description), ctypes.byref(entropy), None,
         None, CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(output))
    )
    try:
        # Keep both ctypes backing arrays strongly referenced through the
        # native call. _DataBlob stores raw pointers, not Python ownership.
        if not function(*args):
            raise SecurityError(f"dpapi_failed_{ctypes.get_last_error()}")
        return ctypes.string_at(output.pbData, output.cbData)
    finally:
        ctypes.memset(source_buffer, 0, ctypes.sizeof(source_buffer))
        ctypes.memset(entropy_buffer, 0, ctypes.sizeof(entropy_buffer))
        if output.pbData:
            kernel32.LocalFree(output.pbData)
        if not protect and description:
            kernel32.LocalFree(description)


def protect_current_user(value: bytes) -> bytes:
    return _windows_dpapi(value, protect=True)


def unprotect_current_user(value: bytes) -> bytes:
    return _windows_dpapi(value, protect=False)


def current_user_sid() -> str:
    if os.name != "nt":
        raise SecurityError("windows_acl_required")
    completed = subprocess.run(
        ["whoami.exe", "/user", "/fo", "csv", "/nh"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="strict",
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    matches = re.findall(r"S-1-(?:\d+-){1,14}\d+", completed.stdout, re.IGNORECASE)
    if len(matches) != 1 or not SID_PATTERN.fullmatch(matches[0]):
        raise SecurityError("current_user_sid_unavailable")
    return matches[0].upper()


def _acl_snapshot(path: Path) -> dict[str, Any]:
    script = (
        "$ErrorActionPreference='Stop';$a=Get-Acl -LiteralPath $args[0];"
        "$r=@($a.Access|ForEach-Object{[pscustomobject]@{"
        "sid=$_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;"
        "type=$_.AccessControlType.ToString();rights=[int64]$_.FileSystemRights;"
        "inherited=$_.IsInherited}});"
        "[pscustomobject]@{protected=$a.AreAccessRulesProtected;rules=$r}|ConvertTo-Json -Compress -Depth 4"
    )
    completed = run_powershell(script, str(path))
    parsed = json.loads(completed.stdout)
    if not isinstance(parsed, dict):
        raise SecurityError("acl_invalid")
    return parsed


def verify_private_acl(path: Path, *, user_sid: str | None = None) -> None:
    if os.name != "nt":
        raise SecurityError("windows_acl_required")
    expected_user = (user_sid or current_user_sid()).upper()
    snapshot = _acl_snapshot(path)
    if snapshot.get("protected") is not True:
        raise SecurityError("acl_inheritance_enabled")
    rules = snapshot.get("rules")
    if isinstance(rules, dict):
        rules = [rules]
    if not isinstance(rules, list):
        raise SecurityError("acl_invalid")
    allowed = {expected_user, SYSTEM_SID}
    seen_user = False
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("inherited") is not False:
            raise SecurityError("acl_invalid")
        sid = str(rule.get("sid", "")).upper()
        kind = rule.get("type")
        if kind == "Allow" and sid not in allowed:
            raise SecurityError("acl_principal_not_allowed")
        if kind == "Deny" and sid == expected_user:
            raise SecurityError("acl_user_denied")
        if kind == "Allow" and sid == expected_user:
            # FullControl includes this mask on Windows. Requiring every bit
            # prevents a read-only ACL from masquerading as a private vault.
            seen_user = (int(rule.get("rights", 0)) & 0x1F01FF) == 0x1F01FF
    if not seen_user:
        raise SecurityError("acl_user_full_control_missing")


def _apply_private_acl(path: Path, *, user_sid: str) -> None:
    # Work only with the DACL (Access). Set-Acl over a complete security
    # descriptor may attempt to write the SACL too and fail for a standard
    # user without SeSecurityPrivilege.
    script = (
        "$item=Get-Item -LiteralPath $args[0];"
        "$acl=$item.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access);"
        "$acl.SetAccessRuleProtection($true,$false);"
        "foreach($rule in @($acl.Access)){$acl.RemoveAccessRuleSpecific($rule)};"
        "$inherit=if($item.PSIsContainer){"
        "[System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'"
        "}else{[System.Security.AccessControl.InheritanceFlags]::None};"
        "$prop=[System.Security.AccessControl.PropagationFlags]::None;"
        "$allow=[System.Security.AccessControl.AccessControlType]::Allow;"
        "$rights=[System.Security.AccessControl.FileSystemRights]::FullControl;"
        "$user=[System.Security.Principal.SecurityIdentifier]::new($args[1]);"
        "$system=[System.Security.Principal.SecurityIdentifier]::new($args[2]);"
        "$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new("
        "$user,$rights,$inherit,$prop,$allow));"
        "$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new("
        "$system,$rights,$inherit,$prop,$allow));"
        "$item.SetAccessControl($acl)"
    )
    try:
        run_powershell(script, str(path), user_sid, SYSTEM_SID)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise SecurityError("acl_apply_failed") from exc


def secure_directory(path: Path) -> None:
    if os.name != "nt":
        raise SecurityError("windows_acl_required")
    path.mkdir(parents=True, exist_ok=True)
    sid = current_user_sid()
    _apply_private_acl(path, user_sid=sid)
    verify_private_acl(path, user_sid=sid)


def secure_file(path: Path) -> None:
    if os.name != "nt" or not path.is_file():
        raise SecurityError("windows_acl_required")
    sid = current_user_sid()
    _apply_private_acl(path, user_sid=sid)
    verify_private_acl(path, user_sid=sid)


def atomic_private_write(path: Path, value: bytes) -> None:
    secure_directory(path.parent)
    descriptor, temporary = tempfile.mkstemp(prefix=".bridge-", suffix=".tmp", dir=path.parent)
    temp_path = Path(temporary)
    try:
        with os.fdopen(descriptor, "wb", closefd=True) as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        # Protect the temporary file itself: otherwise a correctly protected
        # parent still yields inherited ACEs and cannot meet our explicit ACL
        # verification invariant before the atomic replacement.
        secure_file(temp_path)
        os.replace(temp_path, path)
        verify_private_acl(path)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


class DpapiVault:
    def __init__(
        self,
        path: Path,
        *,
        protector: Callable[[bytes], bytes] = protect_current_user,
        unprotector: Callable[[bytes], bytes] = unprotect_current_user,
        writer: Callable[[Path, bytes], None] = atomic_private_write,
    ) -> None:
        self.path = path
        self._protect = protector
        self._unprotect = unprotector
        self._write = writer

    def load(self) -> dict[str, Any] | None:
        if not self.path.exists():
            return None
        if os.name == "nt":
            verify_private_acl(self.path.parent)
            verify_private_acl(self.path)
        try:
            plaintext = self._unprotect(self.path.read_bytes())
            value = strict_json(plaintext)
        except (OSError, ProtocolError, SecurityError, ValueError) as exc:
            raise SecurityError("vault_unreadable") from exc
        if value.get("schema") != VAULT_SCHEMA:
            raise SecurityError("vault_schema_invalid")
        return value

    def save(self, value: dict[str, Any]) -> None:
        document = {"schema": VAULT_SCHEMA, **value}
        encoded = canonical_json(document)
        self._write(self.path, self._protect(encoded))

    def initialize_device_secret(self) -> bytes:
        return secrets.token_bytes(32)


def strict_secret(value: str) -> bytes:
    return b64url_decode(value, minimum=32, maximum=32)


def encoded_secret(value: bytes) -> str:
    if len(value) != 32:
        raise SecurityError("device_secret_invalid")
    return b64url_encode(value)
