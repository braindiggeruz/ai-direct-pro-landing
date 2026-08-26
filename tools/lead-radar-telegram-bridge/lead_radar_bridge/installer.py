from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from importlib import metadata, util
from pathlib import Path
from typing import Any

from .mailbox import PRODUCTION_ORIGINS
from .security import (
    DpapiVault,
    SecurityError,
    atomic_private_write,
    run_powershell,
    secure_directory,
    verify_private_acl,
)


TASK_NAME = "GPTBot Lead Radar Telegram Bridge"
URI_SCHEME = "gptbot-lead-radar"
INSTALL_MARKER = "installation.json"
DISTRIBUTION_NAME = "gptbot-lead-radar-telegram-bridge"


def default_root() -> Path:
    local = os.environ.get("LOCALAPPDATA")
    if os.name != "nt" or not local:
        raise SecurityError("windows_runtime_required")
    return Path(local) / "GPTBot" / "LeadRadarTelegramBridge"


def _pythonw() -> Path:
    candidate = Path(sys.executable).with_name("pythonw.exe")
    if not candidate.is_file():
        raise SecurityError("pythonw_missing")
    return candidate.resolve()


def _assert_installed_runtime() -> None:
    """Refuse a source-tree-only install that will break from another cwd."""
    try:
        distribution = metadata.distribution(DISTRIBUTION_NAME)
        spec = util.find_spec("lead_radar_bridge.cli")
    except (metadata.PackageNotFoundError, ImportError, ValueError) as exc:
        raise SecurityError("bridge_package_not_installed") from exc
    if spec is None or spec.origin is None:
        raise SecurityError("bridge_package_not_installed")
    package_file = Path(spec.origin).resolve()
    distribution_root = Path(distribution.locate_file("")).resolve()
    try:
        package_file.relative_to(distribution_root)
    except ValueError as exc:
        raise SecurityError("bridge_package_not_installed") from exc


def _powershell(script: str, *arguments: str) -> subprocess.CompletedProcess[str]:
    return run_powershell(script, *arguments)


def _task_snapshot() -> dict[str, Any] | None:
    script = (
        "$ErrorActionPreference='Stop';$t=Get-ScheduledTask -TaskName $args[0] -ErrorAction SilentlyContinue;"
        "if($null -eq $t){'null';exit 0};$actions=@($t.Actions);$triggers=@($t.Triggers);"
        "$a=$actions[0];$trigger=$triggers[0];"
        "[pscustomobject]@{execute=$a.Execute;arguments=$a.Arguments;user=$t.Principal.UserId;"
        "working_directory=$a.WorkingDirectory;"
        "logon=$t.Principal.LogonType.ToString();runlevel=$t.Principal.RunLevel.ToString();"
        "action_count=$actions.Count;trigger_count=$triggers.Count;"
        "trigger_type=$trigger.CimClass.CimClassName;trigger_user=$trigger.UserId;"
        "hidden=$t.Settings.Hidden;multiple_instances=$t.Settings.MultipleInstances.ToString()}|"
        "ConvertTo-Json -Compress"
    )
    parsed = json.loads(_powershell(script, TASK_NAME).stdout)
    return parsed if isinstance(parsed, dict) else None


def _expected_arguments(root: Path) -> str:
    return f'-m lead_radar_bridge.cli run --root "{root}"'


def _current_user_name() -> str:
    completed = _powershell(
        "[Security.Principal.WindowsIdentity]::GetCurrent().Name"
    )
    user = completed.stdout.strip()
    if not user or "\n" in user or "\r" in user:
        raise SecurityError("current_user_unavailable")
    return user


def _task_matches(
    task: dict[str, Any] | None,
    *,
    executable: Path,
    arguments: str,
    user: str,
    working_directory: Path,
) -> bool:
    if not task:
        return False
    raw_executable = str(task.get("execute", ""))
    if not raw_executable:
        return False
    try:
        executable_matches = Path(raw_executable).resolve() == executable.resolve()
    except (OSError, ValueError):
        return False
    task_user = str(task.get("user", "")).casefold()
    trigger_user = str(task.get("trigger_user", "")).casefold()
    expected_user = user.casefold()
    # Task Scheduler normalizes a local ``HOST\User`` principal to ``User``
    # in Principal.UserId, while retaining the fully-qualified Trigger.UserId.
    # Accept that one exact normalization only when the trigger still proves
    # the full current identity; never accept a short name by itself.
    short_user = expected_user.rsplit("\\", 1)[-1]
    principal_matches = task_user == expected_user or (
        trigger_user == expected_user and task_user == short_user
    )
    return (
        executable_matches
        and str(task.get("arguments", "")) == arguments
        and str(task.get("working_directory", "")).casefold() == str(working_directory).casefold()
        and principal_matches
        and str(task.get("logon", "")).casefold() in {"interactive", "interactivetoken"}
        and str(task.get("runlevel", "")).casefold() in {"limited", "leastprivilege"}
        and int(task.get("action_count", 0)) == 1
        and int(task.get("trigger_count", 0)) == 1
        and str(task.get("trigger_type", "")) == "MSFT_TaskLogonTrigger"
        and trigger_user == expected_user
        and task.get("hidden") is True
        and str(task.get("multiple_instances", "")).casefold() == "ignorenew"
    )


def install(root: Path | None = None) -> Path:
    target = (root or default_root()).resolve()
    _assert_installed_runtime()
    secure_directory(target)
    executable = _pythonw()
    arguments = _expected_arguments(target)
    user = _current_user_name()
    existing = _task_snapshot()
    if existing and not _task_matches(
        existing,
        executable=executable,
        arguments=arguments,
        user=user,
        working_directory=target,
    ):
        raise SecurityError("foreign_scheduled_task")
    script = (
        "$ErrorActionPreference='Stop';$user=$args[3];"
        "$a=New-ScheduledTaskAction -Execute $args[1] -Argument $args[2] -WorkingDirectory $args[4];"
        "$t=New-ScheduledTaskTrigger -AtLogOn -User $user;"
        "$p=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited;"
        "$s=New-ScheduledTaskSettingsSet -Hidden -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) "
        "-ExecutionTimeLimit (New-TimeSpan -Days 3650) -MultipleInstances IgnoreNew;"
        "Register-ScheduledTask -TaskName $args[0] -Action $a -Trigger $t -Principal $p -Settings $s -Force|Out-Null"
    )
    _powershell(script, TASK_NAME, str(executable), arguments, user, str(target))
    registered = _task_snapshot()
    if not _task_matches(
        registered,
        executable=executable,
        arguments=arguments,
        user=user,
        working_directory=target,
    ):
        raise SecurityError("scheduled_task_verification_failed")
    _install_uri_handler(executable, target)
    marker = {
        "schema": "gptbot.lead-radar.telegram-bridge-install.v1",
        "task": TASK_NAME,
        "pythonw": str(executable),
        "arguments": arguments,
        "root": str(target),
        "working_directory": str(target),
        "user": user,
    }
    atomic_private_write(
        target / INSTALL_MARKER,
        json.dumps(marker, separators=(",", ":"), sort_keys=True).encode("utf-8"),
    )
    return target


def _install_uri_handler(executable: Path, root: Path) -> None:
    import winreg

    command = f'"{executable}" -m lead_radar_bridge.cli pair-uri --root "{root}" "%1"'
    base = rf"Software\Classes\{URI_SCHEME}"
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, base + r"\shell\open\command") as key:
            existing, _kind = winreg.QueryValueEx(key, "")
            if existing != command:
                raise SecurityError("foreign_uri_handler")
    except FileNotFoundError:
        pass
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, "URL:GPTBot Lead Radar Bridge")
        winreg.SetValueEx(key, "URL Protocol", 0, winreg.REG_SZ, "")
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base + r"\DefaultIcon") as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(executable))
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base + r"\shell\open\command") as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, command)


def status(root: Path | None = None) -> dict[str, Any]:
    target = (root or default_root()).resolve()
    task = _task_snapshot()
    configured = False
    paired = False
    vault_healthy = True
    vault_path = target / "vault.dpapi"
    if vault_path.is_file():
        try:
            state = DpapiVault(vault_path).load() or {}
            telegram = state.get("telegram")
            device = state.get("device")
            configured = (
                isinstance(telegram, dict)
                and isinstance(telegram.get("api_id"), int)
                and 1_000 <= telegram["api_id"] <= 999_999_999_999
                and isinstance(telegram.get("api_hash"), str)
                and re.fullmatch(r"[a-f0-9]{32}", telegram["api_hash"]) is not None
            )
            paired = (
                configured
                and isinstance(device, dict)
                and isinstance(device.get("device_id"), str)
                and re.fullmatch(r"lrtgbd_[a-f0-9]{32}", device["device_id"]) is not None
                and isinstance(device.get("origin"), str)
                and device.get("origin") in PRODUCTION_ORIGINS
            )
        except (OSError, SecurityError, ValueError):
            vault_healthy = False
    installed = False
    marker_path = target / INSTALL_MARKER
    if marker_path.is_file() and task is not None:
        try:
            verify_private_acl(target)
            verify_private_acl(marker_path)
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
            installed = (
                isinstance(marker, dict)
                and marker.get("schema") == "gptbot.lead-radar.telegram-bridge-install.v1"
                and marker.get("task") == TASK_NAME
                and marker.get("root") == str(target)
                and _task_matches(
                    task,
                    executable=Path(str(marker.get("pythonw", ""))),
                    arguments=str(marker.get("arguments", "")),
                    user=str(marker.get("user", "")),
                    working_directory=target,
                )
            )
        except (OSError, SecurityError, ValueError, TypeError):
            installed = False
    return {
        "installed": installed,
        "configured": configured,
        "paired": paired,
        "vault_healthy": vault_healthy,
        "task_registered": task is not None,
        "root": str(target),
    }


def start(root: Path | None = None) -> None:
    """Start only the task created by this installation, in user context."""
    target = (root or default_root()).resolve()
    marker_path = target / INSTALL_MARKER
    if not marker_path.is_file():
        raise SecurityError("installation_marker_missing")
    verify_private_acl(target)
    verify_private_acl(marker_path)
    marker = json.loads(marker_path.read_text(encoding="utf-8"))
    task = _task_snapshot()
    if (
        marker.get("schema") != "gptbot.lead-radar.telegram-bridge-install.v1"
        or marker.get("task") != TASK_NAME
        or marker.get("root") != str(target)
        or not _task_matches(
            task,
            executable=Path(str(marker.get("pythonw", ""))),
            arguments=str(marker.get("arguments", "")),
            user=str(marker.get("user", "")),
            working_directory=target,
        )
    ):
        raise SecurityError("foreign_scheduled_task")
    _powershell(
        "$ErrorActionPreference='Stop';Start-ScheduledTask -TaskName $args[0]",
        TASK_NAME,
    )


def uninstall(root: Path | None = None) -> None:
    """Remove launch integrations but retain vault/ledger for safe recovery."""
    target = (root or default_root()).resolve()
    marker_path = target / INSTALL_MARKER
    if not marker_path.is_file():
        raise SecurityError("installation_marker_missing")
    verify_private_acl(target)
    verify_private_acl(marker_path)
    marker = json.loads(marker_path.read_text(encoding="utf-8"))
    existing = _task_snapshot()
    if (
        marker.get("schema") != "gptbot.lead-radar.telegram-bridge-install.v1"
        or marker.get("task") != TASK_NAME
        or marker.get("root") != str(target)
        or (
            existing is not None
            and not _task_matches(
                existing,
                executable=Path(str(marker.get("pythonw", ""))),
                arguments=str(marker.get("arguments", "")),
                user=str(marker.get("user", "")),
                working_directory=target,
            )
        )
    ):
        raise SecurityError("foreign_scheduled_task")
    _powershell(
        "$ErrorActionPreference='Stop';Unregister-ScheduledTask -TaskName $args[0] -Confirm:$false "
        "-ErrorAction SilentlyContinue",
        TASK_NAME,
    )
    import winreg
    try:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{URI_SCHEME}\shell\open\command")
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{URI_SCHEME}\shell\open")
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{URI_SCHEME}\shell")
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{URI_SCHEME}\DefaultIcon")
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{URI_SCHEME}")
    except FileNotFoundError:
        pass
    marker_path.unlink(missing_ok=True)
