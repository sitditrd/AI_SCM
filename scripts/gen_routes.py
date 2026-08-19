# -*- coding: utf-8 -*-
"""
해상 항로 사전 계산 — Focus Port 93개 전 조합(4,278쌍)을 searoute로 계산해
정적 JSON(routes/<slug>.json)으로 저장한다. 배포판(Netlify)에서도 백엔드 없이 동작.

  python scripts/gen_routes.py     (약 3~5분 소요, 1회 실행)
출력: routes/{origin-slug}.json = { "<dest-slug>": {"nm": 거리, "line": [[lat,lng]...]}, ... }
"""
import sys, os, io, re, json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import searoute as sr

# 저장소 루트 기준 상대경로 — 유령 경로 C:\Temp\AI_SCM 하드코딩으로 실행 불가였던 것 교정(2026-08-20)
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'routes')
os.makedirs(OUT, exist_ok=True)

# data.js의 P('en','ko','cc','rg', lat, lng, ...) 시드에서 항만 좌표 추출
src = io.open(os.path.join(BASE, 'js', 'data.js'), encoding='utf-8').read()
ports = []
for m in re.finditer(r"P\('([^']+)',\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*(-?[\d.]+),\s*(-?[\d.]+)", src):
    ports.append({'en': m.group(1), 'lat': float(m.group(2)), 'lng': float(m.group(3))})
print('ports:', len(ports))
assert len(ports) == 93, '93개 항만 파싱 실패'


def slug(en):
    return re.sub(r'[^a-z0-9]+', '-', en.lower()).strip('-')


def decimate(coords, max_pts=40):
    if len(coords) <= max_pts:
        pts = coords
    else:
        step = (len(coords) - 1) / (max_pts - 1)
        pts = [coords[round(i * step)] for i in range(max_pts)]
    return [[round(c[1], 1), round(c[0], 1)] for c in pts]   # [lat,lng], 소수1자리


total, fail = 0, 0
for o in ports:
    data = {}
    for d in ports:
        if o['en'] == d['en']:
            continue
        try:
            rt = sr.searoute((o['lng'], o['lat']), (d['lng'], d['lat']), units='naut')
            data[slug(d['en'])] = {'nm': round(rt['properties']['length'], 1),
                                   'line': decimate(rt['geometry']['coordinates'])}
            total += 1
        except Exception as e:
            fail += 1
            print('FAIL', o['en'], '->', d['en'], e)
    with io.open(os.path.join(OUT, slug(o['en']) + '.json'), 'w', encoding='utf-8') as fp:
        json.dump(data, fp, separators=(',', ':'))
    print('done:', o['en'], len(data))
print('TOTAL routes:', total, 'fail:', fail)
