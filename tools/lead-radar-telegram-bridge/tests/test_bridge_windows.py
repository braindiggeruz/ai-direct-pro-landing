from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lead_radar_bridge import cli, installer  # noqa: E402
from lead_radar_bridge.security import (  # noqa: E402
    DpapiVault,
    SecurityError,
    protect_current_user,
    run_powershell,
    secure_directory,
    unprotect_current_user,
    verify_private_acl,
)
from lead_radar_bridge.single_instance import WindowsSingleInstance  # noqa: E402


PAIRING_ID = "lrtgbp_" + "a" * 32
PAIRING_CODE = "A1B2C3D4E5F6G7H8J9K2M3"
ORIGIN = "https://gptbot-lead-radar-telegram-account.braindigger-uz.workers.dev"
API_ID = "33370488"
API_HASH = "a" * 32


class DummySingleInstance:
    def __enter__(self):
        return self

    def __exit__(self, *_args: object) -> None:
        return None


def scheduled_task(
    executable: Path,
    arguments: str,
    user: str,
    working_directory: Path = Path(r"C:\Bridge"),
    **changes: object,
) -> dict[str, object]:
    value: dict[str, object] = {
        "execute": str(executable),
        "arguments": arguments,
        "working_directory": str(working_directory),
        "user": user,
        "logon": "InteractiveToken",
        "runlevel": "Limited",
        "action_count": 1,
        "trigger_count": 1,
        "trigger_type": "MSFT_TaskLogonTrigger",
        "trigger_user": user,
        "hidden": True,
        "multiple_instances": "IgnoreNew",
    }
    value.update(changes)
    return value


class BridgeCliRegressionTests(unittest.TestCase):
    def test_activation_uri_forbids_secret_in_process_arguments(self) -> None:
        uri = f"gptbot-lead-radar://pair#id={PAIRING_ID}&origin={ORIGIN}"
        self.assertEqual(cli._activation_uri(uri), (PAIRING_ID, ORIGIN))
        with self.assertRaises(cli.ProtocolError):
            cli._activation_uri(
                f"gptbot-lead-radar://pair#id={PAIRING_ID}&code={PAIRING_CODE}&origin={ORIGIN}"
            )

    def test_pair_uri_prompts_locally_then_starts_verified_task(self) -> None:
        uri = f"gptbot-lead-radar://pair#id={PAIRING_ID}&origin={ORIGIN}"
        output = io.StringIO()
        with (
            mock.patch.object(cli, "WindowsSingleInstance", return_value=DummySingleInstance()),
            mock.patch.object(cli, "_prompt_pairing_code", return_value=PAIRING_CODE),
            mock.patch.object(cli, "pair_device") as pair_device,
            mock.patch.object(cli, "start") as start,
            contextlib.redirect_stdout(output),
        ):
            result = cli.main(["pair-uri", "--root", r"C:\Bridge Root", uri])
        self.assertEqual(result, 0)
        pair_device.assert_called_once_with(
            Path(r"C:\Bridge Root").resolve(),
            f"gptbot-lead-radar://pair#id={PAIRING_ID}&code={PAIRING_CODE}&origin={ORIGIN}",
        )
        start.assert_called_once_with(Path(r"C:\Bridge Root").resolve())
        self.assertNotIn(PAIRING_CODE, uri)
        self.assertNotIn(PAIRING_CODE, output.getvalue())

    def test_cli_never_echoes_unallowlisted_exception_or_secret(self) -> None:
        secret = "fixture-secret-that-must-not-cross-cli"
        error = io.StringIO()
        with (
            mock.patch.object(cli, "WindowsSingleInstance", return_value=DummySingleInstance()),
            mock.patch.object(
                cli,
                "configure_telegram_credentials",
                side_effect=SecurityError(secret),
            ),
            contextlib.redirect_stderr(error),
        ):
            result = cli.main(["configure", "--root", r"C:\Bridge Root"])
        self.assertEqual(result, 2)
        self.assertEqual(json.loads(error.getvalue())["code"], "operation_failed")
        self.assertNotIn(secret, error.getvalue())

    @unittest.skipUnless(os.name == "nt", "Windows CurrentUser DPAPI regression")
    def test_configure_imports_environment_once_into_private_dpapi_vault(self) -> None:
        with tempfile.TemporaryDirectory(prefix="lrtg configure ") as folder:
            root = Path(folder)
            environment = {
                cli.API_ID_ENV: API_ID,
                cli.API_HASH_ENV: API_HASH,
            }
            with mock.patch.dict(os.environ, environment, clear=False):
                cli.configure_telegram_credentials(root)
                self.assertNotIn(cli.API_ID_ENV, os.environ)
                self.assertNotIn(cli.API_HASH_ENV, os.environ)
            state = DpapiVault(root / cli.VAULT_FILE).load()
            self.assertIsNotNone(state)
            assert state is not None
            self.assertEqual(state["telegram"]["api_id"], int(API_ID))
            self.assertEqual(state["telegram"]["api_hash"], API_HASH)
            ciphertext = (root / cli.VAULT_FILE).read_bytes()
            self.assertNotIn(API_HASH.encode(), ciphertext)
            verify_private_acl(root)
            verify_private_acl(root / cli.VAULT_FILE)


class BridgeInstallerRegressionTests(unittest.TestCase):
    def test_task_fingerprint_rejects_privilege_or_action_drift(self) -> None:
        executable = Path(r"C:\Python312\pythonw.exe")
        arguments = r'-m lead_radar_bridge.cli run --root "C:\Bridge"'
        user = r"HOST\Owner"
        expected = scheduled_task(executable, arguments, user)
        self.assertTrue(
            installer._task_matches(
                expected,
                executable=executable,
                arguments=arguments,
                user=user,
                working_directory=Path(r"C:\Bridge"),
            )
        )
        self.assertTrue(
            installer._task_matches(
                {**expected, "user": "Owner"},
                executable=executable,
                arguments=arguments,
                user=user,
                working_directory=Path(r"C:\Bridge"),
            ),
            "Task Scheduler may shorten only the principal when the trigger keeps HOST\\User",
        )
        self.assertFalse(
            installer._task_matches(
                {**expected, "user": "Owner", "trigger_user": r"OTHER\Owner"},
                executable=executable,
                arguments=arguments,
                user=user,
                working_directory=Path(r"C:\Bridge"),
            )
        )
        mutations = (
            {"runlevel": "Highest"},
            {"user": r"HOST\Other"},
            {"action_count": 2},
            {"trigger_count": 2},
            {"trigger_type": "MSFT_TaskTimeTrigger"},
            {"trigger_user": r"HOST\Other"},
            {"hidden": False},
            {"multiple_instances": "Parallel"},
            {"working_directory": r"C:\Foreign"},
        )
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                self.assertFalse(
                    installer._task_matches(
                        {**expected, **mutation},
                        executable=executable,
                        arguments=arguments,
                        user=user,
                        working_directory=Path(r"C:\Bridge"),
                    )
                )

    def test_install_registers_and_verifies_exact_limited_user_task(self) -> None:
        root = Path(r"C:\Users\Owner\Bridge Root").resolve()
        executable = Path(r"C:\Python312\pythonw.exe")
        arguments = installer._expected_arguments(root)
        user = r"HOST\Owner"
        registered = scheduled_task(executable, arguments, user, root)
        written: list[tuple[Path, bytes]] = []
        with (
            mock.patch.object(installer, "secure_directory"),
            mock.patch.object(installer, "_assert_installed_runtime"),
            mock.patch.object(installer, "_pythonw", return_value=executable),
            mock.patch.object(installer, "_current_user_name", return_value=user),
            mock.patch.object(installer, "_task_snapshot", side_effect=[None, registered]),
            mock.patch.object(installer, "_powershell") as powershell,
            mock.patch.object(installer, "_install_uri_handler") as uri_handler,
            mock.patch.object(
                installer,
                "atomic_private_write",
                side_effect=lambda path, value: written.append((path, value)),
            ),
        ):
            self.assertEqual(installer.install(root), root)
        self.assertEqual(powershell.call_args.args[-5:], (
            installer.TASK_NAME,
            str(executable),
            arguments,
            user,
            str(root),
        ))
        self.assertIn("-RunLevel Limited", powershell.call_args.args[0])
        self.assertIn("-MultipleInstances IgnoreNew", powershell.call_args.args[0])
        uri_handler.assert_called_once_with(executable, root)
        marker = json.loads(written[0][1])
        self.assertEqual(marker["user"], user)
        self.assertEqual(marker["arguments"], arguments)

    def test_install_refuses_foreign_task_before_any_mutation(self) -> None:
        root = Path(r"C:\Users\Owner\Bridge").resolve()
        executable = Path(r"C:\Python312\pythonw.exe")
        arguments = installer._expected_arguments(root)
        foreign = scheduled_task(executable, arguments, r"HOST\Other", root)
        with (
            mock.patch.object(installer, "secure_directory"),
            mock.patch.object(installer, "_assert_installed_runtime"),
            mock.patch.object(installer, "_pythonw", return_value=executable),
            mock.patch.object(installer, "_current_user_name", return_value=r"HOST\Owner"),
            mock.patch.object(installer, "_task_snapshot", return_value=foreign),
            mock.patch.object(installer, "_powershell") as powershell,
            mock.patch.object(installer, "atomic_private_write") as write,
        ):
            with self.assertRaisesRegex(SecurityError, "foreign_scheduled_task"):
                installer.install(root)
        powershell.assert_not_called()
        write.assert_not_called()

    def test_start_uses_only_verified_marker_and_task(self) -> None:
        executable = Path(r"C:\Python312\pythonw.exe")
        user = r"HOST\Owner"
        with tempfile.TemporaryDirectory(prefix="lrtg start ") as folder:
            root = Path(folder).resolve()
            arguments = installer._expected_arguments(root)
            marker = {
                "schema": "gptbot.lead-radar.telegram-bridge-install.v1",
                "task": installer.TASK_NAME,
                "pythonw": str(executable),
                "arguments": arguments,
                "root": str(root),
                "user": user,
            }
            (root / installer.INSTALL_MARKER).write_text(json.dumps(marker), encoding="utf-8")
            with (
                mock.patch.object(installer, "verify_private_acl"),
                mock.patch.object(
                    installer,
                    "_task_snapshot",
                    return_value=scheduled_task(executable, arguments, user, root),
                ),
                mock.patch.object(installer, "_powershell") as powershell,
            ):
                installer.start(root)
            self.assertEqual(powershell.call_args.args[1:], (installer.TASK_NAME,))
            self.assertIn("Start-ScheduledTask", powershell.call_args.args[0])


@unittest.skipUnless(os.name == "nt", "Windows DPAPI/ACL/Scheduled Task regression")
class WindowsSecurityIntegrationTests(unittest.TestCase):
    def test_powershell_arguments_are_data_not_command_text(self) -> None:
        first = "путь с пробелами; throw 'injected' #"
        second = "$(Get-Process)"
        completed = run_powershell(
            "[pscustomobject]@{count=$args.Count;first=$args[0];second=$args[1]}|"
            "ConvertTo-Json -Compress",
            first,
            second,
        )
        value = json.loads(completed.stdout)
        self.assertEqual(value, {"count": 2, "first": first, "second": second})

    def test_windows_powershell_module_path_is_pinned_inside_the_wrapper(self) -> None:
        expected = str(
            Path(os.environ.get("SystemRoot", r"C:\Windows"))
            / "System32"
            / "WindowsPowerShell"
            / "v1.0"
            / "Modules"
        )
        completed = run_powershell(
            "[pscustomobject]@{module_path=$env:PSModulePath;acl=(Get-Acl -LiteralPath $args[0]).Path}|"
            "ConvertTo-Json -Compress",
            str(ROOT),
        )
        value = json.loads(completed.stdout)
        self.assertEqual(value["module_path"].casefold(), expected.casefold())
        self.assertTrue(value["acl"])

    def test_dpapi_acl_tamper_detection_and_acl_repair(self) -> None:
        with tempfile.TemporaryDirectory(prefix="lrtg security ") as folder:
            root = Path(folder)
            secure_directory(root)
            vault = DpapiVault(root / "vault.dpapi")
            vault.save({"secret": "fixture-current-user-secret"})
            self.assertEqual(vault.load()["secret"], "fixture-current-user-secret")
            self.assertNotIn(b"fixture-current-user-secret", vault.path.read_bytes())
            verify_private_acl(root)
            verify_private_acl(vault.path)

            add_foreign_reader = (
                "$item=Get-Item -LiteralPath $args[0];"
                "$acl=$item.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access);"
                "$sid=[System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-545');"
                "$rule=[System.Security.AccessControl.FileSystemAccessRule]::new("
                "$sid,[System.Security.AccessControl.FileSystemRights]::Read,"
                "[System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',"
                "[System.Security.AccessControl.PropagationFlags]::None,"
                "[System.Security.AccessControl.AccessControlType]::Allow);"
                "$acl.AddAccessRule($rule);$item.SetAccessControl($acl)"
            )
            run_powershell(add_foreign_reader, str(root))
            with self.assertRaisesRegex(SecurityError, "acl_principal_not_allowed"):
                verify_private_acl(root)
            secure_directory(root)
            verify_private_acl(root)

            tampered = bytearray(vault.path.read_bytes())
            tampered[-1] ^= 0x01
            vault.path.write_bytes(tampered)
            with self.assertRaisesRegex(SecurityError, "vault_unreadable"):
                vault.load()

    def test_current_user_dpapi_and_single_instance_are_operational(self) -> None:
        plaintext = b"lead-radar-dpapi-current-user-probe"
        ciphertext = protect_current_user(plaintext)
        self.assertNotEqual(ciphertext, plaintext)
        self.assertEqual(unprotect_current_user(ciphertext), plaintext)

        name = "Local\\GPTBot.LeadRadar.TelegramBridge.Test." + uuid.uuid4().hex
        first = WindowsSingleInstance(name)
        first.acquire()
        try:
            with self.assertRaisesRegex(SecurityError, "bridge_already_running"):
                WindowsSingleInstance(name).acquire()
        finally:
            first.close()
        with WindowsSingleInstance(name):
            pass


if __name__ == "__main__":
    unittest.main()
