@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "SCRIPT=%~dp0terminal_schedule_collector.py"

if not exist "%SCRIPT%" (
    echo [ERROR] terminal_schedule_collector.py 파일을 찾을 수 없습니다.
    echo 현재 BAT 파일과 Python 파일을 같은 폴더에 두십시오.
    pause
    exit /b 2
)

where py >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python Launcher py.exe를 찾을 수 없습니다.
    echo Python 3.10 이상을 설치한 뒤 다시 실행하십시오.
    pause
    exit /b 2
)

echo ============================================================
echo 터미널 선석배정 수집기 - 환경 설치 및 점검
echo ============================================================
echo 누락된 Python 패키지와 Playwright Chromium을 자동 설치합니다.
echo 최초 실행은 Chromium 다운로드로 수 분이 걸릴 수 있습니다.
echo.

py "%SCRIPT%" --setup --verbose
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo ============================================================
if "%EXIT_CODE%"=="0" (
    echo 환경 설치 및 자체 점검이 정상 완료되었습니다.
) else (
    echo 환경 설치 또는 자체 점검에 실패했습니다. 위 오류를 확인하십시오.
)
echo 종료 코드: %EXIT_CODE%
echo ============================================================
pause
exit /b %EXIT_CODE%
