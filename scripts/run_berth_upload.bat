@echo off
REM ============================================================
REM  TWL 선석배정 정시 적재 (Windows 작업 스케줄러용 · 앱 무관)
REM  등록:  schtasks /create /tn "TWL_BerthUpload" /tr "\"%~f0\"" /sc daily /st 06:40 /f
REM  선결:  시스템/사용자 환경변수 SUPABASE_SERVICE_KEY 등록 필요
REM  성질:  동일 수집일 replace(멱등) — Claude 앱 스케줄러와 중복 실행돼도 안전
REM ============================================================
setlocal
set LOG=%~dp0..\logs\berth_upload.log
if not exist "%~dp0..\logs" mkdir "%~dp0..\logs"

echo. >> "%LOG%"
echo ===== %DATE% %TIME% ===== >> "%LOG%"

if "%SUPABASE_SERVICE_KEY%"=="" (
  echo [SKIP] SUPABASE_SERVICE_KEY 미설정 - 적재 건너뜀 >> "%LOG%"
  exit /b 0
)

python "%~dp0upload_berth_sql_parts.py" --rest --today >> "%LOG%" 2>&1
echo exit=%ERRORLEVEL% >> "%LOG%"
endlocal
