# Codex Local Oracle Automation Fallback

Use this only after `docs/CODEX_OVERNIGHT_SETTLEMENT_AUDIT.md` is available in the local workspace.

## Purpose
If the Codex runtime has local Windows shell access but no built-in GUI/computer-use surface, do not immediately give up on oracle testing. First determine whether `g1hp80` can be automated safely through a programmatic UI layer.

## Step 1: resolve the shortcut safely
Locate the Desktop shortcut named exactly `g1hp80`. Inspect its target/arguments without modifying it.

Typical PowerShell discovery:

```powershell
$desktopCandidates = @(
  [Environment]::GetFolderPath('Desktop'),
  "$env:USERPROFILE\Desktop",
  "$env:USERPROFILE\OneDrive\Desktop"
) | Select-Object -Unique

$link = $desktopCandidates |
  ForEach-Object { Join-Path $_ 'g1hp80.lnk' } |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1

if (-not $link) { throw 'G1HP80_SHORTCUT_NOT_FOUND' }
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($link)
[pscustomobject]@{ Shortcut=$link; Target=$sc.TargetPath; Arguments=$sc.Arguments; WorkingDirectory=$sc.WorkingDirectory }
```

Do not change the shortcut.

## Step 2: classify the target
- If it opens a normal web URL or a Chromium/Electron surface with an inspectable page, prefer Playwright/browser automation using stable selectors.
- If it is a native Windows application, first try accessibility/UI Automation discovery (`pywinauto` UIA backend or an equivalent read-only inspector).
- If controls cannot be identified deterministically and only screen-coordinate/image clicking is possible, do not mutate data. Mark GUI oracle testing BLOCKED and output the minimal manual oracle test plan.

## Native Windows safety protocol
Before any mutation:
1. Launch the reference app only.
2. Enumerate windows/controls read-only.
3. Find `TEST_KTS` by visible text/control identity.
4. Prove that the message input, save/add action, report rows, config controls and delete action are uniquely addressable.
5. If any destructive control is ambiguous, stop.

When safe automation is possible:
- use only `TEST_KTS`;
- snapshot all `TEST_KTS` settings before changing them;
- add one exact synthetic test message at a time;
- record XAC / QUA CO / TRUNG / detail rows / THU-BU;
- delete that exact synthetic message immediately and verify absence;
- restore changed settings exactly and verify;
- never touch any other partner or pre-existing message.

## Browser/web safety protocol
If the shortcut opens a web app:
- prefer DOM selectors by visible label/text/data attributes;
- do not use broad selectors that could target a real partner;
- scope every mutation to `TEST_KTS` and verify the selected profile name before save/delete;
- after delete, reload/query and verify the exact synthetic text is absent.

## Blocking conditions
Stop oracle mutation and report a concrete blocker if any of these occurs:
- login / OTP / CAPTCHA / UAC required;
- `TEST_KTS` not found;
- target app is remote-desktop/bitmap-only;
- delete action cannot be tied uniquely to the synthetic message;
- config restore cannot be proven;
- automation would require guessing screen coordinates for destructive actions.

In all blocked cases, repository audit must still continue and produce `RULE_MATRIX.md`, `ORACLE_TEST_PLAN.md`, and `OVERNIGHT_SETTLEMENT_AUDIT_RESULT.md`.