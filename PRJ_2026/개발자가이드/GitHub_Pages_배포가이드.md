# GitHub Pages 무료 배포 가이드

> 정적 웹사이트(HTML·CSS·JS)를 **빌드 한도·비용 없이** GitHub Pages로 배포하는 방법.
> 공개 저장소는 완전 무료이며, `git push` 할 때마다 자동 배포됩니다.
> 작성 2026-07-28 · 실제 적용 사례: TWL Control Tower 포털(https://sitditrd.github.io/AI_SCM/)

---

## 1. 언제 쓰나

- **Netlify·Vercel 무료 빌드 크레딧이 소진**되어 배포가 일시중지될 때의 대체·병행 경로
- 별도 빌드가 필요 없는 정적 사이트(HTML/CSS/JS, 또는 빌드 산출물)
- 공개 저장소면 **빌드 시간·대역폭 제한이 사실상 없음**(비공개는 유료 플랜 필요)

## 2. 두 가지 방법

| 방법 | 난이도 | 특징 |
|---|---|---|
| **A. 브랜치에서 직접** | 쉬움 | 저장소 루트(또는 `/docs`)를 그대로 게시. 설정만 하면 끝 |
| **B. GitHub Actions 워크플로** | 보통 | **원하는 파일만 골라 게시**·빌드 단계 삽입 가능(권장) |

프로젝트에 문서·소스 등 웹과 무관한 파일이 섞여 있으면 **방법 B**가 깔끔합니다.

---

## 3. 방법 A — 브랜치에서 직접 배포 (가장 간단)

1. 저장소 → **Settings → Pages**
2. **Build and deployment → Source**: `Deploy from a branch`
3. **Branch**: `main`(또는 `master`) 선택, 폴더는 `/ (root)` 또는 `/docs`
4. **Save** → 1~2분 뒤 `https://<사용자명>.github.io/<저장소명>/` 에 게시

> 루트를 게시하면 저장소의 모든 파일이 웹에 노출됩니다(공개 저장소는 어차피 공개지만, 문서·소스를 감추고 싶으면 방법 B 권장).

---

## 4. 방법 B — GitHub Actions 워크플로 (권장)

### 4-1. 최초 1회: Pages 활성화

1. 저장소 → **Settings → Pages**
2. **Build and deployment → Source**: **`GitHub Actions`** 선택
   - ※ 이 최초 활성화는 **저장소 소유자가 직접** 해야 합니다(워크플로가 자동으로 켤 수 없음)

### 4-2. 워크플로 파일 추가

`.github/workflows/deploy-pages.yml` 생성:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]        # 저장소 기본 브랜치명에 맞추기 (master면 master)
  workflow_dispatch:         # 수동 실행도 허용

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # 웹 파일만 _site로 수집 (문서·소스 제외). 정적 사이트가 루트에 있으면 path: '.' 로 대체 가능
      - name: 게시 파일 수집
        run: |
          mkdir -p _site
          cp *.html _site/ 2>/dev/null || true
          for d in css js assets routes; do
            if [ -d "$d" ]; then cp -r "$d" _site/; fi
          done
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

> **프레임워크(React/Vite 등) 빌드가 필요하면** `build` 잡에 Node 설치 + `npm ci && npm run build` 를 넣고,
> `upload-pages-artifact` 의 `path` 를 빌드 산출물 폴더(`dist`)로 지정하세요.

### 4-3. push → 자동 배포

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "GitHub Pages 배포 워크플로"
git push
```

이후 push마다 **Actions** 탭에서 배포가 돌고, 성공하면 `https://<사용자명>.github.io/<저장소명>/` 에 반영됩니다.

---

## 5. 확인 방법

- 저장소 **Actions** 탭 → 최근 실행이 초록 체크(success)인지 확인
- **Settings → Pages** 상단에 `Your site is live at …` URL 표시
- 브라우저에서 URL 접속 (반영은 배포 후 30초~2분)

---

## 6. 자주 나는 문제 (트러블슈팅)

| 증상 | 원인 · 해결 |
|---|---|
| Actions 실행이 **`configure-pages` 스텝에서 실패** | Pages가 아직 비활성. **4-1**의 최초 활성화(Source: GitHub Actions)를 먼저 하기. 워크플로에서 `enablement: true` 자동 활성화는 대체로 실패하므로 넣지 말 것 |
| 배포는 됐는데 **CSS·이미지가 깨짐** | 절대경로(`/style.css`) 사용 시 하위경로(`/저장소명/`)에서 깨짐. **상대경로**(`css/style.css`, `./assets/…`)로 작성. Vite는 `base: './'` 설정 |
| **404 Site not found** | Pages 활성화 직후 첫 배포 전이거나, 워크플로 실패. Actions 로그 확인 |
| 기존 호스팅(Netlify 등)이 **크레딧 소진으로 배포 일시중지** | "production deploys are paused" 배너 = 무료 빌드 한도 소진. 다음 결제 주기에 자동 재개되거나, **본 GitHub Pages로 무료 대체** |
| 사이트 주소를 **커스텀 도메인**으로 | Settings → Pages → Custom domain 에 도메인 입력 + DNS(CNAME) 설정 |

---

## 7. URL 구조 요약

```
https://<사용자명>.github.io/<저장소명>/          ← 프로젝트 사이트 (하위경로)
https://<사용자명>.github.io/                     ← <사용자명>.github.io 저장소는 루트 도메인
```

- 하위경로로 게시되므로 **모든 내부 링크·자산은 상대경로**로 두는 것이 안전합니다.
- 백엔드 API(서버 코드)는 정적 호스팅에서 동작하지 않습니다 — 외부 API 직접 호출 또는 서버리스 함수로 분리하세요.

---

*문의: itt@twsc.co.kr · 본 가이드는 실제 배포 경험(TWL Control Tower)을 바탕으로 작성되었습니다.*
