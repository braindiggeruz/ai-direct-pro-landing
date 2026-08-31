"""Read-only activation helpers and owned temp fixtures; never activate a task."""

import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


WINDOWS = Path(__file__).resolve().parents[1] / "windows"
SCRIPT = WINDOWS / "Activate-Collector.ps1"
POWERSHELL = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32/WindowsPowerShell/v1.0/powershell.exe"


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


@unittest.skipUnless(os.name == "nt" and POWERSHELL.is_file(), "Windows PowerShell required")
class WindowsActivationTests(unittest.TestCase):
    def ps(self, code):
        source = "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';" + code
        encoded = base64.b64encode(source.encode("utf-16le")).decode("ascii")
        return subprocess.run([str(POWERSHELL), "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                              text=True, capture_output=True, timeout=60, check=False)

    def helpers(self):
        # Import function declarations only, never the operational main body.
        return (". " + quote(WINDOWS / "Common.ps1") + "; $tokens=$null;$errors=$null;"
                "$ast=[Management.Automation.Language.Parser]::ParseFile(" + quote(SCRIPT)
                + ",[ref]$tokens,[ref]$errors);if($errors.Count){throw 'activation_parse_failed'};"
                "$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$false)"
                " | ForEach-Object { Invoke-Expression $_.Extent.Text };"
                "function Expect-Rejected([scriptblock]$Operation,[string]$Expected){"
                "$rejected=$false;try{& $Operation}catch{if($_.Exception.Message -ne $Expected){throw};$rejected=$true};"
                "if(-not $rejected){throw ('expected_rejection_'+$Expected)}};")

    def assert_ps_ok(self, code):
        result = self.ps(code)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def test_script_parses_and_has_no_unbounded_wait_or_secret_access(self):
        self.assert_ps_ok(self.helpers())
        text = SCRIPT.read_text()
        self.assertIn("[ValidateRange(10,300)]", text)
        self.assertIn("[Diagnostics.Stopwatch]::StartNew()", text)
        self.assertIn("Start-Sleep -Milliseconds 1000", text)
        for forbidden in ("token.dpapi", "CRAWLER_TOKEN", "ProtectedData", "Register-ScheduledTask",
                          "New-LocalUser", "Disable-LocalUser", "Remove-Item", "NetUserDel", "Invoke-WebRequest", "Invoke-RestMethod"):
            self.assertNotIn(forbidden, text)
        self.assertIn("serverAckVerified=$false", text)
        self.assertLess(text.index("$stage='pre_enable_fence'"), text.index("Enable-ScheduledTask"))
        self.assertLess(text.index("$stage='require_elevation'"), text.index("$stage='validate_manifest'"))
        self.assertIn("if ($taskOwned)", text)
        self.assertIn("activation_failed_unknown", text)
        self.assertIn("task_disabled_during_activation", text)
        self.assertIn("::InspectBatchLogonRightOwned($manifest.userSid,$InstallationId)", text)
        self.assertIn("batch_logon_right_missing", text)
        self.assertNotIn("EnsureBatchLogonRightOwned", text)
        self.assertLess(text.index("::InspectBatchLogonRightOwned"), text.index("Enable-ScheduledTask"))

    def test_manifest_rejects_different_identity_hash_state_and_missing_proofs(self):
        code = self.helpers() + r"""
        $spec=Get-CollectorSpec;$id='28af57a7-ddf3-481a-ad96-3250fc7d3e9a';$hash='a'*64;
        $m=[pscustomobject]@{schema=$spec.Schema;root=$spec.Root;installationId=$id;bundleManifestSha256=$hash;
          userName=$spec.User;taskName=$spec.TaskName;taskPath=$spec.TaskPath;accountCreated=$true;taskRegistered=$true;
          state='installed_disabled';dpapiScope='CurrentUser';traverseBypassRemoved=$true;
          runtimeProof=@{ok=$true;networkUsed=$false;traverseBypassRemoved=$true};
          isolationProofs=@(@{path='C:\Users\Borinio';accessDenied=$true},@{path='F:\Claude';accessDenied=$true},
            @{path='C:\Users\Borinio\AppData\Local\GPTBot\LeadRadarTelegramBridge\vault.dpapi';accessDenied=$true},
            @{path='F:\Claude\gptbot-lead-radar-integration-20260827\AGENTS.md';accessDenied=$true})};
        Assert-ActivationManifest $m $id $hash $spec;
        Expect-Rejected {Assert-ActivationManifest $m $id ('b'*64) $spec} 'owned_manifest_mismatch';
        $m.state='active';Expect-Rejected {Assert-ActivationManifest $m $id $hash $spec} 'owned_manifest_mismatch';
        $m.state='activation_failed_disabled';Assert-ActivationManifest $m $id $hash $spec;
        $m.runtimeProof.networkUsed=$true;Expect-Rejected {Assert-ActivationManifest $m $id $hash $spec} 'installation_proof_missing';
        $m.runtimeProof.networkUsed=$false;$m.traverseBypassRemoved=$false;
        Expect-Rejected {Assert-ActivationManifest $m $id $hash $spec} 'installation_proof_missing';
        $m.traverseBypassRemoved=$true;$m.runtimeProof.traverseBypassRemoved=$false;
        Expect-Rejected {Assert-ActivationManifest $m $id $hash $spec} 'installation_proof_missing';
        $m.runtimeProof.traverseBypassRemoved=$true;$m.isolationProofs[2].path='F:\Claude';
        Expect-Rejected {Assert-ActivationManifest $m $id $hash $spec} 'installation_proof_missing';
        """
        self.assert_ps_ok(code)

    def test_actual_unregistered_task_objects_match_strict_safety_checks(self):
        code = self.helpers() + r"""
        Import-Module (Join-Path $script:CollectorSystemDirectory 'WindowsPowerShell\v1.0\Modules\ScheduledTasks\ScheduledTasks.psd1');
        $root='C:\ProgramData\GPTBot\LeadRadarCollector';$sid='S-1-5-21-100-200-300-1011';
        $m=@{root=$root;installationId='28af57a7-ddf3-481a-ad96-3250fc7d3e9a';taskName='LeadRadarCollector';taskPath='\GPTBot\';userSid=$sid};
        $exe=Join-Path $script:CollectorSystemDirectory 'WindowsPowerShell\v1.0\powershell.exe';
        $args='-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $root 'windows\Run-Collector.ps1')+'" -ConfigPath "'+(Join-Path $root 'config.json')+'"';
        $action=New-ScheduledTaskAction -Execute $exe -Argument $args -WorkingDirectory (Join-Path $root 'app');
        $settings=New-ScheduledTaskSettingsSet -Disable -Hidden -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries;
        $minute=New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1);
        $boot=New-ScheduledTaskTrigger -AtStartup;
        $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Password -RunLevel Limited;
        $task=[pscustomobject]@{TaskName=$m.taskName;TaskPath=$m.taskPath;Description=('GPTBotLeadRadarCollector:'+$m.installationId);
          Actions=@($action);Principal=$principal;Settings=$settings;Triggers=@($minute,$boot);State='Disabled'};
        Assert-ActivationTask $task $m $true;
        $task.State='Ready';Expect-Rejected {Assert-ActivationTask $task $m $true} 'task_must_be_disabled';
        $task.State='Disabled';$action.Arguments+=' -Unexpected';
        Expect-Rejected {Assert-ActivationTask $task $m $true} 'task_action_ownership_mismatch';$action.Arguments=$args;
        $task.Description='SomeoneElse';Expect-Rejected {Assert-ActivationTask $task $m $true} 'task_action_ownership_mismatch';
        $task.Description='GPTBotLeadRadarCollector:'+$m.installationId;
        $settings.ExecutionTimeLimit='PT1H';Expect-Rejected {Assert-ActivationTask $task $m $true} 'task_settings_mismatch';
        $settings.ExecutionTimeLimit='PT5M';$task.Triggers=@($minute);
        Expect-Rejected {Assert-ActivationTask $task $m $true} 'task_triggers_mismatch';
        """
        self.assert_ps_ok(code)

    def test_run_outcome_requires_fresh_success_and_distinguishes_idle_from_completed(self):
        code = self.helpers() + r"""
        $start=[DateTime]::UtcNow.AddSeconds(-5);
        $run=[pscustomobject]@{finishedAt=[DateTime]::UtcNow.ToString('o');status='no_job';exitCode=0;traverseBypassRemoved=$true};
        if((Get-ActivationRunOutcome $run $start) -cne 'idle'){throw 'idle_outcome_wrong'};
        $run.status='completed';if((Get-ActivationRunOutcome $run $start) -cne 'crawl_completed'){throw 'completed_outcome_wrong'};
        $run.traverseBypassRemoved=$false;Expect-Rejected {Get-ActivationRunOutcome $run $start} 'collector_isolation_not_verified';
        $run.traverseBypassRemoved=$true;
        $run.finishedAt=$start.AddMinutes(-1).ToString('o');Expect-Rejected {Get-ActivationRunOutcome $run $start} 'run_report_not_fresh';
        $run.finishedAt=[DateTime]::UtcNow.ToString('o');$run.exitCode=2;Expect-Rejected {Get-ActivationRunOutcome $run $start} 'collector_process_failed';
        $run.exitCode=0;$run.status='delivery_waiting';Expect-Rejected {Get-ActivationRunOutcome $run $start} 'collector_delivery_pending';
        $run.status='worker_busy';Expect-Rejected {Get-ActivationRunOutcome $run $start} 'collector_worker_busy';
        $run.status='forged_success';Expect-Rejected {Get-ActivationRunOutcome $run $start} 'collector_runtime_error';
        """
        self.assert_ps_ok(code)

    def test_update_plan_only_permits_existing_runtime_set_and_new_activation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old_path = root / "app" / "collector" / "client.py"
            old_path.parent.mkdir(parents=True)
            old_path.write_bytes(b"owned old client fixture")
            old = {"path": "app/collector/client.py", "sizeBytes": old_path.stat().st_size,
                   "sha256": hashlib.sha256(old_path.read_bytes()).hexdigest()}
            new = {"path": old["path"], "sizeBytes": 20, "sha256": "a" * 64}
            addition = {"path": "windows/Activate-Collector.ps1", "sizeBytes": 20, "sha256": "b" * 64}
            fixture = {"old": {"Manifest": {"files": [old]}}, "new": {"Manifest": {"files": [new, addition]}}}
            encoded = base64.b64encode(json.dumps(fixture).encode()).decode()
            code = self.helpers() + "$f=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(" + quote(encoded) + ")) | ConvertFrom-Json;"
            code += "$root=" + quote(root) + ";"
            code += r"""
            $plan=Get-ActivationUpdatePlan $f.old $f.new $root;
            if(@($plan).Count -ne 2 -or @($plan | Where-Object {$null -eq $_.oldSha256}).Count -ne 1){throw 'update_plan_wrong'};
            $f.new.Manifest.files=@();Expect-Rejected {Get-ActivationUpdatePlan $f.old $f.new $root} 'update_file_removal_refused';
            $extra=[pscustomobject]@{path='app/unexpected.exe';sha256=('c'*64);sizeBytes=1};
            $f.new.Manifest.files=@($f.old.Manifest.files[0],$extra);
            Expect-Rejected {Get-ActivationUpdatePlan $f.old $f.new $root} 'update_new_file_refused';
            $f.new.Manifest.files=@($f.old.Manifest.files[0]);$f.old.Manifest.files[0].sha256='d'*64;
            Expect-Rejected {Get-ActivationUpdatePlan $f.old $f.new $root} 'installed_old_file_mismatch';
            """
            self.assert_ps_ok(code)
            self.assertEqual(old_path.read_bytes(), b"owned old client fixture")
            self.assertFalse((root / "windows").exists())

    def test_json_read_is_bounded_and_does_not_modify_fixture(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            path.write_text('{"status":"no_job"}', encoding="utf8")
            code = self.helpers() + "$path=" + quote(path) + ";"
            code += "if((Read-ActivationJson $path 4096).status -cne 'no_job'){throw 'report_read_wrong'};"
            code += "Expect-Rejected {Read-ActivationJson $path 8} 'activation_json_too_large';"
            self.assert_ps_ok(code)
            self.assertEqual(path.read_text(), '{"status":"no_job"}')

    def test_report_parent_rejects_other_users_even_with_write_only_grant(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "new-safe-report.json"
            code = self.helpers() + "$path=" + quote(path) + ";"
            code += r"""
            $script:testRules=@([pscustomobject]@{AccessControlType='Allow';IdentityReference=@{Value='S-1-5-18'};FileSystemRights=2032127});
            $script:testAcl=New-Object PSObject;
            $script:testAcl | Add-Member -MemberType ScriptMethod -Name GetAccessRules -Value {param($a,$b,$c) return $script:testRules};
            function Get-Acl {param($LiteralPath) $script:testAcl};
            if((Assert-ActivationReportPath $path 'C:\ProgramData\GPTBot\LeadRadarCollector') -cne $path){throw 'safe_report_path_wrong'};
            $script:testRules+=@([pscustomobject]@{AccessControlType='Allow';IdentityReference=@{Value='S-1-1-0'};FileSystemRights=2});
            Expect-Rejected {Assert-ActivationReportPath $path 'C:\ProgramData\GPTBot\LeadRadarCollector'} 'report_parent_acl_not_private';
            """
            self.assert_ps_ok(code)
            self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
