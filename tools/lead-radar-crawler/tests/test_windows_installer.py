"""Offline tests: ACL writes only in owned temporary fixtures; no accounts/tasks/UAC/network."""

import base64
import ast
import ctypes
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import sys


WINDOWS = Path(__file__).resolve().parents[1] / "windows"
POWERSHELL = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32/WindowsPowerShell/v1.0/powershell.exe"


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


@unittest.skipUnless(os.name == "nt" and POWERSHELL.is_file(), "Windows PowerShell required")
class WindowsInstallerTests(unittest.TestCase):
    def ps(self, code):
        encoded = base64.b64encode(("$ErrorActionPreference='Stop'; " + code).encode("utf-16le")).decode("ascii")
        return subprocess.run([str(POWERSHELL), "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                              text=True, capture_output=True, timeout=60, check=False)

    def test_all_scripts_parse_without_executing(self):
        result = self.ps("$files=Get-ChildItem -LiteralPath " + quote(WINDOWS) + " -Filter '*.ps1'; "
                         "foreach($file in $files){$tokens=$null;$errors=$null;"
                         "[void][Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors);"
                         "if($errors.Count){throw ($file.Name+':'+(($errors | ForEach-Object {$_.Message}) -join '|'))}}")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_helper_compiles_without_invoking_windows_operations(self):
        result = self.ps("Add-Type -Path " + quote(WINDOWS / "Native.cs") + "; if(-not ('GPTBotCollector.Native' -as [type])){throw 'missing_type'}")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_bundle_path_rejects_traversal_streams_devices_absolute_names(self):
        invalid = ["../secret", "app/../secret", "C:/file", "\\\\host\\share", "app/file:stream", "app/NUL.txt",
                   "node/COM1", "python/trailing. ", "other/file", "app/./file", "app/file?name"]
        code = ". " + quote(WINDOWS / "Common.ps1") + "; "
        code += "$invalid=@(" + ",".join(quote(value) for value in invalid) + ");"
        code += "foreach($path in $invalid){$blocked=$false;try{$null=Assert-CollectorRelativePath $path}catch{$blocked=$true};if(-not $blocked){throw 'unsafe_path_accepted'}};"
        code += "if((Assert-CollectorRelativePath 'app/collector/__main__.py') -ne 'app\\collector\\__main__.py'){throw 'normalization_failed'}"
        result = self.ps(code)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_fixed_resources_and_current_user_dpapi_not_machine_scope(self):
        common = (WINDOWS / "Common.ps1").read_text()
        bootstrap = (WINDOWS / "Bootstrap-Identity.ps1").read_text()
        wrapper = (WINDOWS / "Run-Collector.ps1").read_text()
        self.assertIn("C:\\ProgramData\\GPTBot\\LeadRadarCollector", common)
        self.assertIn("User='GPTBotCollector'", common)
        self.assertIn("DataProtectionScope]::CurrentUser", bootstrap)
        self.assertIn("DataProtectionScope]::CurrentUser", wrapper)
        self.assertNotIn("DataProtectionScope]::LocalMachine", bootstrap + wrapper)
        self.assertIn("[Console]::In.ReadLine()", bootstrap)
        self.assertIn("$start.EnvironmentVariables.Clear()", wrapper)
        self.assertIn("$config.apiBase -cne 'https://gptbot.uz/api/lead-radar/crawler'", wrapper)
        self.assertNotIn("CRAWLER_TOKEN", wrapper.split("$start.Arguments=", 1)[1].splitlines()[0])

    def test_installer_task_disabled_and_rollback_non_destructive(self):
        installer = (WINDOWS / "Install-Collector.ps1").read_text()
        rollback = (WINDOWS / "Disable-Collector.ps1").read_text()
        self.assertIn("New-ScheduledTaskSettingsSet -Disable", installer)
        self.assertIn("-MultipleInstances IgnoreNew", installer)
        self.assertIn("-RunLevel Limited", installer)
        self.assertIn("-AtStartup", installer)
        self.assertIn("-RepetitionInterval (New-TimeSpan -Minutes 1)", installer)
        for forbidden in ("Enable-ScheduledTask", "Start-ScheduledTask", "Invoke-WebRequest", "Invoke-RestMethod",
                          "Remove-LocalUser", "Unregister-ScheduledTask", "Remove-Item"):
            self.assertNotIn(forbidden, installer + rollback)
        self.assertIn("[GPTBotCollector.LocalAccount]::DisableOwned", rollback)
        self.assertIn("account_ownership_mismatch", rollback)
        self.assertIn("task_ownership_mismatch", rollback)

    def test_native_account_lookup_works_without_optional_localaccounts_module(self):
        result = self.ps(". " + quote(WINDOWS / "Common.ps1") + "; Import-CollectorNative; "
                         "$account=[GPTBotCollector.LocalAccount]::Get(); "
                         "if($null -ne $account -and ($account.Name -cne 'GPTBotCollector' -or -not $account.SID.Value)){throw 'invalid_account_snapshot'}")
        self.assertEqual(result.returncode, 0, result.stderr)
        installer = (WINDOWS / "Install-Collector.ps1").read_text()
        rollback = (WINDOWS / "Disable-Collector.ps1").read_text()
        native = (WINDOWS / "Native.cs").read_text()
        for unavailable in ("Microsoft.PowerShell.LocalAccounts", "Get-LocalUser", "New-LocalUser", "Disable-LocalUser",
                            "Get-LocalGroup", "Add-LocalGroupMember"):
            self.assertNotIn(unavailable, installer + rollback)
        self.assertIn("NetUserGetInfo(null,Name,23", native)
        self.assertIn("NetUserAdd(null,1", native)
        self.assertIn("NetUserGetLocalGroups(null,Name,0,1", native)
        self.assertIn('sid != "S-1-5-32-544" && sid != "S-1-5-32-545"', native)
        self.assertIn("account.SID.Value != sid || account.Comment != Comment(installationId)", native)
        self.assertIn("Marshal.ZeroFreeGlobalAllocUnicode(secret)", native)
        self.assertNotIn("NetUserDel", native)

    def test_validateonly_reports_safe_failure_stage_without_touching_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            missing_bundle = Path(directory) / "missing-bundle"
            missing_token = Path(directory) / "must-not-be-opened.secret"
            result = self.ps("& " + quote(WINDOWS / "Install-Collector.ps1") + " -ValidateOnly -BundlePath "
                             + quote(missing_bundle) + " -BundleManifestSha256 " + quote("0" * 64)
                             + " -TokenStagingPath " + quote(missing_token) + " -TokenStagingSha256 " + quote("1" * 64))
            self.assertNotEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertFalse(report["installed"])
            # If the collector is already installed, fail even earlier without modifying it.
            self.assertIn(report["failureStage"], ("validate_bundle", "validate_targets"))
            self.assertGreater(report["failureLine"], 0)
            self.assertNotIn(str(missing_token), result.stdout + result.stderr)
            self.assertNotIn("Exception.Message", result.stdout + result.stderr)
            self.assertFalse(missing_token.exists())

    def test_deny_probe_opens_handle_but_never_reads_contents(self):
        native = (WINDOWS / "Native.cs").read_text()
        body = native.split("public static bool ReadAccessDenied", 1)[1].split("static string Drain", 1)[0]
        self.assertIn("CreateFile(path, 0x80000000", body)
        self.assertIn("Marshal.GetLastWin32Error() != 5", body)
        self.assertNotIn("ReadAll", body)
        self.assertNotIn("FileStream", body)
        self.assertNotIn(".Read(", body)

    def test_offline_selfcheck_precedes_secret_and_task_and_report_is_sanitized(self):
        bootstrap = (WINDOWS / "Bootstrap-Identity.ps1").read_text()
        installer = (WINDOWS / "Install-Collector.ps1").read_text()
        selfcheck = (WINDOWS / "Runtime-Selfcheck.py").read_text()
        ast.parse(selfcheck)
        self.assertLess(bootstrap.index("Runtime-Selfcheck.py"), bootstrap.index("[Console]::In.ReadLine()"))
        self.assertLess(installer.index("isolated_bootstrap_failed"), installer.index("Register-ScheduledTask"))
        self.assertIn('"networkUsed": False', selfcheck)
        self.assertNotIn("CRAWLER_TOKEN", selfcheck)
        self.assertIn("$bootstrap.EnvironmentVariables.Clear()", installer)
        self.assertIn("$bootstrap.WorkingDirectory=Join-Path $spec.Root 'app'", installer)
        self.assertIn("report_parent_acl_not_private", installer)
        report = installer.split("$report=@{installed=$true", 1)[1].split("if ($reportReady)", 1)[0]
        self.assertNotIn("ciphertext", report)
        self.assertNotIn("$token", report)
        self.assertNotIn("$password", report)
        self.assertIn("$allowedStages=@(", installer)
        self.assertIn("bootstrapFailureStage=$bootstrapFailureStage", installer)
        self.assertIn("failureWin32Code=$failureWin32Code", installer)
        self.assertIn("taskDisabled=$taskDisabledVerified", installer)
        self.assertIn("'failed_unknown'", installer)
        self.assertIn("GetInstances(0).Count", installer)
        failure_report = bootstrap.split("} catch {", 1)[1]
        self.assertIn("$allowed -cnotcontains $reason", failure_report)
        self.assertNotIn("ciphertext", failure_report)
        self.assertNotIn("$token", failure_report)
        self.assertIn("$ownedMutationStarted -and $null -ne $manifest", installer)

    def test_runtime_names_match_client_and_process_tree_is_bounded(self):
        wrapper = (WINDOWS / "Run-Collector.ps1").read_text()
        native = (WINDOWS / "Native.cs").read_text()
        self.assertIn("delivery_waiting|worker_busy|no_job", wrapper)
        self.assertIn("::Run($start,$null,240,$true)", wrapper)
        self.assertIn("0x2000 | 0x8 | 0x200", native)
        self.assertIn("limits.Basic.ActiveProcesses=4", native)
        self.assertIn("new UIntPtr(536870912)", native)
        self.assertIn("finally { if (job!=IntPtr.Zero) CloseHandle(job); }", native)

    def test_traverse_removal_is_process_only_and_inherited_by_real_python_child(self):
        # Execute the actual Python selfcheck token reader without its installed-path main body.
        tree = ast.parse((WINDOWS / "Runtime-Selfcheck.py").read_text())
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "traverse_bypass_present")
        reader_source = "import ctypes\nfrom ctypes import wintypes\n" + ast.unparse(function)
        namespace = {}
        exec(compile(reader_source, "runtime-token-reader", "exec"), namespace)
        before = namespace["traverse_bypass_present"]()
        child_source = reader_source + "\nassert not traverse_bypass_present()\nprint('child_token_removed')\n"
        encoded_child = base64.b64encode(child_source.encode()).decode()
        python_command = "import base64;exec(base64.b64decode('" + encoded_child + "'))"
        code = ". " + quote(WINDOWS / "Common.ps1") + ";Import-CollectorNative;"
        code += "[GPTBotCollector.Native]::RemoveTraverseBypass();"
        code += "if([GPTBotCollector.Native]::TraverseBypassPresent()){throw 'parent_not_removed'};"
        code += "$start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=" + quote(sys.executable) + ";"
        code += "$start.Arguments=" + quote('-B -c "' + python_command + '"') + ";"
        code += "$result=[GPTBotCollector.Native]::Run($start,$null,20,$true);"
        code += "if($result.ExitCode -ne 0 -or $result.Output.Trim() -cne 'child_token_removed' -or -not $result.TraverseBypassRemoved){throw 'child_proof_failed'};"
        code += "[GPTBotCollector.Native]::RemoveTraverseBypass();if([GPTBotCollector.Native]::TraverseBypassPresent()){throw 'removed_privilege_reappeared'}"
        result = self.ps(code)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(namespace["traverse_bypass_present"](), before, "test parent token must remain unchanged")

    def test_root_deny_is_nonrecursive_and_process_drop_precedes_probes(self):
        native = (WINDOWS / "Native.cs").read_text()
        installer = (WINDOWS / "Install-Collector.ps1").read_text()
        self.assertIn("CreateFile(path,0x20000,7", native)  # Existing deny requires only READ_CONTROL.
        self.assertIn("CreateFile(path,0x60000,3", native)  # No DELETE access/sharing; pin the directory name.
        self.assertIn("SetFileSecurityW(path,4,", native)  # Deliberate documented no-child-propagation API.
        self.assertNotIn("CreateFile(path,0x02000000", native)
        self.assertNotIn("SetKernelObjectSecurity", native)
        self.assertNotIn("NtSetSecurityObject", native)
        self.assertIn("new CommonAce(AceFlags.None,AceQualifier.AccessDenied", native)
        self.assertIn("root_acl_other_rules_changed", native)
        self.assertIn("root_acl_control_or_identity_changed", native)
        self.assertIn("existing_deny_preserved", installer)
        self.assertNotIn("Set-Acl -LiteralPath $path", installer)
        self.assertNotIn("SetNamedSecurityInfo", native)
        self.assertNotIn("LsaAddAccountRights", native)
        self.assertIn("Attributes=4", native)  # SE_PRIVILEGE_REMOVED, not zero/disabled.
        for name in ("Bootstrap-Identity.ps1", "Run-Collector.ps1"):
            source = (WINDOWS / name).read_text()
            self.assertLess(source.index("::RemoveTraverseBypass()"), source.index("::ReadAccessDenied"))
            self.assertLess(source.index("::RemoveTraverseBypass()"), source.index("[Security.Cryptography.ProtectedData]"))
        self.assertIn("F:\\Claude\\gptbot-lead-radar-integration-20260827\\AGENTS.md", installer)

    def test_busy_owned_directory_updates_root_only_and_preserves_children(self):
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        create_file = kernel.CreateFileW
        create_file.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                                wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
        create_file.restype = wintypes.HANDLE
        close = kernel.CloseHandle
        close.argtypes = [wintypes.HANDLE]
        close.restype = wintypes.BOOL
        invalid = ctypes.c_void_p(-1).value
        with tempfile.TemporaryDirectory(prefix="collector-acl-fixture-") as directory:
            root = Path(directory)
            nested = root / "child" / "nested"
            nested.mkdir(parents=True)
            child = nested / "owned-fixture.txt"
            child.write_text("owned offline fixture", encoding="utf-8")
            # Emulate Explorer/CWD holding a directory read handle without FILE_SHARE_DELETE.
            busy = create_file(str(root), 0x100001, 3, None, 3, 0x02000000, None)
            self.assertNotEqual(busy, invalid, "owned busy fixture handle must open")
            try:
                maximum = create_file(str(root), 0x02000000, 7, None, 3, 0x02200000, None)
                error = ctypes.get_last_error()
                if maximum != invalid:
                    close(maximum)
                self.assertEqual(maximum, invalid, "fixture must reproduce excessive-access sharing conflict")
                self.assertEqual(error, 32)
                code = ". " + quote(WINDOWS / "Common.ps1") + ";Import-CollectorNative;$root=" + quote(root) + ";"
                code += r"""
                $children=@((Join-Path $root 'child'),(Join-Path $root 'child\nested'),(Join-Path $root 'child\nested\owned-fixture.txt'));
                function Snapshot([string]$Path){
                  $acl=if([IO.Directory]::Exists($Path)){[IO.Directory]::GetAccessControl($Path)}else{[IO.File]::GetAccessControl($Path)};
                  [Convert]::ToBase64String($acl.GetSecurityDescriptorBinaryForm())};
                $before=@($children | ForEach-Object {Snapshot $_});
                $helper=[GPTBotCollector.Native].GetMethod('EnsureRootOnlyDeny',[Reflection.BindingFlags]'NonPublic,Static');
                $sid=New-Object Security.Principal.SecurityIdentifier('S-1-5-21-1-2-3-4294967001');
                $arguments=[object[]]@($root,$sid.PSObject.BaseObject);
                if(-not $helper.Invoke($null,$arguments)){throw 'missing_owned_fixture_update'};
                $rootAfter=Snapshot $root;
                if($helper.Invoke($null,$arguments)){throw 'idempotency_failed'};
                if((Snapshot $root) -cne $rootAfter){throw 'idempotency_changed_acl'};
                for($i=0;$i -lt $children.Count;$i++){if((Snapshot $children[$i]) -cne $before[$i]){throw 'child_acl_changed'}};
                $rules=@([IO.Directory]::GetAccessControl($root).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) |
                  Where-Object {$_.IdentityReference.Value -ceq $sid.Value});
                if($rules.Count -ne 1 -or $rules[0].InheritanceFlags -ne 'None' -or $rules[0].PropagationFlags -ne 'None' -or
                   $rules[0].AccessControlType -ne 'Deny' -or [int]$rules[0].FileSystemRights -ne 0x1f01ff){throw 'unexpected_root_rule'};
                """
                result = self.ps(code)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            finally:
                close(busy)

    def test_fixed_root_and_account_guards_reject_before_acl_work(self):
        code = ". " + quote(WINDOWS / "Common.ps1") + ";Import-CollectorNative;"
        code += r"""
        $blocked=$false;try{[GPTBotCollector.Native]::EnsureFixedRootDeny('C:\Windows','S-1-0-0','00000000-0000-0000-0000-000000000000')}
        catch{if($_.Exception.GetBaseException().Message -cne 'isolation_root_refused'){throw};$blocked=$true};
        if(-not $blocked){throw 'fixed_root_guard_missing'};
        foreach($root in @('C:\Users\Borinio','F:\Claude')){
          $blocked=$false;try{[GPTBotCollector.Native]::EnsureFixedRootDeny($root,'S-1-0-0','00000000-0000-0000-0000-000000000000')}
          catch{if($_.Exception.GetBaseException().Message -cne 'account_ownership_mismatch'){throw};$blocked=$true};
          if(-not $blocked){throw 'ownership_guard_missing'}
        }
        """
        result = self.ps(code)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def test_win32_diagnostic_accepts_only_numeric_codes_without_exception_text(self):
        code = self.recovery_helpers() + r"""
        $problem=New-Object InvalidOperationException('do_not_publish');$problem.Data['Win32Error']=32;
        if((Get-CollectorWin32Failure $problem) -ne 32){throw 'missing_win32_diagnostic'};
        $problem.Data['Win32Error']='do_not_publish';if($null -ne (Get-CollectorWin32Failure $problem)){throw 'diagnostic_leak'};
        $problem.Data['Win32Error']=-1;if($null -ne (Get-CollectorWin32Failure $problem)){throw 'invalid_native_code'};
        $problem=New-Object ComponentModel.Win32Exception(5,'do_not_publish');
        if((Get-CollectorWin32Failure $problem) -ne 5){throw 'missing_framework_native_code'};
        """
        result = self.ps(code)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def recovery_helpers(self):
        return (". " + quote(WINDOWS / "Common.ps1") + ";$tokens=$null;$errors=$null;"
                "$ast=[Management.Automation.Language.Parser]::ParseFile(" + quote(WINDOWS / "Install-Collector.ps1")
                + ",[ref]$tokens,[ref]$errors);if($errors.Count){throw 'parse_error'};"
                "$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)"
                " | ForEach-Object {Invoke-Expression $_.Extent.Text};"
                "function Expect-Rejected([scriptblock]$Op,[string]$Code){$blocked=$false;try{& $Op}catch{if($_.Exception.Message -ne $Code){throw};$blocked=$true};if(-not $blocked){throw 'guard_not_enforced'}};")

    def test_resume_refuses_wrong_manifest_identity_and_any_provisioned_state(self):
        code = self.recovery_helpers() + r"""
        $spec=Get-CollectorSpec;$id='28af57a7-ddf3-481a-ad96-3250fc7d3e9a';$hash='a'*64;
        $account=[pscustomobject]@{Name=$spec.User;SID=@{Value='S-1-5-21-1-2-3-1011'};Comment=('GPTBot collector '+$id)};
        $m=[pscustomobject]@{schema=$spec.Schema;root=$spec.Root;installationId=$id;bundleManifestSha256=$hash;
          userName=$spec.User;taskName=$spec.TaskName;taskPath=$spec.TaskPath;state='failed_disabled';accountCreated=$true;
          accountCreationStarted=$true;taskRegistered=$false;taskInitiallyDisabled=$true;isolationProofs=@();userSid=$account.SID.Value};
        Assert-CollectorResumeManifest $m $account $spec $id $hash;
        $m.state='installed_disabled';Expect-Rejected {Assert-CollectorResumeManifest $m $account $spec $id $hash} 'resume_ownership_mismatch';
        $m.state='failed_disabled';$account.Comment='unrelated';Expect-Rejected {Assert-CollectorResumeManifest $m $account $spec $id $hash} 'resume_ownership_mismatch';
        $account.Comment='GPTBot collector '+$id;$m | Add-Member runtimeProof @{ok=$true};
        Expect-Rejected {Assert-CollectorResumeManifest $m $account $spec $id $hash} 'resume_already_provisioned';
        $script:foundPath=$null;$script:taskFound=$false;
        function Test-Path {param($LiteralPath,$ErrorAction) $LiteralPath -ceq $script:foundPath};
        function Get-ScheduledTask {param($TaskName,$TaskPath,$ErrorAction) if($script:taskFound){[pscustomobject]@{TaskName=$TaskName}}};
        Assert-CollectorUnprovisioned $spec $account.SID.Value;
        foreach($relative in @('config.json','secrets\token.dpapi','private\state.sqlite3')){
          $script:foundPath=Join-Path $spec.Root $relative;Expect-Rejected {Assert-CollectorUnprovisioned $spec $account.SID.Value} 'resume_provisioned_state_present'};
        $script:foundPath='C:\Users\GPTBotCollector';Expect-Rejected {Assert-CollectorUnprovisioned $spec $account.SID.Value} 'resume_provisioned_state_present';
        $script:foundPath='Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\'+$account.SID.Value;
        Expect-Rejected {Assert-CollectorUnprovisioned $spec $account.SID.Value} 'resume_provisioned_state_present';
        $script:foundPath=$null;$script:taskFound=$true;Expect-Rejected {Assert-CollectorUnprovisioned $spec $account.SID.Value} 'resume_task_present';
        """
        result = self.ps(code)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def test_resume_validates_old_installed_bytes_and_never_changes_owned_fixture(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            installed = root / "windows" / "Native.cs"
            installed.parent.mkdir()
            content = b"owned old native fixture"
            installed.write_bytes(content)
            old = {"path": "windows/Native.cs", "sizeBytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
            new = {**old, "sha256": "b" * 64}
            fixture = {"old": {"Manifest": {"files": [old]}}, "next": {"Manifest": {"files": [new]}}}
            encoded = base64.b64encode(json.dumps(fixture).encode()).decode()
            code = self.recovery_helpers() + "$f=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(" + quote(encoded) + ")) | ConvertFrom-Json;$root=" + quote(root) + ";"
            code += r"""
            $changes=Get-CollectorResumeChanges $f.old $f.next $root;if(@($changes).Count -ne 1){throw 'missing_recovery_change'};
            $f.next.Manifest.files=@();Expect-Rejected {Get-CollectorResumeChanges $f.old $f.next $root} 'resume_file_removal_refused';
            $extra=[pscustomobject]@{path='app/unexpected.exe';sha256=('c'*64);sizeBytes=1};$f.next.Manifest.files=@($f.old.Manifest.files[0],$extra);
            Expect-Rejected {Get-CollectorResumeChanges $f.old $f.next $root} 'resume_new_file_refused';
            $f.next.Manifest.files=@($f.old.Manifest.files[0]);$f.old.Manifest.files[0].sha256='d'*64;
            Expect-Rejected {Get-CollectorResumeChanges $f.old $f.next $root} 'resume_installed_file_mismatch';
            """
            result = self.ps(code)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual(installed.read_bytes(), content)

    def test_real_manifest_validator_rejects_changed_file(self):
        required = ["python/python.exe", "node/node.exe", "app/collector/__main__.py", "app/extractor.mjs",
                    "windows/Run-Collector.ps1", "windows/Bootstrap-Identity.ps1", "windows/Common.ps1", "windows/Native.cs",
                    "windows/Runtime-Selfcheck.py"]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = []
            for relative in required:
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                data = ("owned non-executable fixture: " + relative).encode()
                path.write_bytes(data)
                files.append({"path": relative, "sizeBytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
            manifest = json.dumps({"schema": "gptbot.lead-radar.bundle.v1", "files": files}).encode()
            (root / "bundle.manifest.json").write_bytes(manifest)
            digest = hashlib.sha256(manifest).hexdigest()
            code = ". " + quote(WINDOWS / "Common.ps1") + "; $null=Assert-CollectorBundle " + quote(root) + " " + quote(digest)
            result = self.ps(code)
            self.assertEqual(result.returncode, 0, result.stderr)
            (root / required[0]).write_bytes(b"changed owned fixture")
            result = self.ps(code)
            self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
