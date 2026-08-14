@echo off
REM ============================================================
REM  TWL carrier canary - weekly health check (Sunday 08:00)
REM  Probes every live carrier adapter with a real B/L, compares the shape of
REM  the result against last week's baseline, checks collector health, and
REM  mails a report ONLY when something looks wrong.
REM
REM  It never edits code. Detection is automatic, fixing is not - a bad
REM  automatic patch would take down carriers that were working, over a
REM  weekend, with nobody watching until Monday.
REM
REM  Register : Register-ScheduledTask -TaskName "TWL_CarrierCanary" ...
REM             -Weekly -DaysOfWeek Sunday -At 08:00
REM  Requires : user env var SUPABASE_SERVICE_KEY
REM             optional CANARY_EMAIL (defaults to itt@twsc.co.kr)
REM  Log      : logs\canary.log (UTF-8) + logs\canary_run.log (this wrapper)
REM  Baseline : logs\canary_baseline.json (git-ignored)
REM  NOTE     : keep this file ASCII-only. cmd.exe parses .bat with the console
REM             codepage, so non-ASCII bytes break command parsing silently.
REM ============================================================
setlocal enabledelayedexpansion
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "ROOT=%~dp0.."
set "LOGDIR=%ROOT%\logs"
set "LOG=%LOGDIR%\canary_run.log"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul

>>"%LOG%" echo.
>>"%LOG%" echo ===== %DATE% %TIME% =====

set "PY="
for %%V in (313 312 311 310) do (
  if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe" (
    set "PY=%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe"
  )
)
if not defined PY if exist "%ProgramFiles%\Python312\python.exe" set "PY=%ProgramFiles%\Python312\python.exe"
if not defined PY (
  where python >nul 2>&1 && set "PY=python"
)
if not defined PY (
  >>"%LOG%" echo [FAIL] python not found - the canary could not run
  exit /b 0
)
>>"%LOG%" echo [ENV] python=%PY%

pushd "%ROOT%"
"%PY%" "%ROOT%\scripts\canary_carriers.py" >>"%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
popd
>>"%LOG%" echo exit=%RC%
if not "%RC%"=="0" >>"%LOG%" echo [FAIL] canary returned %RC%

exit /b 0
