# LESSONS.md — 승인된 교훈 (retro 절차로만 갱신 — 훅이 직접 수정을 차단함)

형식: 날짜 | 패턴 | 근거 | 반영 위치 (permissions / 게이트 / rules / CLAUDE.md)

## 2026-07-24 — RLS 격리는 구조 검증만으론 불충분

- 증상: 정책 표현식(academy_id=current_academy_id())이 스펙과 일치해 "검증 통과"로 봤으나, security definer
  함수의 `set search_path=public`이 pg_temp 섀도잉을 못 막아 격리가 실제로는 우회 가능했다.
- 교훈: (1) 모든 security definer 함수는 `set search_path=''` + 스키마 완전 한정. (2) RLS/인가는 정책이 "있다"가
  아니라 두 테넌트 세션으로 "새지 않는다"를 행동으로 증명해야 한다. (3) 프리미티브 함수(current_academy_id 등)는
  적대적 입력(temp table 섀도잉)까지 테스트.

## 2026-08-02 — 보호 파일 훅의 리다이렉트 탐지가 개행을 안 막아 오탐

- 증상: protect-files.mjs의 리다이렉트 대상 정규식 `[^'"|&;]*`이 개행을 제외하지 않아,
  `> 파일<개행>node gates/…`처럼 다음 줄의 gates/까지 삼켜 정당한 읽기/실행 명령을 차단.
- 교훈: bash 명령 파싱 정규식은 문장 경계(개행 포함)에서 멈춰야 한다. 문자셋에 `\n\r`을 넣어
  리다이렉트 대상이 줄을 안 넘게. 근거: 사인오프 데모 명령 1회 오탐(;·&&로 이으면 통과).
- 반영 위치: .claude/hooks/protect-files.mjs (게이트/훅 계열).

## 2026-08-02 — kickoff은 인터뷰보다 파일 착수가 먼저다

- 증상: 새 프로젝트 시작에서 PRODUCT.md를 만들기 전에 채팅으로 목적·기능을 먼저 물었다.
  사용자가 "플랜은 파일로 주고받으며 채우기로 했잖아"라고 교정.
- 교훈: 첫 행동은 "이름 + 한 줄 정의"를 받아 PRODUCT.md를 만드는 것. 그 뒤 모든 질문은
  파일 편집(변경분 표시)으로. 이름 모르면 '이름과 한 줄'만 물어 즉시 생성(인터뷰 아니라 파일 착수).
- 근거: 이번 세션 1회 — 구조적 빈칸(파일-우선이 순서로만 암시, 금지로 안 박혀 있었음).
- 반영 위치: .claude/skills/kickoff/SKILL.md 금지 절 (③ skill).

## 2026-08-02 — 기술 스택은 혼자 정해 설치하지 않는다 (문서로 합의)

- 증상: setup에서 scaffold가 만든 스택(Vite·바닐라)을 동의 없이 npm install. 프레임워크 선택이
  조용히 굳음. 사용자가 "동의 구하는 과정이 없다"고 지적.
- 교훈: 스캐폴딩·설치 전 tech-stack.md(draft)로 전제/선택을 분리 제시 → 사용자 수락(approved)
  후에만 설치. 전제(TS·FSD·빌드·테스트)만 안 묻는다. CLAUDE.md "구현 전 요약→동의"의 스택 버전.
- 근거: 1회 — 구조적 빈칸(setup에 스택 합의 게이트가 없었음).
- 반영 위치: .claude/skills/setup/SKILL.md 5단계 (③ skill).

## 2026-08-02 — 검증된 아키텍처는 프로파일로 학습·축적한다

- 증상: Next+FSD 구조를 프로젝트 로컬 문서에만 적어, 다음 프로젝트면 재발명해야 하는 상태.
  사용자가 "아키텍처가 하나씩 학습돼 쌓이면 좋겠다".
- 교훈: docs/references/architectures/에 프로파일 한 파일씩(구조·게이트 함의·기본 libs).
  setup이 여기서 고르게 제시, 새 검증 구조는 프로파일로 추가(재발명 금지).
- 근거: 1회 — 구조적 빈칸(재사용 지식 축적 자리가 없었음).
- 반영 위치: docs/references/architectures/{vite-fsd,nextjs-fsd}.md + setup SKILL.md 포인터 (③ docs+skill).

## 2026-08-02 — spec 템플릿은 킷 정본으로 (프로젝트 사본 재발명 금지)

- 증상: spec 스킬이 projects/<이름>/docs/specs/\_TEMPLATE.md 를 참조하는데 킷에 정본이 없어, wama 사본을
  빌려 씀. wama 없었으면 형식을 맨땅에 지어내 프로젝트마다 스펙 형식이 흔들릴 뻔.
- 교훈: 정본을 docs/references/spec-template.md 에 두고 스캐폴딩이 새 프로젝트로 복사. 스펙 쓰다 발견한
  빈칸은 정본을 두껍게 한다(modeling-checklist 와 같은 안내 문서 축). 프로젝트 쌓일수록 정본이 보강되는 게 정상.
- 근거: 1회 — 구조적 빈칸(정본·스캐폴딩 연결 부재). 반영 위치: docs/references/spec-template.md + scaffold.mjs + spec/retro SKILL (③ docs+skill).

## 2026-08-02 — frontmatter status 판정은 줄 시작 앵커로 (주석 토큰 오매칭)

- 증상: spec-coverage·graph-stop 이 `status:\s*approved` 로 frontmatter 전체를 봐, draft 스펙의 주석
  "…status: approved 로 바꾼다" 를 approved 로 오인 → 파킹 스펙의 INV 테스트를 요구(게이트 red).
  NO_INNERHTML 도 같은 오매칭 계열이나, 그건 보안 게이트라 보수적 유지가 옳아 승격 안 함(코드·주석에
  위험 API 이름조차 안 쓰는 규율 유지).
- 교훈: 구조화된 필드(frontmatter status)는 정규식을 줄 시작 앵커(`^\s*status:\s*approved\b`, m플래그)로
  값만 본다. 보안 게이트는 반대로 보수적(과차단)이 안전 — 두 종류를 구분.
- 근거: frontmatter 오매칭 1회(정규식 계열은 2회) — 구조적 버그. 반영 위치: gates/spec-coverage.mjs·graph-stop.mjs (② 게이트).

## 2026-08-02 — 스펙은 구현 가능 단위로 하나씩 approved, 보류는 planned/

- 증상: 인프라(Supabase) 의존 스펙과 오프라인 가능 스펙을 한꺼번에 approved → spec-coverage 가 두 스펙의
  INV 전부에 테스트를 요구(all-or-nothing), Supabase 없이 못 닫는 의무 발생. 게다가 spec 노드가 dirty 면
  하류 해시가 null 이 돼 완성된 슬라이스(content-safety)의 리뷰 사인오프조차 막힘.
- 교훈: 구현 가능한 단위로 쪼개 준비된 것부터 하나씩 approved. 합의됐으나 미준비인 스펙은 docs/specs/planned/
  에 draft 로 파킹(spec 글롭 비재귀라 안 막음), 준비 시 docs/specs/ 로 옮기고 approved.
- 근거: 1회 — 구조적 빈칸("합의됐으나 보류" 상태가 그래프에 없음). 반영 위치: .claude/skills/spec/SKILL.md
  "승인 단위·보류" 절 (③ skill). 미래: status: approved-deferred 정식 도입은 백로그(2회 관찰 시 승격).

## 2026-08-02 — 서브에이전트 tools 화이트리스트는 MCP 도구를 자동으로 물려주지 않는다

- 증상: style-scout 은 "Playwright MCP 연결 시에만 위임" 이 전제인 에이전트인데 tools 가
  `Read, Glob, Grep` 뿐이라, MCP 를 등록하고 재시작해도 브라우저를 못 엶. 정찰을 본체가 대신 수행 —
  에이전트가 존재만 하고 일을 못 하는데, 위임해보기 전에는 안 드러남.
- 교훈: 역할이 성립하는 데 필요한 도구를 tools 에 다 적는다(최소셋 ≠ 적을수록 좋음). MCP 는
  `mcp__<서버>__<도구>` 풀네임으로 명시해야 하고, 부모 세션 연결은 상속되지 않는다. description 에
  전제를 쓰는 것과 실제 권한을 주는 것은 별개 — 전제만 쓰면 빈 껍데기가 된다. 본문에 "도구가 안 보이면
  시도하지 말고 미연결로 보고" 를 넣어 실패를 조용하지 않게 만든다. tools 는 화이트리스트라
  금지 목록은 적을 필요가 없고, 허용 도구의 사용 범위는 본문 산문으로 좁힌다.
- 근거: 1회 — 구조적 빈칸(선언과 권한의 불일치). 반영 위치: .claude/skills/setup/SKILL.md 생성 판정 기준
  - .claude/agents/style-scout.md (③ skill+에이전트).

## 2026-08-02 — 시안은 대비를 실측해야 한다 (안 재면 미달인 채로 승인된다)

- 증상: 레퍼런스에서 가져온 메타색이 우리 카드 위에서 2.95:1, 이후 "더 흐리게" 요청을 반영하다
  태그 칩이 4.23:1. 둘 다 눈으로는 멀쩡해 보였고 본체가 computed style 로 훑어서야 드러남.
  절차에 검증 자리가 없어 안 쟀으면 그대로 승인될 뻔했다.
- 교훈: 시안 제출 전에 본체가 브라우저로 열어 전 요소 대비를 실측한다(drafter 보고를 신뢰하지 않는다).
  레퍼런스 색은 배경이 바뀌면 그대로 미달되고, "흐릿하게" 류 요청은 곧장 4.5:1 하한에 부딪힌다 —
  그때는 색이 아니라 굵기·부피 같은 다른 수단으로 푼다. 실측값은 design-rules.md 에 남겨
  다음 화면이 하한을 물려받게 한다. Playwright 는 file: 을 막으므로 http 로 서빙해야 잰다.
- 근거: 2회(메타색·태그칩) — 구조적 빈칸(검증 국면 부재). 반영 위치: .claude/rules/design-drafting.md
  시안 루프 3단계 + scripts/preview.mjs 신설 (③ rules+도구).

## 2026-08-02 — 게이트가 스택을 가정할 때는, 숨기지 말고 판정하고 분기한다

- 증상: design/BEFORE_UI 가 "화면 = src/pages·src/widgets" 가정을 코드에 숨긴 채 박아둠. Vite 만
  있을 땐 맞았지만 Next(App Router) 를 들이자 화면이 src/app 으로 옮겨가 **게이트가 조용히 통과**
  (막아야 할 걸 안 막는 상태). 고치면서 반대로 src/app 규칙을 전역에 걸 뻔했고, 그러면 Vite
  프로젝트가 근거 없는 예외("라우트 1장은 스켈레톤")를 뒤집어쓴다. 양쪽 다 에러가 안 나서 안 보인다.
- 교훈: 전역 게이트 + 스택마다 다른 사실(화면 위치·진입점·부트스트랩)이 만나는 자리가 가장 조용히
  깨진다. 스택별로 갈리는 규칙은 설정 파일 존재로 **먼저 판정하고 분기**한다(폴더 이름 추측 금지).
  분기 기본값은 "스택 전용 규칙 미적용" — 새 스택이 들어와도 잘못 막지는 않게. 그 대가로 생기는
  '못 막는 구멍'은 프로파일 문서의 게이트 함의에 반드시 적는다(안 적으면 다음 세션이 통과를
  안전으로 읽는다). 예외에는 어느 스택 사정인지 주석을 남긴다.
- 근거: 1회 — 구조적 빈칸(전역 판정 코드에 스택 가정이 암묵적으로 들어감). 새 스택이 추가될 때마다
  재발하는 종류. 반영 위치: docs/references/architectures/README.md 신설(정본+체크리스트)
  - .claude/skills/setup/SKILL.md 2곳 포인터 + nextjs-fsd.md 게이트 함의 4 (③ docs+skill).
