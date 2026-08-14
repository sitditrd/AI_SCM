터미널 선석배정현황 자동 수집기
================================
버전: 2026.08.13.2-autosetup

1. 이번 수정 내용
-----------------
실행 로그에서 tzdata 설치는 완료됐지만 Playwright Python 패키지가 없어서
브라우저 대상 12개 터미널이 모두 실패하고, requests 대상 4개만 수집된 것을 확인했습니다.

이번 버전은 Python 파일을 직접 실행해도 다음 항목을 수집 시작 전에 자동 처리합니다.

- requests / beautifulsoup4 / openpyxl / tzdata 누락 여부 확인 및 자동 설치
- playwright Python 패키지 누락 여부 확인 및 자동 설치
- Playwright Chromium 실제 실행 점검
- Chromium 미설치 시 자동 다운로드 및 설치
- 환경 점검 실패 시 사이트 수집 자체를 시작하지 않음
- 같은 날짜의 기존 pending JSON은 _tools\pending_stale 폴더로 대피
  (불완전한 이전 보고서가 작업 스케줄러로 발송되는 것을 방지)

2. 가장 간단한 실행 방법
------------------------
ZIP 압축을 새 폴더에 풀고 다음 파일을 더블클릭하십시오.

    run_terminal_schedule_visible.bat

BAT 파일은 자신이 있는 폴더의 terminal_schedule_collector.py를 절대 경로로 실행하므로,
CMD에서 별도로 cd 명령을 입력할 필요가 없습니다.

최초 실행에서는 Playwright Chromium을 다운로드하므로 수 분이 걸릴 수 있습니다.
이후 실행부터는 설치 여부만 점검하고 바로 수집을 시작합니다.

3. 환경 설치만 먼저 확인
------------------------
다음 파일을 더블클릭합니다.

    install_terminal_schedule.bat

정상 완료 메시지:

    SETUP PASSED: Python 패키지, Chromium, 자체 점검 정상

4. CMD에서 직접 실행
--------------------
현재 폴더에서 실행:

    py terminal_schedule_collector.py --browser chromium --headed --keep-debug --verbose

Python 파일을 전체 경로로 실행해도 됩니다.

    py "C:\원하는폴더\terminal_schedule_collector.py" --browser chromium --headed --keep-debug --verbose

누락 패키지 자동 설치를 금지하려는 경우에만 다음 옵션을 추가합니다.

    --no-auto-install

5. 작업 스케줄러용
------------------

    run_terminal_schedule.bat

브라우저 창을 표시하지 않는 무인 실행용입니다.

6. Excel 저장 위치
------------------
통합 Excel:

    D:\터미널 스케쥴 정보\통합\YYYY\MM\터미널_선석배정현황_통합_YYYYMMDD.xlsx

터미널별 Excel:

    D:\터미널 스케쥴 정보\각 터미널 폴더\코드_선석배정현황_YYYYMMDD.xlsx

로그:

    D:\터미널 스케쥴 정보\_tools\logs\terminal_schedule_YYYYMMDD.log

실패 화면/HTML:

    D:\터미널 스케쥴 정보\_tools\debug\YYYYMMDD

기존 발송 지시서 대피 위치:

    D:\터미널 스케쥴 정보\_tools\pending_stale

7. 종료 코드
-------------
0 : 전체 대상 정상 처리
1 : 일부 터미널 실패, 성공한 터미널 산출물은 생성됨
2 : 환경 점검 실패 또는 전체 실행 불가
130 : 사용자 중단

8. 주의
-------
- 첫 실행에는 인터넷 연결이 필요합니다.
- 회사 방화벽이나 프록시가 Playwright 다운로드를 차단하면 환경 점검 단계에서 중단됩니다.
- 환경 점검이 끝나기 전에는 통합 Excel이나 pending JSON을 새로 만들지 않습니다.
- 사이트 DOM이 변경된 개별 터미널은 실패 처리되며 나머지는 계속 수집합니다.
