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
echo 터미널 선석배정 수집기 - 화면 표시 실행
echo ============================================================
echo 첫 실행에서는 누락 패키지와 Chromium을 자동 설치합니다.
echo 브라우저 창과 터미널별 진행 로그가 표시됩니다.
echo.

py "%SCRIPT%" --browser chromium --headed --keep-debug --verbose
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo ============================================================
echo 실행 종료
echo 종료 코드: %EXIT_CODE%
echo 로그 폴더: D:\터미널 스케쥴 정보\_tools\logs
echo 통합 Excel: D:\터미널 스케쥴 정보\통합\YYYY\MM
if "%EXIT_CODE%"=="0" (
    echo 전체 대상 처리가 정상 완료되었습니다.
) else if "%EXIT_CODE%"=="1" (
    echo 일부 터미널이 실패했습니다. 위 결과와 로그를 확인하십시오.
) else (
    echo 환경 점검 또는 프로그램 실행이 중단되었습니다. 위 오류를 확인하십시오.
)
echo ============================================================
pause
exit /b %EXIT_CODE%
