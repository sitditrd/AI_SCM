# -*- coding: utf-8 -*-
"""
TWL 해상운임지수 수집기 — KCCI(한국해양진흥공사) + SCFI/CCFI(상하이해운거래소)
=====================================================
전부 무료·무인증 소스. 주 2회(월·금) 실행 권장 — KCCI는 월요일, SCFI/CCFI는 금요일 발표.

  python collect_freight_index.py          ← Supabase REST 적재 (SUPABASE_SERVICE_KEY 필요)
  python collect_freight_index.py --sql    ← upload_freight.sql 생성 (키 불필요)
"""
import sys, os, re, json, datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import requests

SUPABASE_URL = 'https://kvmyiualdodcvreoqfin.supabase.co'
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
SQL_OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'sql', 'upload_freight.sql')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}


def num(s):
    try:
        return float(str(s).replace(',', '').strip())
    except (ValueError, TypeError):
        return None


def fetch_sse(index_name):
    """상하이해운거래소 무인증 JSON — SCFI/CCFI"""
    r = requests.get('https://en.sse.net.cn/currentIndex',
                     params={'indexName': index_name},
                     headers={**UA, 'Referer': 'https://en.sse.net.cn/'}, timeout=30)
    r.raise_for_status()
    js = r.json()
    rows = []
    # 실측 구조: {'data': {'currentDate':'YYYY-MM-DD', 'lineDataList':[
    #   {'properties': {'lineName_EN': ...}, 'currentContent': n, 'lastContent': n, 'percentage': n}, ...]}}
    data = js.get('data') or js
    pub = str(data.get('currentDate') or data.get('date') or datetime.date.today())
    m = re.search(r'(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', pub)
    pub_date = '%04d-%02d-%02d' % (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else str(datetime.date.today())
    for line in (data.get('lineDataList') or []):
        cur, prev = num(line.get('currentContent')), num(line.get('lastContent'))
        if cur is None:
            continue
        props = line.get('properties') or {}
        name = str(props.get('lineName_EN') or 'COMPOSITE').strip().upper()
        route = 'COMPOSITE' if ('COMPREHENSIVE' in name or 'COMPOSITE' in name) else name[:40]
        pct = num(line.get('percentage'))
        if pct is None and prev:
            pct = round((cur - prev) / prev * 100, 2)
        rows.append({'index_code': index_name.upper(), 'route': route, 'value': round(cur, 2),
                     'prev_value': round(prev, 2) if prev is not None else None,
                     'pct_change': round(pct, 2) if pct is not None else None, 'pub_date': pub_date})
    return rows


def fetch_kcci():
    """KOBC KCCI — 서버렌더링 HTML 테이블 파싱 (정규식, 의존성 없음)"""
    r = requests.get('https://www.kobc.or.kr/ebz/shippinginfo/kcci/gridList.do',
                     params={'mId': '0304000000'}, headers=UA, timeout=30)
    r.raise_for_status()
    html = r.text
    m = re.search(r'(\d{4})[-.](\d{2})[-.](\d{2})', html)
    pub_date = '%s-%s-%s' % (m.group(1), m.group(2), m.group(3)) if m else str(datetime.date.today())
    rows = []
    # 행 패턴: 지수명 셀 + 금주/전주 숫자 셀 — 테이블 구조 변화에 대비해 보수적으로 파싱
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S):
        tds = [re.sub(r'<[^>]+>', '', td).strip() for td in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', tr, re.S)]
        if len(tds) < 3:
            continue
        name = tds[0]
        cur, prev = num(tds[1]), num(tds[2])
        if cur is None or prev is None or not name:
            continue
        if not re.search(r'(KCCI|종합|미주|유럽|지중해|중동|호주|동남아|일본|중국|남미|서안|동안|KUEI|KUWI|KNEI|KMDI)', name, re.I):
            continue
        route = 'COMPOSITE' if ('종합' in name or name.upper().startswith('KCCI')) else name[:40]
        pct = round((cur - prev) / prev * 100, 2) if prev else None
        rows.append({'index_code': 'KCCI', 'route': route, 'value': cur,
                     'prev_value': prev, 'pct_change': pct, 'pub_date': pub_date})
    return rows


def main():
    sql_mode = '--sql' in sys.argv[1:]
    if not sql_mode and (not SERVICE_KEY or SERVICE_KEY.startswith('sb_publishable')):
        sys.exit('SUPABASE_SERVICE_KEY(sb_secret_...) 필요 — 키 없이 쓰려면 --sql 모드 사용')

    all_rows, errors = [], []
    for name, fn in [('scfi', fetch_sse), ('ccfi', fetch_sse), ('kcci', fetch_kcci)]:
        try:
            rows = fn(name) if fn is fetch_sse else fn()
            all_rows += rows
            print('%s: %d행 (발표일 %s)' % (name.upper(), len(rows), rows[0]['pub_date'] if rows else '-'))
        except Exception as e:
            errors.append('%s: %s' % (name.upper(), e))
            print('[WARN] %s 수집 실패: %s' % (name.upper(), e))
    if not all_rows:
        sys.exit('[FAIL] 모든 지수 수집 실패: ' + '; '.join(errors))

    if sql_mode:
        def q(v):
            return 'null' if v is None else ("'" + str(v).replace("'", "''") + "'" if isinstance(v, str) else str(v))
        lines = ['-- 자동 생성: collect_freight_index.py --sql (%d행)' % len(all_rows)]
        for r in all_rows:
            lines.append(
                'insert into public.freight_index (index_code, route, value, prev_value, pct_change, pub_date) '
                'values (%s, %s, %s, %s, %s, %s) '
                'on conflict (index_code, route, pub_date) do update set value=excluded.value, '
                'prev_value=excluded.prev_value, pct_change=excluded.pct_change, updated_at=now();'
                % (q(r['index_code']), q(r['route']), q(r['value']), q(r['prev_value']), q(r['pct_change']), q(r['pub_date'])))
        open(SQL_OUT, 'w', encoding='utf-8').write('\n'.join(lines))
        print('[OK] %s 생성 — %d행' % (SQL_OUT, len(all_rows)))
        return

    H = {'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY,
         'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'}
    r = requests.post(SUPABASE_URL + '/rest/v1/freight_index?on_conflict=index_code,route,pub_date',
                      headers=H, json=all_rows, timeout=30)
    if r.status_code >= 300:
        sys.exit('[FAIL] HTTP %d: %s' % (r.status_code, r.text[:300]))
    print('[OK] Supabase 적재 %d행' % len(all_rows))


if __name__ == '__main__':
    main()
