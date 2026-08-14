# -*- coding: utf-8 -*-
"""
TWL Berth Insight — 통합 xlsx → 분할 SQL 생성기 (스케줄 적재용)
=====================================================
backfill_upload_berth.py 의 --sql 모드는 단일 파일을 생성하지만, Supabase MCP
execute_sql 로 실행하기엔 커서(일일 약 80KB) 파트 파일로 분할 생성한다.

  python upload_berth_sql_parts.py "D:\\터미널 스케쥴 정보\\터미널_선석배정현황_통합_YYYYMMDD.xlsx"
      → %TEMP%\\berth_sql_parts\\part_00.sql (동일 수집일 delete)
        part_01..NN.sql (120건 단위 insert)
        part_99.sql (bs_collect_log 기록)
      각 파트를 순서대로 Supabase MCP execute_sql 로 실행하면 적재 완료 (재실행 안전).

  python upload_berth_sql_parts.py --rest "…\\터미널_선석배정현황_통합_YYYYMMDD.xlsx"
      → SQL 파일 없이 REST로 직접 적재 (환경변수 SUPABASE_SERVICE_KEY 필요).
        Windows 작업 스케줄러 등 앱과 무관한 정시 실행 경로용. 동일 수집일 replace라 앱 스케줄러와
        중복 실행돼도 안전하다. 날짜 인자 없이 --today 를 주면 오늘 날짜 파일을 자동 탐색한다.
"""
import sys, os, glob, json, datetime, shutil

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect_upload_berth import sql_q, sql_ts
from backfill_upload_berth import parse_workbook_v, FNAME_RE

OUT_DIR = os.path.join(os.environ.get('TEMP', r'C:\Temp'), 'berth_sql_parts')
ROWS_PER_PART = 120
DATA_DIR = r'D:\터미널 스케쥴 정보'      # 06시 수집기 산출 위치 (--today 자동 탐색)


def integrated_path(d):
    """수집일 d 의 통합 파일 경로를 찾는다(없으면 None).

    06시 수집기가 2026-08-09 부터 통합 파일을 `통합\\YYYY\\MM\\` 로 아카이브하도록 바뀌어
    루트만 보던 탐색이 08-10·08-11 분을 놓쳤다(실측). 두 위치를 모두 확인한다.
    확장자는 수집기가 .xlsx / .xls(SpreadsheetML) 중 무엇으로 저장해도 잡히도록 둘 다 본다.
    """
    ymd = d.strftime('%Y%m%d')
    dirs = (DATA_DIR, os.path.join(DATA_DIR, '통합', d.strftime('%Y'), d.strftime('%m')))
    for base in dirs:
        for ext in ('.xlsx', '.xls'):
            p = os.path.join(base, '터미널_선석배정현황_통합_%s%s' % (ymd, ext))
            if os.path.exists(p):
                return p
    return None


COLS = ('  (collected_date, terminal_cd, sub_terminal, berth, carrier, vessel_name, voyage, route,\n'
        '   cct, eta, etd, work_start, work_end, discharge_qty, load_qty, shift_qty, status) values\n')


def upload_rest(rows, per_terminal, cdate, fname):
    """--rest 모드: SQL 파일 없이 REST 직접 적재 (동일 수집일 replace — 멱등)"""
    from urllib.parse import quote
    from collect_upload_berth import sb, to_tz, SERVICE_KEY, log_verdict
    if not SERVICE_KEY:
        sys.exit('[FAIL] 환경변수 SUPABASE_SERVICE_KEY 미설정 — REST 적재 불가 '
                 '(키 없이 쓰려면 --rest 없이 실행해 SQL 파트를 생성하십시오)')
    sb('DELETE', '/rest/v1/bs_vessel_calls?collected_date=eq.%s' % cdate)
    for i in range(0, len(rows), 100):
        sb('POST', '/rest/v1/bs_vessel_calls', [to_tz(x) for x in rows[i:i + 100]])
    sb('DELETE', '/rest/v1/bs_collect_log?collected_date=eq.%s&message=like.%s'
       % (cdate, quote('스케줄 적재*')))
    st, msg = log_verdict(per_terminal, '스케줄 적재 (upload_berth_sql_parts.py --rest)')
    sb('POST', '/rest/v1/bs_collect_log', {
        'collected_date': str(cdate), 'file_name': fname, 'total_rows': len(rows),
        'per_terminal': per_terminal, 'status': st, 'message': msg,
    })


def main():
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    rest_mode = '--rest' in flags
    if not args and '--today' in flags:
        # 미적재 날짜 자동 캐치업: 최근 3일치 중 로컬 파일이 있는 날짜를 모두 대상으로 삼는다.
        # (수집이 늦어 07:30 배치가 헛돌아도, 이후 재시도 트리거에서 자동으로 잡힌다)
        today = datetime.date.today()
        args = []
        for back in range(0, 3):
            p = integrated_path(today - datetime.timedelta(days=back))
            if p:
                args.append(p)
        if not args:
            # ※ 과거 파일로 대체 적재하지 않는다 — 어제 데이터를 오늘 날짜로 넣는 것은 무의미하고,
            #    exit=0 으로 끝나 "정상"처럼 보여 수집 실패를 감춘다(2026-08-04 실측 사례).
            sys.exit('[SKIP] 최근 3일치 수집 파일이 없습니다 — 06시 수집기 실행 여부를 확인하십시오: '
                     '%s (및 %s\\통합\\YYYY\\MM)' % (DATA_DIR, DATA_DIR))
        print('[INFO] 캐치업 대상 %d개: %s' % (len(args), ', '.join(os.path.basename(a) for a in args)))
    if not args:
        sys.exit('사용법: upload_berth_sql_parts.py [--rest] [--today] <통합 xlsx 경로>')

    # --rest 는 여러 날짜를 연속 적재할 수 있다(캐치업). SQL 파트 생성은 단일 파일만.
    if rest_mode:
        ok = 0
        for path in args:
            m = FNAME_RE.search(os.path.basename(path))
            if not m or not os.path.exists(path):
                print('[SKIP] 대상 아님: %s' % path)
                continue
            cdate = datetime.datetime.strptime(m.group(1), '%Y%m%d').date()
            rows, per_terminal, warns = parse_workbook_v(path, cdate)
            if not rows:
                print('[FAIL] %s 정규화 결과 0건 — 원본 확인 필요' % cdate)
                continue
            upload_rest(rows, per_terminal, cdate, os.path.basename(path))
            print('[OK] %s %d건 REST 적재 완료' % (cdate, len(rows)))
            for k in sorted(per_terminal):
                print('  %s: %s' % (k, per_terminal[k]))
            for w in warns:
                print('[WARN] ' + w)
            ok += 1
        if not ok:
            sys.exit('[FAIL] 적재된 날짜가 없습니다')
        return

    path = args[0]
    m = FNAME_RE.search(os.path.basename(path))
    if not m:
        sys.exit('[FAIL] 파일명에서 날짜를 찾을 수 없습니다: %s' % path)
    if not os.path.exists(path):
        sys.exit('[FAIL] 파일 없음: %s' % path)
    cdate = datetime.datetime.strptime(m.group(1), '%Y%m%d').date()

    rows, per_terminal, warns = parse_workbook_v(path, cdate)
    if not rows:
        sys.exit('[FAIL] 정규화 결과 0건 — 원본 확인 필요')

    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR)
    parts = []

    def emit(name, text):
        p = os.path.join(OUT_DIR, name)
        with open(p, 'w', encoding='utf-8') as fp:
            fp.write(text)
        parts.append(p)

    emit('part_00.sql', "delete from public.bs_vessel_calls where collected_date = '%s';" % cdate)

    for i in range(0, len(rows), ROWS_PER_PART):
        vals = []
        for r in rows[i:i + ROWS_PER_PART]:
            vals.append('  (%s)' % ', '.join([
                sql_q(r['collected_date']), sql_q(r['terminal_cd']), sql_q(r['sub_terminal']),
                sql_q(r['berth']), sql_q(r['carrier']), sql_q(r['vessel_name']),
                sql_q(r['voyage']), sql_q(r['route']),
                sql_ts(r['cct']), sql_ts(r['eta']), sql_ts(r['etd']),
                sql_ts(r['work_start']), sql_ts(r['work_end']),
                str(r['discharge_qty']), str(r['load_qty']), str(r['shift_qty']), sql_q(r['status']),
            ]))
        emit('part_%02d.sql' % (i // ROWS_PER_PART + 1),
             'insert into public.bs_vessel_calls\n' + COLS + ',\n'.join(vals) + ';')

    emit('part_99.sql',
         "delete from public.bs_collect_log where collected_date = '%s' and message like '스케줄 적재%%';\n" % cdate
         + "insert into public.bs_collect_log (collected_date, file_name, total_rows, per_terminal, status, message) values "
           "('%s', %s, %d, %s::jsonb, 'SUCCESS', '스케줄 적재 (upload_berth_sql_parts.py)');"
           % (cdate, sql_q(os.path.basename(path)), len(rows),
              sql_q(json.dumps(per_terminal, ensure_ascii=False))))

    print('수집일 %s, 총 %d건, 파트 %d개 → %s' % (cdate, len(rows), len(parts), OUT_DIR))
    for k in sorted(per_terminal):
        print('  %s: %s' % (k, per_terminal[k]))
    for w in warns:
        print('[WARN] ' + w)
    for p in parts:
        print('PART: %s (%d bytes)' % (p, os.path.getsize(p)))


if __name__ == '__main__':
    main()
