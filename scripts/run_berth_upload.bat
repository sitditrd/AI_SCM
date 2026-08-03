@echo off
chcp 65001 >nul
REM ============================================================
REM  TWL 선석배정 정시 적재 (Windows 작업 스케줄러용 · 앱 무관)
REM  등록:  schtasks /create /tn "TWL_BerthUpload" /tr "\"<REPO>\scripts\run_berth_upload.bat\"" /sc daily /st 06:40 /f
REM  선결:  사용자 환경변수 SUPABASE_SERVICE_KEY 등록 (없으면 [SKIP] 남기고 정상 종료)
REM  성질:  동일 수집일 replace(멱등) — Claude 앱 스케줄러 ②와 중복 실행돼도 안전
REM  로그:  logs\berth_upload.log (UTF-8)
REM ============================================================
setlocal enabledelayedexpansion
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "ROOT=%~dp0.."
set "LOGDIR=%ROOT%\logs"
set "LOG=%LOGDIR%\berth_upload.log"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul

REM --- python 실행 파일 결정: 절대경로 우선(작업 스케줄러는 PATH가 축소될 수 있음) ---
set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PY%" (
  for /f "delims=" %%P in ('where python 2^>nul') do (
    if not defined PYFOUND set "PYFOUND=%%P"
  )
  if defined PYFOUND (set "PY=!PYFOUND!") else (set "PY=")
)

>>"%LOG%" echo.
>>"%LOG%" echo ===== %DATE% %TIME% =====

if "%PY%"=="" (
  >>"%LOG%" echo [FAIL] python 실행 파일을 찾지 못했습니다 - PATH 또는 설치 경로 확인
  exit /b 0
)

if "%SUPABASE_SERVICE_KEY%"=="" (
  >>"%LOG%" echo [SKIP] SUPABASE_SERVICE_KEY 미설정 - 적재 건너뜀 ^(Claude 앱 스케줄러가 캐치업^)
  exit /b 0
)

pushd "%ROOT%"
"%PY%" "%ROOT%\scripts\upload_berth_sql_parts.py" --rest --today >>"%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
popd
>>"%LOG%" echo exit=%RC%

REM 작업 스케줄러 이력에 실패로 남지 않도록 항상 0 종료 (원인은 로그로 추적)
exit /b 0
