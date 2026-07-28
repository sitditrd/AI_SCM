# 다른 PC에서 작업하는 방법 — 순차 절차

> 다른 PC에서 이 프로젝트를 이어서 개발하는 실제 절차를 단계별로 정리.
> 저장소 https://github.com/sitditrd/AI_SCM · 배포 https://sitditrd.github.io/AI_SCM/ · 최종 2026-07-28
> 전체 맥락·구조는 저장소 루트 `README.md`, 연계 원리는 `다른PC_연계_이어받기_가이드.md` 참조.

---

## 0단계 · 준비물 설치 (최초 1회)

| 항목 | 필수 | 용도 |
|---|---|---|
| **Git** | ✅ | https://git-scm.com |
| **GitHub 로그인** | ✅ | push 하려면 sitditrd 계정 인증 |
| Python 3 | 선택 | 수집기·로컬 백엔드(server.py) 실행 |
| Node.js | 선택 | React(app/) 작업 |
| VS Code + Claude Code 등 | 선택 | 에디터 |

git 사용자 설정 (최초 1회):
```bash
git config --global user.name "이름"
git config --global user.email "itt@twsc.co.kr"
```

---

## 1단계 · 저장소 가져오기

**처음이면** 클론:
```bash
git clone https://github.com/sitditrd/AI_SCM.git
cd AI_SCM
```

**이미 받아둔 PC면** 최신화 (⭐ 작업 시작 전 항상):
```bash
cd AI_SCM
git pull origin master
```

> push 시 로그인 창이 뜨면 sitditrd 계정으로 로그인하거나, **Personal Access Token**을 비밀번호 대신 입력.
> (GitHub → Settings → Developer settings → Personal access tokens)

---

## 2단계 · 잘 받아졌는지 확인

웹은 빌드 불필요 — `index.html`을 브라우저로 열면 동작.
백엔드가 필요한 기능(화물 통관 조회·경로 계산)을 로컬에서 쓰려면:
```bash
python server.py      # → http://localhost:8090
```

---

## 3단계 · 작업 → 커밋 → 자동 배포 (핵심 루프)

```bash
git pull origin master          # (1) 작업 전 항상 최신화
# (2) 파일 수정 (에디터/Claude Code)
git status                      # (3) 변경 확인
git add -A
git commit -m "무엇을 바꿨는지 한 줄"
git push origin master          # (4) 푸시 → 자동 배포
```

→ push하면 **GitHub Actions가 GitHub Pages에 자동 배포**.
- 진행/성공: 저장소 → **Actions** 탭 → 최근 실행 초록 체크
- 반영 확인: **https://sitditrd.github.io/AI_SCM/** (30초~2분 · `Ctrl+F5`)

---

## 4단계 · React 앱(app/) 이어갈 때만

```bash
cd app
npm install        # 최초 1회
npm run dev        # 개발 서버(핫리로드)
npm run build      # 배포용 빌드
```
완료: 선석배정·데이터현황(공통 DataGrid 재사용) / 남음: insight·vessel·cargo·route

---

## 5단계 · 수집기(스케줄러) 실행할 때만

```bash
pip install openpyxl requests
set SUPABASE_SERVICE_KEY=<service_role 키>     # Windows (Mac/Linux: export)
python scripts/collect_upload_berth.py          # 선석배정 수집·적재
python scripts/collect_portinsight_api.py       # PCI 지수 산출
```
→ 같은 Supabase(`kvmyiualdodcvreoqfin`)에 쓰므로 웹과 자동 연계.

---

## ⚠️ 꼭 지킬 것

| 주의 | 이유 |
|---|---|
| **작업 전 `git pull`** | 여러 PC 공동 사용 시 안 하면 충돌(conflict) |
| **저장소 public 유지** | private 전환 시 무료 계정은 사이트가 내려감(Pages 다운) |
| **push 후 Actions 초록 확인** | 배포 성공 여부 확인 |
| **막히면 `README.md`** | 저장소 홈의 README에 전체 맥락·트러블슈팅 |

---

## 충돌(conflict)이 났을 때

여러 PC에서 같은 파일을 고쳐 push가 거부되면:
```bash
git pull origin master          # 원격 변경 병합 시도
# 충돌 표시(<<<<<<< ======= >>>>>>>)가 뜨면 해당 파일을 열어 원하는 내용으로 정리
git add -A
git commit -m "merge: 충돌 해결"
git push origin master
```
> 예방: **항상 작업 시작 전 `git pull`**, 한 PC에서 작업이 끝나면 바로 push.

---

### 한 줄 요약
> **`git clone`(처음)/`git pull`(이후) → 수정 → `git commit` → `git push` → Actions 초록 확인 → 사이트 자동 반영.**

*TWL Control Tower · 태웅로직스 · itt@twsc.co.kr*
