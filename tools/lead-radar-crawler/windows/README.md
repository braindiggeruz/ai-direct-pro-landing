# Windows collector installation — staged, reviewable, disabled by default

This directory contains preparation code, not evidence of installation. Never
dot-source `Install-Collector.ps1`; invoke it as a reviewed separate process.
No script is run during package import. Windows tests invoke only read-only
validation, syntax/compile checks and local account lookup, never installation.

## Fixed resources and safety boundary

- New root: `C:\ProgramData\GPTBot\LeadRadarCollector`.
- New local non-administrator: `GPTBotCollector` (builtin Users only).
  Account operations use the builtin local-only `Netapi32.dll` API, not the
  optional PowerShell LocalAccounts module. Builtin aliases are resolved by SID,
  including localized Windows; direct and indirect administrator membership is
  checked. Account disable requires both its exact SID and installation comment.
- Scheduled task: `\GPTBot\LeadRadarCollector`, Limited/Password logon,
  once per minute plus startup, IgnoreNew, hidden, five-minute execution limit.
  **Registered DISABLED. There is no enable/start command in the installer.**
- Existing target/account fails normal installation. Explicit guarded resume
  accepts only this installer's exact owned, interrupted, unprovisioned account
  and old bundle hash; an existing profile, DPAPI/config/state or task still fails.
  Other directories/accounts are never repurposed or deleted.
- Read/execute bundle ACL; only `private\` is writable by the collector.
  Administrator/System retain management access. No grant to broad Users.
- Adds a non-inheriting root deny ACE for the new SID only on
  `C:\Users\Borinio` and `F:\Claude`. Existing effective deny is checked through
  a read-control handle and left untouched. A required change deliberately uses
  the documented legacy SetFileSecurityW root-only semantics: it does not update
  existing children. A READ_CONTROL|WRITE_DAC handle without delete sharing pins
  the exact directory while its DACL is changed; existing ACEs/order and control,
  owner/group are verified. MAXIMUM_ALLOWED is unsuitable here because busy
  directories can reject its extra data/delete access with sharing violation32.
  Bootstrap and each run irrevocably remove SeChangeNotifyPrivilege from their
  process token, not account/machine policy, and verify its absence in the child.
  Read-capable handles must return ERROR_ACCESS_DENIED for both roots, the exact
  Bridge `vault.dpapi`, and the repository `AGENTS.md` below F:\Claude.
  No probe reads file bytes; missing paths or other errors fail closed.
- DPAPI **CurrentUser**: a hidden bootstrap executes under the new identity with
  its profile loaded. The token is passed through its private stdin pipe, not
  command arguments, inherited environment, transcript or plaintext temp file.
  Only ciphertext returns to the elevated installer. Final `secrets\token.dpapi`
  is readable, not writable, by the collector. Password/token are transient
  memory; Task Scheduler stores its own OS-protected logon credential.
- Wrapper rechecks SID/non-admin status and vault deny before each run, decrypts
  the token, then builds a fresh child-only environment. Parent secrets,
  PYTHONPATH, NODE_OPTIONS and proxy environment are not inherited. API is pinned
  to `https://gptbot.uz/api/lead-radar/crawler`.
- Child Python and Node share a Windows Job Object (kill-on-close, at most four
  processes, 512 MiB aggregate limit). Wrapper bounds each invocation to 240 s
  and drains bounded output; it saves only a status enum/exit code/time.

CurrentUser DPAPI requires the dedicated profile; resetting that account's
password or copying its ciphertext to a different identity can break decryption.
Do not reset credentials or substitute machine-wide DPAPI as a workaround.

## Root/installer contract

The root agent prepares the offline bundle **before** elevation. The installer
performs no download, pip install, registry Python discovery or global package
copy. Reuse a standalone CPython distribution with its matching standard library
and reviewed locked dependencies; do not copy a virtualenv whose `pyvenv.cfg`
points back into another user's profile. `pyvenv.cfg` is rejected.

Required layout:

```
bundle.manifest.json
python/python.exe           # matching DLLs, stdlib, pinned site-packages
node/node.exe
app/collector/...           # current Python collector package
app/extractor.mjs           # bundled local TypeScript parser
windows/Common.ps1
windows/Native.cs
windows/Bootstrap-Identity.ps1
windows/Run-Collector.ps1
windows/Disable-Collector.ps1
windows/Runtime-Selfcheck.py
```

Manifest schema (every copied file must be listed; hashes lowercase):

```json
{
  "schema": "gptbot.lead-radar.bundle.v1",
  "files": [
    {"path": "python/python.exe", "sha256": "<64 lowercase hex>", "sizeBytes": 123456}
  ]
}
```

The example is schematic, not a valid complete bundle. Relative paths may only
start with python/node/app/windows; absolute paths, traversal, alternate streams,
reserved devices, duplicates, reparse points, file/hash/size mismatches fail.
Every copied destination is hashed again. Limits: 20,000 files, 512 MiB/file,
2 GiB total. Review locked dependencies and runtime licences in staging.

Installer parameters (four bundle/token inputs required; other inputs optional):

- `-BundlePath`: absolute local folder containing the reviewed manifest.
- `-BundleManifestSha256`: SHA-256 of its exact bytes.
- `-TokenStagingPath`: private existing file containing only the dedicated
  `lrcr_` plus 64 lowercase hex token, optionally one surrounding newline.
- `-TokenStagingSha256`: SHA-256 of that file's exact bytes. The installer checks
  both file metadata/hash and the actual bytes it reads. Its read ACL must grant
  only the invoking SID, Administrators and/or SYSTEM.
- `-ValidateOnly`: read-only validation; creates no account, secret, ACL or task.
- Resume requires all three: `-ResumeInstallationId`,
  `-ResumePreviousBundlePath`, `-ResumePreviousManifestSha256`. It verifies the
  exact owned SID/comment/manifest, old staged and installed file hashes, and
  absence of profile directory/registry, config, DPAPI, state and scheduled task.
  It backs up changed files before copying the reviewed new bundle; no file
  removal is allowed. Only this unprovisioned account's password is regenerated.
  This is not a credential-reset mechanism for an installed collector or Bridge.
- `-ReportPath`: optional **new** JSON file under an existing private caller
  staging directory (only caller/Admin/SYSTEM read grants), outside the installed
  root. The elevated installer writes a sanitized result here for non-elevated
  readback: installed/taskDisabled/installationId/runtimeProof/failureCode,
  failureStage/failureLine and cleanupVerified on failure. Stages are fixed labels
  and the line is numeric; no raw exception text or secret-bearing paths. It
  never includes token, password, ciphertext or raw subprocess output.

No token, password, owner JWT or Bridge credential belongs in arguments or the
bundle manifest. The original protected token staging file is **not deleted**;
root must dispose of it explicitly after successful ciphertext validation.

For the separately approved elevation, root uses `Start-Process` with
`-Verb RunAs -WindowStyle Hidden` and a safely quoted argument array for these
non-secret path/hash parameters. The user approves the ordinary Windows UAC
prompt. This package never self-elevates or bypasses UAC. Do not use the task's
existence as proof of live collection: leave it disabled until final preflight.

## Installed manifest and runtime ABI

`installation.json` records schema `gptbot.lead-radar.windows.v1`, immutable
installationId/root/userName/userSid/taskName/taskPath, bundle manifest hash,
accountCreated/taskRegistered flags, exact added deny rules, deny-handle proofs,
DPAPI scope, and state (`creating`, `installed_disabled`, `failed_disabled`). It
contains no plaintext token or account password. `config.json` is collector
read-only and contains the identity, fixed API origin and exact deny probes.
Before token provisioning or task registration, bootstrap runs the relocated
Python/SQLite/SSL/Scrapling import check and a synthetic canonical Node extractor
fixture. Its output contains only versions and success flags; no network or real
company lookup is performed. Failure disables the new account and leaves the
task unregistered/disabled. The final report retains this offline runtime proof.
The manifest and runtime proof also record `traverseBypassRemoved: true`.

Runtime child command (no token in arguments):

```
python/python.exe -B -m collector --once --state private/state.sqlite3
```

Working directory is `app`; the actual state argument is an absolute path.
Environment: `CRAWLER_NODE`, `CRAWLER_EXTRACTOR`, `CRAWLER_API_BASE`, and decrypted
`CRAWLER_TOKEN`, plus minimal explicit Windows/Python/TEMP variables. The wrapper
does not enable collector backend configuration, register server credentials,
enqueue jobs, or send Telegram messages.

## Rollback / stop

Run the installed `windows\Disable-Collector.ps1 -InstallationId <exact-id>`
under the separately approved administrator context. It validates the fixed
manifest, matching task description and account SID, disables/stops only that
task and disables only that account. It preserves state, files, account/profile,
task definition and additive deny ACEs. It does not recursively delete, restore
whole ACL snapshots, or touch the Telegram Bridge. Unexpected ownership fails.

Installation errors similarly disable resources already recorded in the owned
manifest and leave evidence/state in place for inspection. A partial existing
target intentionally blocks a blind reinstall. Review it; do not delete it to
make an installer retry succeed.

## Still required before activation

1. Review this code and bundle, run PowerShell syntax/native compile tests.
2. Validate the staging bundle/token and exact target before approving UAC.
3. Read back installed ACLs, non-admin membership, deny proofs and DPAPI result.
4. Verify standalone Python/Node imports and the local parser fixture under the
   actual task identity, without enabling external collection yet.
5. Explicitly activate the disabled task only after server readiness and one
   bounded live receipt test are approved. Check task startup/restart behavior.

Primary references: [Task Scheduler credentials](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask),
[IgnoreNew semantics](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-multipleinstances),
[DPAPI scope](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope),
[Windows CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew),
[Job Object limits](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information),
[Native local user creation](https://learn.microsoft.com/en-us/windows/win32/api/lmaccess/nf-lmaccess-netuseradd),
[Indirect group membership](https://learn.microsoft.com/en-us/windows/win32/api/lmaccess/nf-lmaccess-netusergetlocalgroups).
[Root-only file security semantics](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-setfilesecurityw).
