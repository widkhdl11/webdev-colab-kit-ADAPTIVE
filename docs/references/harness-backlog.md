# 하네스 백로그 — 보류된 업그레이드 (트리거로 재검토)

지금은 값싸게(프로즈로) 두고, **무엇이 관찰되면 승격할지**를 트리거로 적어둔다.
잊지 않기 위한 장치: retro가 이 목록의 트리거 충족 여부를 훑고(②), briefing이 미결 건수를 띄운다(③).

- 미결 항목은 `- [ ]`, 승격·반영되면 `- [x]` 로 바꾸고 아래 "졸업"으로 옮긴다.
- 형식: 결정(지금은 무엇을) · 보류 이유 · **승격 트리거**(무엇이 관찰되면) · 근거.

## 미결 (보류 중)

- [ ] **모델링 체크리스트 → 게이트 강제 승격** (2026-07-23)
  - 지금: 프로즈 라우팅 — kickoff(얕게 플래그)·/spec(깊게 INV)·CLAUDE.md 위험목록. 게이트 없음.
  - 보류 이유: 절차 무게 최소화. 프로즈로 먼저 굴려보고 실효를 본다.
  - **승격 트리거**: 플래그된(시변·파생) 엔티티가 스펙 없이 구현되는 게 눈에 띄면
    → `model/BEFORE_ENTITIES` 게이트 신설(승인된 스펙 없으면 entities 구현 차단, 기존 design/BEFORE_UI 패턴).
  - 근거: retro 사다리상 게이트(②, 100% 강제) > rules/CLAUDE 프로즈(③④). 프로즈가 무시되는 게 관찰되면 사다리를 올린다.

- [ ] **게이트 CROSS_SLICE에 app·shared 레이어 예외** (2026-08-02)
  - 지금: 게이트가 app·shared의 루트 파일도 각각 슬라이스로 봐 같은-레이어 import를 막음
    (canonical FSD는 app·shared 무슬라이스). signal에서 provider를 shared로 우회.
  - 보류 이유: 우회(shared로 내림)가 값싸고 1회뿐. 전역 게이트 변경은 전 프로젝트 영향.
  - **승격 트리거**: app/shared 슬라이스 예외가 2번째로 필요해지거나, app 레이어가 여러 파일
    협업이 정당히 필요할 때 → run-gates CROSS_SLICE에서 app·shared 레이어 예외(제안만, gates 보호).
  - 근거: docs/references/architectures/nextjs-fsd.md에 기록. signal에서 1회 관찰.

- [ ] **스택 판정을 `projectProfile()` 하나로 모으기 + 게이트 요약에 프로파일 표시** (2026-08-02)
  - 지금: 스택 판정이 `isNextProject()` 하나로 게이트 안에 흩어져 있다. 스택이 둘(vite-fsd·nextjs-fsd)
    뿐이라 이걸로 충분히 굴러감.
  - 보류 이유: 스택 2개에 판정 지점 1개. 지금 모으면 추상화가 사례보다 앞선다.
  - **승격 트리거**: 세 번째 스택이 들어오거나 스택별 분기 지점이 2개째가 되면
    → `projectProfile(projDir) → "nextjs-fsd" | "vite-fsd" | ...` 로 판정을 한 곳에 모으고,
    게이트 요약 줄에 판정 결과를 찍는다(`2개 프로젝트: signal=nextjs-fsd, wama=vite-fsd`).
    가정이 매 실행마다 눈에 보여야 오판정이 조용히 지나가지 않는다. (제안만, gates 보호)
  - 근거: docs/references/architectures/README.md "아직 안 한 것"에 기록.

- [ ] **status: approved-deferred 정식 status 도입 (합의됐으나 보류된 스펙)** (2026-08-02)
  - 지금: planned/ 파킹 관례를 spec 스킬에 명문화(구현 가능 단위로 하나씩 approved + docs/specs/planned/ draft).
    프로즈로 충분히 굴러감.
  - **승격 트리거**: planned/ 파킹이 혼란스럽거나(복귀 누락·중복) 2번째 프로젝트에서 또 필요해지면
    → graph 에 status: approved-deferred(합의됐으나 활성 계약 아님) 단계 정식 도입 검토. graph.mjs·graph-stop 은 보호.
  - 근거: 이번 1회. 지금은 관례+LESSONS 로 충분. (원 항목 "승인 단위" 는 spec 스킬 반영으로 졸업)

## 졸업 (반영됨 → LESSONS.md로)

- [x] **spec 템플릿 킷 정본화** (2026-08-02) → docs/references/spec-template.md 신설 + scaffold.mjs 복사 배선.
      LESSONS "spec 템플릿은 킷 정본으로".
- [x] **frontmatter status 오매칭 → 줄 시작 앵커** (2026-08-02) → gates/spec-coverage.mjs·graph-stop.mjs
      `^\s*status:\s*approved\b`(m). LESSONS "frontmatter status 판정은 줄 시작 앵커로".
- [x] **NO_INNERHTML 주석 오매칭 → 승격 안 함(보수 유지)** (2026-08-02) → 보안 게이트는 과차단이 안전.
      "위험 API는 코드·주석에 이름조차 안 쓴다" 규율로 대응. 위 LESSONS 항목에 근거 병기.
- [x] **스펙 승인 단위 = 구현 가능 단위로 하나씩 + planned/ 파킹** (2026-08-02) → spec SKILL "승인 단위·보류" 절.
      LESSONS "스펙은 구현 가능 단위로 하나씩 approved, 보류는 planned/". (approved-deferred 정식 status 는 위 미결로 잔류)
- [x] **run-gates.mjs `designApproved()` status 정규식 줄 앵커** (2026-08-02) → frontmatter 블록을 떼고
      `^\s*status:\s*approved\b`(m). 졸업 항목 "frontmatter status 판정은 줄 시작 앵커로" 의 빠진 사본을 메움.
      (반영 중 `existsSync` 단축평가가 깨져 파일 부재 시 ENOENT 로 죽는 상태를 거쳤고, 이후 수정됨)
- [x] **design/BEFORE_UI 트리거에 src/app 라우트 페이지 포함** (2026-08-02) → `isNextProject()`(next.config.* 존재)로
      판정한 Next 프로젝트에만 `src/app/**/page.*` 를 화면으로 봄. 라우트 화면 1장은 워킹 스켈레톤으로 예외.
      nextjs-fsd 프로파일 "게이트 함의 4" 갱신. LESSONS "게이트가 스택을 가정할 때는 판정하고 분기한다".
