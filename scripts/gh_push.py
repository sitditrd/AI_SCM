# -*- coding: utf-8 -*-
"""git push 대체 — GitHub Git Data API 로 로컬 커밋을 원격에 그대로 올린다.

이 PC 의 Git for Windows 는 설치본이 깨져 있어(`usr/bin/sh.exe` 가
STATUS_ENTRYPOINT_NOT_FOUND 로 즉사) git 이 자격증명 헬퍼를 띄우지 못한다.
헬퍼는 전부 `sh -c` 로 실행되므로 gh·GCM 모두 조용히 빈 값을 반환하고
`git push` 는 "could not read Username" 으로 끝난다.

gh 는 sh 를 거치지 않으므로 멀쩡하다. 그래서 커밋 객체를 API 로 직접 만든다.
author·committer·date·message·tree·parents 를 원본 그대로 복제하므로
**생성된 커밋 SHA 가 로컬과 완전히 일치**한다. 즉 분기가 생기지 않고
fast-forward 로 붙으며, 로컬은 손댈 필요가 없다.

    python scripts/gh_push.py              # 현재 브랜치를 origin 에 반영
    python scripts/gh_push.py --dry-run    # 올리지 않고 계획만 출력
    python scripts/gh_push.py --branch master --remote origin

Git 을 재설치해 `sh.exe` 가 정상화되면 이 스크립트는 필요 없다. 그때는
`git push` 를 쓰면 된다(동작은 동일하다).
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass


class Fail(Exception):
    pass


# ---------------------------------------------------------------- git / gh 호출

def git(*args, binary=False):
    """git 을 호출하고 stdout 을 돌려준다. 경로 인용을 끄고 UTF-8 로 읽는다."""
    p = subprocess.run(
        ['git', '-c', 'core.quotepath=false'] + list(args),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise Fail('git %s 실패: %s' % (' '.join(args), p.stderr.decode('utf-8', 'replace').strip()))
    return p.stdout if binary else p.stdout.decode('utf-8')


def gh_path():
    for c in (os.environ.get('GH_PATH'),
              r'C:\Program Files\GitHub CLI\gh.exe',
              r'C:\Program Files (x86)\GitHub CLI\gh.exe',
              'gh'):
        if not c:
            continue
        try:
            subprocess.run([c, '--version'], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, check=True)
            return c
        except (OSError, subprocess.CalledProcessError):
            continue
    raise Fail('gh 를 찾지 못했다. GitHub CLI 설치 후 `gh auth login` 필요.')


GH = None


def gh_api(path, method='GET', payload=None):
    """gh api 호출. 인증은 gh 가 처리하므로 이 스크립트는 토큰을 다루지 않는다."""
    cmd = [GH, 'api', '-X', method, path]
    data = None
    if payload is not None:
        cmd += ['--input', '-']
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    p = subprocess.run(cmd, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out = p.stdout.decode('utf-8', 'replace')
    if p.returncode != 0:
        raise Fail('gh api %s %s 실패: %s' % (method, path, p.stderr.decode('utf-8', 'replace').strip() or out.strip()))
    return json.loads(out) if out.strip() else {}


# ---------------------------------------------------------------- 저장소 정보

def parse_remote(remote):
    url = git('remote', 'get-url', remote).strip()
    m = re.search(r'github\.com[:/]+([^/]+)/(.+?)(?:\.git)?$', url)
    if not m:
        raise Fail('GitHub 원격이 아니다: %s' % url)
    return m.group(1), m.group(2)


def parse_commit(sha):
    """커밋 객체 원문을 파싱한다. author/committer 는 원문 그대로 보존해야
    SHA 가 재현되므로 이름·메일·시각·타임존을 분해해 둔다."""
    raw = git('cat-file', 'commit', sha, binary=True)
    head, _, msg = raw.partition(b'\n\n')
    info = {'sha': sha, 'parents': [], 'message': msg.decode('utf-8')}
    for line in head.decode('utf-8').split('\n'):
        key, _, val = line.partition(' ')
        if key == 'tree':
            info['tree'] = val
        elif key == 'parent':
            info['parents'].append(val)
        elif key in ('author', 'committer'):
            m = re.match(r'^(.*) <(.*)> (\d+) ([+-]\d{4})$', val)
            if not m:
                raise Fail('%s 의 %s 헤더를 해석하지 못했다: %s' % (sha, key, val))
            name, email, epoch, tz = m.groups()
            # GitHub 은 ISO 8601 을 받는다. epoch 을 해당 타임존 기준 벽시계로 되돌린다.
            off = (1 if tz[0] == '+' else -1) * (int(tz[1:3]) * 3600 + int(tz[3:5]) * 60)
            local = int(epoch) + off
            d = _iso(local)
            info[key] = {'name': name, 'email': email,
                         'date': '%s%s:%s' % (d, tz[:3], tz[3:])}
    return info


def _iso(epoch):
    """UTC 기준 epoch 을 'YYYY-MM-DDTHH:MM:SS' 로. datetime 대신 직접 계산해
    로컬 타임존 영향을 배제한다."""
    import time
    return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(epoch))


def changed_entries(parent_tree_ref, sha):
    """부모 트리 대비 변경분을 GitHub tree API 항목으로 만든다.

    트리끼리 비교하므로 머지 커밋에서도 결과 트리가 정확하다(첫 부모 기준).
    -z 로 NUL 구분 출력을 써서 경로 인용 문제를 원천 차단한다.
    """
    args = ['diff-tree', '-r', '-z', '--no-renames', '--no-commit-id']
    args += ([parent_tree_ref, sha] if parent_tree_ref else ['--root', sha])
    out = git(*args, binary=True)
    fields = out.split(b'\x00')
    entries, i = [], 0
    while i < len(fields) and fields[i]:
        meta = fields[i].decode('utf-8')
        path = fields[i + 1].decode('utf-8')
        i += 2
        _, dstmode, _, dstsha, status = (meta[1:].split(' ') + [''])[:5]
        if status == 'D':
            # sha=None 이 삭제를 뜻한다. mode 는 반드시 붙여야 한다.
            entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': None})
            continue
        if dstmode == '160000':           # 서브모듈
            entries.append({'path': path, 'mode': '160000', 'type': 'commit', 'sha': dstsha})
            continue
        entries.append({'path': path, 'mode': dstmode, 'type': 'blob',
                        'sha': dstsha, '_upload': dstsha})
    return entries


# ---------------------------------------------------------------- 본 처리

def main():
    global GH
    ap = argparse.ArgumentParser()
    ap.add_argument('--remote', default='origin')
    ap.add_argument('--branch', default=None, help='기본값: 현재 브랜치')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    GH = gh_path()
    owner, repo = parse_remote(a.remote)
    branch = a.branch or git('rev-parse', '--abbrev-ref', 'HEAD').strip()
    api = 'repos/%s/%s' % (owner, repo)
    print('저장소 %s/%s  브랜치 %s' % (owner, repo, branch))

    dirty = git('status', '--porcelain').strip()
    if dirty:
        print('\n[경고] 커밋되지 않은 변경 %d건이 있다. 커밋된 것만 올라간다.'
              % len(dirty.splitlines()))

    remote_sha = gh_api('%s/git/ref/heads/%s' % (api, branch))['object']['sha']
    local_sha = git('rev-parse', 'HEAD').strip()
    print('원격 %s  →  로컬 %s' % (remote_sha[:7], local_sha[:7]))

    if remote_sha == local_sha:
        print('\n이미 최신이다. 올릴 것이 없다.')
        return 0

    # 원격이 로컬 조상인지 확인한다. 아니면 강제 갱신이 필요한 상황이므로 멈춘다.
    try:
        git('merge-base', '--is-ancestor', remote_sha, local_sha)
    except Fail:
        raise Fail('원격 %s 가 로컬 HEAD 의 조상이 아니다. 먼저 fetch·rebase 하라.' % remote_sha[:7])

    todo = git('rev-list', '--reverse', '%s..HEAD' % remote_sha).split()
    print('올릴 커밋 %d개\n' % len(todo))

    for n, sha in enumerate(todo, 1):
        c = parse_commit(sha)
        subject = c['message'].split('\n')[0]
        print('[%d/%d] %s %s' % (n, len(todo), sha[:7], subject[:60]))

        base_tree = git('rev-parse', '%s^{tree}' % c['parents'][0]).strip() if c['parents'] else None
        entries = changed_entries(c['parents'][0] if c['parents'] else None, sha)

        if a.dry_run:
            for e in entries:
                print('       %s %s' % ('삭제' if e['sha'] is None else '변경', e['path']))
            continue

        # 1) blob 업로드. 이미 있으면 GitHub 이 같은 SHA 를 돌려주므로 멱등이다.
        for e in entries:
            up = e.pop('_upload', None)
            if not up:
                continue
            content = git('cat-file', 'blob', up, binary=True)
            got = gh_api('%s/git/blobs' % api, 'POST',
                         {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})['sha']
            if got != up:
                raise Fail('blob SHA 불일치 %s: %s ≠ %s' % (e['path'], got, up))

        # 2) tree
        payload = {'tree': entries}
        if base_tree:
            payload['base_tree'] = base_tree
        got = gh_api('%s/git/trees' % api, 'POST', payload)['sha']
        if got != c['tree']:
            raise Fail('tree SHA 불일치: %s ≠ %s' % (got, c['tree']))

        # 3) commit — 네 값이 정확하면 SHA 가 로컬과 같아진다.
        got = gh_api('%s/git/commits' % api, 'POST', {
            'message': c['message'], 'tree': c['tree'], 'parents': c['parents'],
            'author': c['author'], 'committer': c['committer'],
        })['sha']
        if got != sha:
            raise Fail('커밋 SHA 불일치: %s ≠ %s\n'
                       '(원본과 다른 커밋이 만들어졌다. ref 는 갱신하지 않았다.)' % (got, sha))
        print('       SHA 일치 확인')

    if a.dry_run:
        print('\n--dry-run: 아무것도 올리지 않았다.')
        return 0

    gh_api('%s/git/refs/heads/%s' % (api, branch), 'PATCH',
           {'sha': local_sha, 'force': False})
    print('\n%s → %s 로 갱신했다.' % (branch, local_sha[:7]))

    git('fetch', a.remote)
    after = git('rev-parse', '%s/%s' % (a.remote, branch)).strip()
    print('로컬 %s/%s = %s  %s' % (a.remote, branch, after[:7],
                                   '동기화 완료' if after == local_sha else '불일치'))
    return 0 if after == local_sha else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Fail as e:
        print('\n[실패] %s' % e, file=sys.stderr)
        sys.exit(1)
