@echo off
rem ============================================================
rem  콘솔 "빠른 편집(QuickEdit)" 모드 해제
rem  - 실행 중 창을 클릭하면 제목이 "선택"으로 바뀌며
rem    배치/파이썬 실행이 멈추는 현상을 방지합니다.
rem  - 현재 사용자(HKCU) 설정만 변경하며, 새로 여는 cmd 창부터 적용됩니다.
rem ============================================================
setlocal EnableExtensions
chcp 65001 >nul

echo [현재 설정 확인]
reg query "HKCU\Console" /v QuickEdit 2>nul
echo.
set /p ANS=빠른 편집 모드를 끄시겠습니까? (Y/N): 
if /i not "%ANS%"=="Y" (
    echo 취소했습니다.
    pause
    exit /b 1
)

reg add "HKCU\Console" /v QuickEdit /t REG_DWORD /d 0 /f >nul
if errorlevel 1 (
    echo [ERROR] 레지스트리 변경에 실패했습니다.
    pause
    exit /b 2
)

echo [완료] 빠른 편집 모드를 해제했습니다.
echo 지금 열려 있는 창에는 적용되지 않습니다. cmd 창을 새로 여십시오.
echo 되돌리려면 값 QuickEdit 를 1 로 설정하십시오.
pause
exit /b 0
