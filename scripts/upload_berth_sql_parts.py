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
"""
import sys, os, json, datetime, shutil

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect_upload_berth import sql_q, sql_ts
from backfill_upload_berth import parse_workbook_v, FNAME_RE

OUT_DIR = os.path.join(os.environ.get('TEMP', r'C:\Temp'), 'berth_sql_parts')
ROWS_PER_PART = 120

COLS = ('  (collected_date, terminal_cd, sub_terminal, berth, carrier, vessel_name, voyage, route,\n'
        '   cct, eta, etd, work_start, work_end, discharge_qty, load_qty, shift_qty, status) values\n')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit('사용법: upload_berth_sql_parts.py <통합 xlsx 경로>')
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
