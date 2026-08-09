---
status: passed
basis: 7f29a477f0e5
---
# review — signal

> 이 마커가 review 노드를 clean으로 만든다. basis는 구현(src/**) 해시 — 구현이 바뀌면 불일치로
> review가 자동으로 낡아 재리뷰가 강제된다. (graph-stop 출력이 basis 값을 안내한다)

## 2026-08-02 — content-safety (원문 렌더 보안)

- **범위**: 승인된 스펙 content-safety.md (INV-D1~D5). 정식 경로 + 보안 표면(XSS)이라 리뷰어 3종 파견.
- **테스트**: 21개 green (sanitize 18 + article-body 3). spec-coverage 통과(D1~D5 커버).
- **리뷰어**: code-reviewer · security-reviewer · test-auditor.

### security-reviewer
- 결론: **실제 익스플로잇 가능한 XSS 없음.** sanitize 화이트리스트가 data:·프로토콜상대·svg·iframe·
  style속성·on*·srcset·mXSS 전부 차단. 렌더 sink는 ArticleBody 하나뿐이고 sanitize를 반드시 거침.
- 지적(MEDIUM): 보안 방벽인데 회귀 테스트가 얇음 → **반영**: 회귀 테스트 11개 추가(data:·프로토콜상대·
  iframe/form/object·svg>script·style속성·대문자/제어문자 스킴·on* 다양성·엣지).

### code-reviewer
- HIGH: INV-D5 둘째 절("로드 실패 레이아웃 붕괴 방지") 미구현·미검증 = 거짓 커버리지
  → **반영(스펙 분리)**: D5를 alt 처리로 한정, 레이아웃은 rules/ui-layers로 이관(보안 아닌 UI 사안).
- MEDIUM(메모이제이션)·LOW(모든 링크 target=_blank·엣지): 라이브 전이라 보류 / 엣지는 테스트로 일부 반영.

### test-auditor
- HIGH: INV-D3 테스트가 알리바이(sanitize가 parse보다 먼저라 위반 구현도 통과). 실제 강제는 게이트(NO_INNERHTML).
  → **반영**: 테스트를 게이트-강제 명시로 재라벨 + 파서 경로(엘리먼트 렌더)를 의미 있게 단언.
- MEDIUM: D2 우회벡터·D5 둘째 절 미검증 → 위 반영으로 해소.

### 미해결/이관
- ingestion-ranking 스펙은 docs/specs/planned/ 로 파킹(Supabase 의존). 활성화 시 별도 리뷰.
- 이미지 레이아웃 CSS는 상세 페이지 구현 시 ui-layers 규칙대로 강제(그때 ui-reviewer).

---

## 2026-08-08 — 피드 + 상세 (원문 치수 · 제목 구분)

- **범위**: 5·6세션의 되돌아가기를 마치고 남아 있던 결정 3건을 처리한 뒤의 사인오프.
  ① 원문 이미지 치수 허용(sanitize 화이트리스트 = 보안 표면) ② 페이지 제목/원문 제목을 색·레이아웃으로 가르기
  ③ INV-D6 강제 위치 문구를 실제 코드 위치로 정정. 정식 경로 → 리뷰어 4종.
- **테스트**: 118개 green (91 → 118). 게이트 통과(80파일) · tsc 클린 · 빌드 성공 ·
  서빙 번들과 렌더된 HTML 에서 CSS 규칙 확인.
- **리뷰어**: security-reviewer · ui-reviewer · code-reviewer · test-auditor (2차 아님, 이번 변경분 대상).

### 반영한 지적

- **code-reviewer HIGH — `aspect-ratio: auto 16/9` 가 원문 치수를 덮을 수 있다.** 작성자 선언과
  표현 힌트의 캐스케이드 우열에 결과가 걸리는데 브라우저가 없어 실측 불가.
  → 선택자를 `img:not([width]):not([height])` 로 갈라 **어느 해석이 맞든 결과가 같게** 만들었다.
- **code-reviewer MED — 내가 만든 회귀.** `src` 를 잃은 이미지가 자리 예약 + 배경색을 받아
  **영원히 안 채워지는 빈 상자**가 됐다. → `exclusiveFilter` 로 태그째 제거(스펙 S13 신설).
- **code-reviewer MED — 사실과 다른 주석 3곳** ("auto 가 이긴다" · "치수는 비율만 준다" ·
  "값까지 보는 속성은 이 둘뿐" — `allowedSchemes` 가 이미 href/src 값을 본다). → 전부 정정.
  6세션의 `url.ts` 주석 사건과 같은 계열이라 우선 처리했다.
- **test-auditor HIGH — 알리바이 2건.** `width="0" height="300"` 은 `300/0 = Infinity > 10` 이라
  **비율 가드가 대신 잡아** 정수 검사를 풀어도 통과했다. `0` 쌍(`0/0 = NaN`)을 추가해 정수 검사가
  유일한 방벽인 자리를 만들었다. `MAX_RATIO` 도 10→100 으로 바꿔도 전부 green 이었다 →
  경계 바로 밖(10.0025:1) 추가로 상수를 고정.
- **security/code — 절대 크기 미봉.** 비율 10:1 을 지키면서 자릿수만 키운 값이 통과했고,
  그걸 막던 건 sanitize 가 아니라 CSS `height:auto` 한 줄이었다. → `MAX_DIMENSION = 20000` 도입
  (`Number.isSafeInteger` 대체), 스펙 INV-D2 조건 4 로 명시. **사용자 승인 후 반영.**
- **ui-reviewer MED — 중첩 문맥에서 내밀기가 깨진다.** 인용문·목록·표 안의 `h1`·`h2` 는
  인용문 4px 선에 붙어 6px 실선처럼 보이거나 표 스크롤에 잘린다. → 중첩 문맥 리셋 4줄 +
  design-rules 에 "선은 최상위 제목에만" + 세 종류 세로선 표.
- **security MED — `.next/` 가 gitignore 되지 않았다.** Supabase 가 붙으면 `NEXT_PUBLIC_*` 가
  구워진 산출물이 커밋될 수 있다. → 루트 `.gitignore` 에 추가.
- 종단 검증 공백(파서 건너편), 경계 속성(`<td width>`), `/\bwidth\b/`(값 없는 속성) 등 LOW 반영.

### 변이로 확인한 것 (이 저장소에서 "테스트를 썼다"의 뜻)

| 변이 | 빨간불 |
| --- | --- |
| 정수 검사에 `0` 허용 | 1 |
| `MAX_RATIO` 10 → 100 | 1 |
| `MAX_DIMENSION` 20000 → 1e18 | 1 |
| `exclusiveFilter` 제거 | 1 |
| `reservableSize` 검증 통째 제거 | 13 |
| 화이트리스트에서 `width`/`height` 제거 | 3 |
| 메타 줄과 원문 사이에 요소 삽입 | 1 |

### 내가 깎은 지적

security-reviewer 가 극단 치수로 "9e15px 박스"가 된다고 했으나, 재계산하니 그 값은 비율이
정확히 10:1 이라 **예약 높이가 7040px 로 묶인다.** 지금 렌더에서 그 크기는 안 나온다.
다만 "방어가 sanitize 가 아니라 CSS 에 얹혀 있다"는 지적 자체는 맞아 위와 같이 반영했다.

### 미해결/이관

- **브라우저 실측이 두 세션 연속 없다** (Playwright 가 MCP·로컬 모두 부재). 이번 변경분은
  새 색 조합이 없어 계산으로 충분했고, 캐스케이드 문제는 실측이 필요 없는 CSS 로 우회했다.
  **색이 닿는 다음 변경 전에는 Playwright 연결을 먼저 풀 것.**
- `projects/signal/tsconfig.tsbuildinfo` 가 이미 추적 중이라 `.gitignore` 로는 안 빠진다
  (`git rm --cached` 필요 — 인덱스 변경이라 사용자 판단).
- 본문 링크의 스킴이 거부되면 `<a>` 껍데기가 남아 **눌러도 아무 일 없는 링크**로 보인다
  (`href` 만 제거됨). INV-D6 이 `sourceUrl` 에 대해 명시적으로 거부한 실패 모드와 같은 모양이라
  본문 링크에도 같은 처리를 하는 게 맞다. 이번 범위 밖이라 다음 작업으로.
- `dummy-body.ts` 의 HTML 문자열 보간은 Supabase 전환 시 더미와 함께 제거할 것.
