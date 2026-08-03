@echo off
REM ============================================================
REM  TWL berth upload - Windows Task Scheduler entry (app-independent)
REM  Register : Register-ScheduledTask -TaskName "TWL_BerthUpload" ... -Daily -At 06:40
REM  Requires : user env var SUPABASE_SERVICE_KEY
REM             (the python script also falls back to the user Environment registry)
REM  Behavior : same collected_date is replaced (idempotent) - safe to run
REM             alongside the Claude app scheduler
REM  Log      : logs\berth_upload.log (UTF-8)
REM  NOTE     : keep this file ASCII-only. cmd.exe parses .bat with the console
REM             codepage, so non-ASCII bytes break command parsing silently.
REM ============================================================
setlocal
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "ROOT=%~dp0.."
set "LOGDIR=%ROOT%\logs"
set "LOG=%LOGDIR%\berth_upload.log"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul

REM python: prefer the known install path (Task Scheduler may have a reduced PATH)
set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=python"

>>"%LOG%" echo.
>>"%LOG%" echo ===== %DATE% %TIME% =====

pushd "%ROOT%"
"%PY%" "%ROOT%\scripts\upload_berth_sql_parts.py" --rest --today >>"%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
popd
>>"%LOG%" echo exit=%RC%

REM always exit 0 so a data-side failure does not mark the task as failed;
REM diagnose from the log instead.
exit /b 0
