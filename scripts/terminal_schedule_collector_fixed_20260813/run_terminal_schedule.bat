@echo off
rem ============================================================
rem  TWL_TmSch unattended runner  (v4, 2026-08-18)
rem  RULES - do not break these:
rem   1) ASCII-only file (cmd parser + chcp 65001 issue)
rem   2) NEVER expand %SCRIPT% / %LOG% inside ( ) blocks:
rem      folder path contains parentheses, the expanded ")"
rem      terminates the block early -> exit 255.
rem      v1-v3 all died this way. Single-line if + goto only.
rem   3) no pause (interactive version: START_HERE.bat)
rem  runner log: %~dp0logs\tmsch_runner_YYYYMMDD.log
rem  collector log: D:\...\_tools\logs (written by python)
rem ============================================================
setlocal EnableExtensions

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUNBUFFERED=1"
set "SCRIPT=%~dp0terminal_schedule_collector.py"
set "LOGDIR=%~dp0logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul

for /f "tokens=1-3 delims=-/. " %%a in ("%date%") do set "YMD=%%a%%b%%c"
set "YMD=%YMD:~0,8%"
set "LOG=%LOGDIR%\tmsch_runner_%YMD%.log"

>> "%LOG%" echo ================================
>> "%LOG%" echo RUN   %date% %time%

if not exist "%SCRIPT%" goto :ERR_NOSCRIPT

set "PYEXE="
where py >nul 2>&1 && set "PYEXE=py -3"
if not defined PYEXE where python >nul 2>&1 && set "PYEXE=python"
if not defined PYEXE goto :ERR_NOPY

>> "%LOG%" echo PYEXE %PYEXE%
>> "%LOG%" echo START collector

%PYEXE% "%SCRIPT%" --browser chromium --keep-debug >> "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"

>> "%LOG%" echo END   %date% %time%
>> "%LOG%" echo EXIT  %RC%
endlocal & exit /b %RC%

:ERR_NOSCRIPT
>> "%LOG%" echo ERROR collector-script-not-found
>> "%LOG%" echo EXIT  2
endlocal & exit /b 2

:ERR_NOPY
>> "%LOG%" echo ERROR python-launcher-not-found
>> "%LOG%" echo EXIT  3
endlocal & exit /b 3
