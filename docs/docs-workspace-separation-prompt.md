# 지시: 프로젝트 지식(docs)과 하네스 상태(workspace)의 경계 재정비

작업 전에 이 지시 전체와 킷 루트 CLAUDE.md를 읽고, 단계별 실행 계획과 영향받는 파일 목록을 먼저 보고한 뒤 진행하라.

## 배경과 목표

v2→v3 이전에서 두 가지 문제가 있었다: (1) 어떤 파일을 옮겨야 하는지 불명확했고, (2) 옮긴 파일에서 이전 하네스 전용 내용을 손으로 골라내 수정해야 했다. 원인은 프로젝트 지식과 하네스 운영 정보가 같은 파일에 섞여 있었기 때문이다.

이 작업의 완료 상태: **다음 하네스로의 이전이 `projects/<이름>/docs/` 폴더 복사만으로 끝난다.** `workspace/`는 통째로 버려도 프로젝트 지식이 소실되지 않는다.

## 분류 원칙 (모든 판정에 이 기준을 쓴다)

판별 질문: **"하네스를 다른 것으로 교체하면 이 정보는 (a) 표기만 바꿔 살아남는가, (b) 버리고 새 하네스가 다시 만드는가?"**
- (a) → `docs/` : 스펙 본문, 제품 결정, 설계 이유, 사람의 승인·보류 기록
- (b) → `workspace/` : dirty/hash, 게이트 판정값, surfaces, 진행 로그, 리뷰 사인

보조 질문(문장 단위 판정 시): 그 문장의 주어가 프로젝트(기능·데이터·화면)면 docs, 하네스(게이트·훅·에이전트·세션)면 workspace/킷 문서.

형식 규칙: 기계(게이트)가 값으로 파싱하는 정보는 구조화된 자리(결정 줄 형식, sidecar yml)에만 둔다. 산문 본문을 기계가 정규식으로 긁게 만들지 않는다.

## 대상과 순서

`projects/signal` 에 1~9단계를 완료한 뒤, 같은 패턴을 `projects/wama` 에 반복한다. 각 단계는 별도 커밋으로 나누고, 게이트가 깨진 상태로 다음 단계로 넘어가지 않는다.

## 작업 단계

### 1단계 — DECISIONS를 docs로 이동 + 스펙 라이프사이클 결정 대장 도입

1. `git mv projects/signal/workspace/DECISIONS.md projects/signal/docs/DECISIONS.md`
2. DECISIONS에 스펙 라이프사이클 결정 줄 형식을 도입한다:
   - `- YYYY-MM-DD approved: <spec-slug> — 근거 한 줄`
   - `- YYYY-MM-DD parked: <spec-slug> — 근거 한 줄`
   - draft는 기록하지 않는다(결정 줄이 없는 스펙 = draft). 같은 slug에 결정이 여러 개면 날짜가 가장 늦은 줄이 유효.
3. 현재 각 스펙 frontmatter의 status 값을 이 형식으로 소급 기록한다. 날짜는 frontmatter의 이력 주석에서 확보한다(예: content-selection은 2026-08-12 approved). 날짜를 확정할 수 없는 스펙은 목록으로 모아 사용자에게 확인받는다.

이후 이 결정 대장이 status의 유일한 원본이다. 결정 동사(approved/parked)를 확장할 필요가 생기면(예: 재작업을 위한 `reopened:`) 7단계의 docs-contract.md에 먼저 등재한 뒤 사용한다.

### 2단계 — BACKLOG 분리

`workspace/BACKLOG.md`의 제품 항목을 `docs/BACKLOG.md`로 이동한다. 하네스 개선 항목이 섞여 있으면 킷의 `docs/references/harness-backlog.md`로 보낸다. 분류 기준은 위 판별 질문.

### 3단계 — spec-state sidecar 생성

스펙별로 `projects/signal/workspace/spec-state/<spec-slug>.yml`을 만든다:

```yaml
spec: <spec-slug>          # docs/specs/<spec-slug>.md 를 가리킴. 파일명과 반드시 일치
surfaces: []               # 기존 frontmatter의 surfaces 값 이관
# surfaces 판단 메모(방벽 주석 등)는 여기 주석으로 함께 이관
```

sidecar에는 surfaces와 그 판단 메모만 둔다. status는 넣지 않는다 — status는 DECISIONS에서 파생하며, 파생값은 파일로 저장하지 않는다(저장하면 원본과 불일치 사고가 생긴다. signal DECISIONS의 앵커 패턴 원칙과 동일: 파생값은 저장하지 않고 조회 시 계산).

### 4단계 — spec frontmatter 축소

각 `docs/specs/*.md`의 frontmatter를 정리한다:

- **남긴다**: `feature:` 한 줄 (사람이 읽는 표시명. 기계는 파싱하지 않는다)
- **삭제**: `status:` (원본이 DECISIONS로 이동했으므로), `surfaces:` (sidecar로 이동했으므로)
- **킷 `docs/LESSONS.md`로 이동**: 주어가 하네스인 주석 전부 — 게이트 정규식 파싱 주의사항("status 값을 붙여 써라" 류), Stop 훅 사고 기록, 게이트 카운팅 방식 변경 이력 등. 정규식 파싱 주의사항은 5단계에서 해당 파싱 자체가 사라지므로 이동 시 "산문을 기계가 긁으면 숨은 스키마가 된다"는 교훈 형태로 기록한다.
- **유지**: 주어가 프로젝트인 이력 주석(스펙 신설 계기, 실측 결과, 스펙 간 분리 이유 등)은 frontmatter 주석 또는 본문에 그대로 둔다.

정본 템플릿 `docs/references/spec-template.md`와 각 프로젝트의 `docs/specs/_TEMPLATE.md`에도 동일하게 반영한다. surfaces 안내문은 sidecar 작성 안내로 교체한다.

### 5단계 — 게이트 읽기 경로 교체

1. `gates/lib/read-spec.mjs`를 신설한다:
   - `readSpec(slug)` → `{ feature, status, surfaces }`
   - status: `docs/DECISIONS.md`의 결정 줄을 파싱해 파생. 결정 줄 없으면 `draft`.
   - surfaces: `workspace/spec-state/<slug>.yml`에서. 파일이 없으면 `[]` (오류 아님 — 정상 초기 상태).
2. frontmatter를 직접 파싱하는 모든 지점(`spec-coverage.mjs`, `graph-stop.mjs`, risk-surface 판정 로직 등)을 이 함수 경유로 교체한다. `^\s*status:\s*approved` 류의 정규식을 제거한다.
3. INV 정의 앵커 카운팅(줄 맨 앞 `- INV-X:`)은 유지한다. 이것은 7단계 계약 문서에 등재되는 정식 규약이다.

### 6단계 — 경계 검사 추가 (run-gates에 편입)

- 검사 a: `docs/specs/*.md` frontmatter에 `feature` 외 필드가 있으면 실패
- 검사 b: `projects/*/docs/**` 안에 하네스 참조(`gates/`, `graph-stop`, `basis:`, `surfaces:`, `.claude/`, `workspace/` 경로)가 있으면 실패. 예외: `docs/DECISIONS.md`의 결정 줄 키워드 `approved:`/`parked:`
- 검사 c: `workspace/spec-state/<slug>.yml`에 대응하는 `docs/specs/<slug>.md`가 없으면 실패 (고아 sidecar)
- 검사 d: sidecar 안의 `spec:` 값이 자기 파일명과 다르면 실패
- 검사 e: DECISIONS 결정 줄의 slug에 대응하는 `docs/specs/<slug>.md`가 없으면 실패 (오타·스펙 개명 후 대장 미갱신을 잡는다. 오독은 항상 draft 방향으로 떨어지므로 검사 없이는 조용히 게이트만 막힌다)
- 스펙은 있는데 sidecar가 없는 것은 실패가 아니다.

### 7단계 — 기계 계약 문서 작성

킷의 `docs/references/docs-contract.md`를 신설한다. 내용: **하네스가 프로젝트 `docs/`에서 기계적으로 파싱하는 규약의 전체 목록.**

1. DECISIONS 결정 줄 형식 (`- YYYY-MM-DD approved|parked: <spec-slug> — 근거`)
2. INV 정의 앵커 (줄 맨 앞 `- INV-X:`)
3. 경로 규약 (`docs/specs/<spec-slug>.md`, `docs/PRODUCT.md`, `docs/DECISIONS.md`)
4. frontmatter는 `feature`만이며 기계는 파싱하지 않음

말미에 규칙 명시: "이 목록에 없는 파싱을 게이트·스크립트에 추가하려면 이 문서에 먼저 등재한다. 이 문서는 새 하네스로 이전할 때 docs 해석 명세로 함께 전달된다."

### 8단계 — 킷 루트 오염 정리

1. `.playwright-mcp/`: MCP 서버가 작업 디렉터리에 자동 생성하는 출력 폴더이므로 위치는 그대로 둔다. `.gitignore`에 `.playwright-mcp/` 추가 + `git rm -r --cached .playwright-mcp/`로 추적만 해제한다.
2. `.claude/rules/supabase-wama.md`: 내용(테넌시 불변식)은 wama의 프로젝트 지식이므로 `projects/wama/docs/` 쪽으로 이동한다(기존 `specs/auth-isolation.md`에 병합할지 신규 파일로 둘지는 내용 중복 여부를 보고 판단해 보고). 단, path-scoped rules 메커니즘이 `.claude/rules/` 위치를 요구해 이동이 규칙 적용을 깨뜨리는 경우, 먼저 그 사실을 확인해 사용자와 상의하고 대안(프로젝트 쪽 규칙 파일을 하네스가 로딩하는 방식)을 제시한다.

### 9단계 — CLAUDE.md 규칙 갱신

다음 규칙을 추가·수정한다:

- 문서 생성·수정 전 분류 2질문: ① 하네스를 바꿔도 표기만 바꿔 살아남는 정보인가(docs) / 버리고 다시 만드는 정보인가(workspace) ② 기계가 값으로 읽는가(결정 줄·sidecar) / 산문으로 참고하는가(본문)
- 읽기: 스펙의 status·surfaces는 readSpec 경유로만 얻는다
- 쓰기: 스펙 승인·보류는 DECISIONS에 결정 줄로 기록한다(frontmatter에 status를 쓰지 않는다). surfaces는 sidecar에 쓴다. 하네스 자신에 대한 사정(게이트 동작, 훅, 파싱 방식)을 프로젝트 docs에 적지 않는다 — 킷 LESSONS/문서에 적는다.
- docs 파싱 규약은 docs-contract.md 참조

### 10단계 — wama에 동일 적용

1~4단계와 6단계 검사 통과를 wama에 반복한다 (5·7·9단계는 킷 공통이라 재작업 없음).

## 주의사항

- 보호 파일(protect-files 대상 훅·게이트 등)은 킷 CLAUDE.md의 기존 규칙대로 처리한다: 적용 전에 실패하고 적용 후에 통과하는 검사 스크립트를 먼저 준비하고, 패치는 사용자가 직접 적용한다.
- **정보 삭제 금지, 이동만.** 행선지가 애매한 문장은 지우지 말고 목록으로 모아 사용자에게 판정을 요청한다.
- 기존 커밋 이력은 건드리지 않는다. 파일 이동은 `git mv`를 쓴다.
- **파일을 이동한 단계마다 옛 경로 참조를 정리한다.** 하네스 전체(gates/, scripts/, graph.mjs, .claude/, CLAUDE.md, 킷 docs, workspace 산문)에서 `workspace/DECISIONS.md`·`workspace/BACKLOG.md`를 grep해 새 경로로 갱신한다. 특히 graph.mjs·propagate.mjs가 노드 해시 입력으로 삼는 경로 목록에 이동 파일이 포함돼 있는지 확인하고, 포함돼 있으면 갱신 후 dirty 판정이 의도대로 동작하는지 확인한다.

## 완료 기준

1. 기존 게이트 전부 + 6단계 신규 검사 전부 통과
2. 이전 리허설 스크립트로 확인: 임시 디렉터리에 `projects/signal/docs/`만 복사했을 때 — (a) 그 안에서 검사 b의 하네스 참조 grep이 0건이고, (b) DECISIONS만 읽어 각 스펙의 status(approved/parked/draft)를 복원한 결과가 readSpec의 현재 결과와 일치한다
3. 위 리허설 결과를 사용자에게 보고
