@echo off
rem =====================================================
rem TWL Control Tower 로컬 서버 실행 (http://localhost:8090)
rem 더블클릭하면 브라우저가 자동으로 열립니다.
rem 종료: 이 창에서 Ctrl+C 또는 창 닫기
rem 경로는 이 배치파일 위치 기준 — 어느 PC/폴더에서도 동작(2026-08-20 교정)
rem =====================================================
cd /d "%~dp0"
start "" http://localhost:8090/index.html
python "%~dp0server.py"
