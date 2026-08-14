@echo off
REM ============================================================
REM  TWL BL watch - Windows Task Scheduler entry
REM  Polls registered B/Ls (bl_watch) via the carrier-track Edge Function,
REM  stores a snapshot, detects ETD/ETA changes and sends e-mail notices.
REM  Register : Register-ScheduledTask -TaskName "TWL_BlWatch" ...
REM             -Daily 9 triggers 06:20..22:20 (2h apart)
REM  Requires : user env var SUPABASE_SERVICE_KEY
REM             (the python script also falls back to the user Environment registry)
REM  Behavior : idempotent - a re-run only appends a new snapshot; a change is
REM             notified once (notified flag) so duplicate mail is avoided
REM  Log      : logs\bl_watch.log (UTF-8)
REM  NOTE     : keep this file ASCII-only. cmd.exe parses .bat with the console
REM             codepage, so non-ASCII bytes break command parsing silently.
REM
REM  2026-08-14 self-diagnostics added. The task always exits 0 so a data-side
REM  failure never shows up as a red mark in Task Scheduler - which means the
REM  LOG is the only place a fault is visible. These markers make it greppable:
REM      [ENV]  environment resolution (python path, key presence)
REM      [FAIL] the run could not even start (python missing / key missing)
REM      exit=N python return code (0 = ok)
REM  Health check: findstr /c:"[FAIL]" logs\bl_watch.log
REM ============================================================
setlocal enabledelayedexpansion
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "ROOT=%~dp0.."
set "LOGDIR=%ROOT%\logs"
set "LOG=%LOGDIR%\bl_watch.log"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul

>>"%LOG%" echo.
>>"%LOG%" echo ===== %DATE% %TIME% =====

REM ---- resolve python -----------------------------------------------------
REM Task Scheduler runs with a reduced PATH, so probe the known install paths
REM first. Versions are listed newest-first: a python upgrade used to break the
REM single hardcoded 3.12 path silently (the fallback "python" then had to be on
REM PATH, which under Task Scheduler it often is not).
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
  >>"%LOG%" echo [FAIL] python not found - checked %%LOCALAPPDATA%%\Programs\Python\Python31x and PATH.
  >>"%LOG%" echo [FAIL] install python or fix PATH, then re-run scripts\run_bl_watch.bat
  exit /b 0
)
>>"%LOG%" echo [ENV] python=%PY%

REM ---- check the service key ---------------------------------------------
REM Absence is not fatal here: the python side also reads the user Environment
REM registry directly (env_key), which covers "setx done but not yet inherited".
REM Still worth logging, because a rotated/removed key looks like a silent
REM no-op otherwise.
if defined SUPABASE_SERVICE_KEY (
  >>"%LOG%" echo [ENV] SUPABASE_SERVICE_KEY=present
) else (
  >>"%LOG%" echo [ENV] SUPABASE_SERVICE_KEY=not in process env - python will read it from the user registry
)

pushd "%ROOT%"
"%PY%" "%ROOT%\scripts\collect_bl_watch.py" >>"%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
popd
>>"%LOG%" echo exit=%RC%
if not "%RC%"=="0" >>"%LOG%" echo [FAIL] collector returned %RC% - see the lines above

REM always exit 0 so a data-side failure does not mark the task as failed;
REM diagnose from the log instead.
exit /b 0
