@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "SCRIPT=%~dp0terminal_schedule_collector.py"

if not exist "%SCRIPT%" exit /b 2
where py >nul 2>&1
if errorlevel 1 exit /b 2

rem 작업 스케줄러용 무인 실행. 누락 패키지와 Chromium은 자동 설치됩니다.
py "%SCRIPT%" --browser chromium --keep-debug
exit /b %ERRORLEVEL%
