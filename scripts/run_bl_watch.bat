@echo off
REM ============================================================
REM  TWL BL watch - Windows Task Scheduler entry
REM  Polls registered B/Ls (bl_watch) via the carrier-track Edge Function,
REM  stores a snapshot, detects ETD/ETA changes and sends e-mail notices.
REM  Register : Register-ScheduledTask -TaskName "TWL_BlWatch" ...
REM             -Daily -At 08:20 and 20:20 (twice a day)
REM  Requires : user env var SUPABASE_SERVICE_KEY
REM             (the python script also falls back to the user Environment registry)
REM  Behavior : idempotent - a re-run only appends a new snapshot; a change is
REM             notified once (notified flag) so duplicate mail is avoided
REM  Log      : logs\bl_watch.log (UTF-8)
REM  NOTE     : keep this file ASCII-only. cmd.exe parses .bat with the console
REM             codepage, so non-ASCII bytes break command parsing silently.
REM ============================================================
setlocal
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "ROOT=%~dp0.."
set "LOGDIR=%ROOT%\logs"
set "LOG=%LOGDIR%\bl_watch.log"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul

REM python: prefer the known install path (Task Scheduler may have a reduced PATH)
set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=python"

>>"%LOG%" echo.
>>"%LOG%" echo ===== %DATE% %TIME% =====

pushd "%ROOT%"
"%PY%" "%ROOT%\scripts\collect_bl_watch.py" >>"%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
popd
>>"%LOG%" echo exit=%RC%

REM always exit 0 so a data-side failure does not mark the task as failed;
REM diagnose from the log instead.
exit /b 0
