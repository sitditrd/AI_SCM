@echo off
rem =====================================================
rem TWL SmartBPO 로컬 서버 실행 (http://localhost:8090)
rem 더블클릭하면 브라우저가 자동으로 열립니다.
rem 종료: 이 창에서 Ctrl+C 또는 창 닫기
rem =====================================================
cd /d C:\Temp\AI_SCM
start "" http://localhost:8090/index.html
python -m http.server 8090 --directory C:\Temp\AI_SCM
