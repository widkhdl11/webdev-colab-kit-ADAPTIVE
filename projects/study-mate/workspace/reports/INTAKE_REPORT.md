# 들여오기 리포트 — study-mate (2026-09-04)

소스: `C:\Users\PC\Desktop\dev\study-mate` (읽기만 했다 — 파일을 고치거나 옮기거나 지우지 않았다)
산출물: `projects/study-mate/docs/` + `projects/study-mate/workspace/`
들여온 사이클: `signal2-20260904-2`

---

## 1. 질문 목록 — 코드가 답할 수 없는 것

목록 전체는 여기 있고, 이 중 **노드를 막는 둘**만 `workspace/PENDING.md` 에 올라가 있다.
나머지는 답이 없어도 진행이 멈추지 않는다.

### 노드를 막는 것

- **Q1. 들여온 스펙 셋을 확인하고 승인할 것인가** (P1 · `spec` 을 막는다)
  스펙 셋은 코드에서 역산한 관찰이다. 불변식 하나하나가 "그래야 한다"인지 "지금 그럴 뿐"인지는
  사람만 안다. 특히 INV-Z5(데이터베이스 수준 강제)와 INV-P6(모집 상태의 주인)는 지금
  **지켜지지 않는다고 스펙이 스스로 적고 있다.**
- **Q2. 종이·잉크·형광펜 방향이 지금도 유효한가** (P2 · `design` 을 막는다)
  기존 문서에 사람이 써 둔 선언을 옮겼다. 그대로 간다면 승인만 하면 되고, 바꿀 생각이면
  화면 작업 전에 정해야 한다.

### 막지 않는 것

- **Q3. 공개 테이블에 행 수준 접근 정책이 없는 것은 의도인가.**
  마이그레이션 스냅샷의 정책 11개는 전부 파일 저장소에 대한 것이고, 스터디·참여자·모집글·
  채팅·프로필 테이블에는 하나도 없다. 앱은 서버에서도 공개 키를 쓴다. 이 둘이 겹치면
  애플리케이션의 호스트 판정을 우회하는 경로가 열려 있을 수 있다.
  스냅샷이 지금 운영 중인 데이터베이스와 같은지도 함께 확인해야 한다.
- **Q4. 파일 저장소의 삭제 정책이 의도인가.**
  `for delete` · `to public` · 조건 `true` 인 정책이 하나 있다. 이름은 "Enable read access for
  all users" 인데 실제 동작은 삭제 허용이라, 이름과 동작이 어긋나 있다.
- **Q5. AI 제공자는 무엇이 맞나.** 코드는 Google Gemini(`gemini-2.5-flash-lite`)를 부르고,
  기존 문서는 OpenAI GPT-3.5-turbo 라고 적고 있다. `openai` 패키지는 의존성에만 남아 있다.
  코드가 맞다면 문서와 의존성을 정리하면 된다.
- **Q6. 세션 판정 함수는 어느 쪽이 의도인가.** 코드의 주석은 "`getUser()` 를 써야 토큰이
  검증된다"고 말하는데 실제 호출은 클레임을 읽는 다른 함수다. 주석이 낡은 것인지, 호출을
  되돌려야 하는 것인지.
- **Q7. 모집 상태 값의 주인을 누구로 할 것인가.** 데이터베이스 트리거와 도메인 규칙이 같은
  값을 각자 관리한다. 기존 문서도 "정리 대상"이라고만 적어 두었다. 트리거를 그냥 빼면
  아무도 그 값을 바꾸지 않게 된다.
- **Q8. 포인트 기능을 살릴 것인가 지울 것인가.** 컬럼·이력 테이블·트리거는 남아 있고
  적립 로직은 없으며 화면 노출은 이미 제거됐다.
- **Q9. 다음에 무엇을 만들 것인가.** 제품 정의의 그 칸은 비어 있다 — 코드는 만들어진 것만
  말하고 만들 것은 말하지 않는다.
- **Q10. 코드를 언제 이 저장소로 옮길 것인가.** 옮기려면 선행 장치가 하나 필요하다(아래 4절).
  옮길 때 계층 폴더의 위치도 달라진다 — 지금은 저장소 루트에 계층 폴더가 있고, 이 하네스는
  프로젝트마다 `src/` 아래를 본다.
- **Q11. 원본 저장소의 낡은 문서를 고칠 것인가.** 폴더 설명과 AI 제공자 표기가 실제와 다르다.
  들여오기는 원본을 읽기만 했으므로 아무것도 고치지 않았다.

---

## 2. 무엇을 어디서 추출했나

| 만든 것 | 읽은 자리 |
|---|---|
| `docs/PRODUCT.md` | `PRODUCT.md` · `README.md` · 각 기능 폴더(`features/*`) 목록 |
| `docs/tech-stack.md` | `package.json` · `next.config.ts` · `tsconfig.json` · `features/ai-recommend/api/geminiAgentAction.ts` · `ARCHITECTURE.md` |
| `docs/specs/auth-session.md` | `proxy.ts` · `shared/api/supabase/proxy.ts` · `features/*/api/*Action.ts` |
| `docs/specs/write-authorization.md` | `supabase/migrations/20260614053323_remote_schema.sql`(정책 11건) · `features/study/delete/api/deleteStudyAction.ts` · `features/participant/accept/api/acceptParticipantAction.ts` |
| `docs/specs/participation-capacity.md` | `docs/db-schema.md`(트리거·제약 표) · `supabase/migrations/*.sql` |
| `docs/design/design-rules.md` | `DESIGN.md` (사람이 써 둔 선언을 옮김) |
| `docs/DECISIONS.md` | 커밋 메시지 본문 — `c145898` · `eddb5ad` · `5bb9ff9` · `28de38e` · `1ed0841` · `e96b74d` · `ARCHITECTURE.md` 1절 |
| `docs/BACKLOG.md` | `docs/ai-upgrade-plan.md` · `docs/qa-checklist.md` · `docs/entities-cleanup-checklist.md` · `DESIGN.md` 마이그레이션 절 |

읽었지만 옮기지 않은 것: `PROJECT_PORTFOLIO.md`(취업용 서술), `docs/structure-guide.md` ·
`docs/type-layers.md`(구현 지침이라 요약만 기술 스택에 반영), `docs/drawio` · `docs/design`(도해).

**출처 경로가 이 파일에만 있는 이유**: 프로젝트 문서 폴더는 하네스를 바꿔도 그대로 넘어가는
자리이고, 소스 트리의 경로는 그때 새로 만들어지는 과정 기록이다. 게다가 이 경로들을 문서
폴더에 적으면 이전 리허설이 그것을 하네스 참조로 잡아 다른 프로젝트 검사까지 같이 실패한다.

---

## 3. 지표

| | 값 |
|---|---|
| `[추정 — 확인 필요]` 남은 항목 | **20건** (판정 검사가 센 값) |
| 스펙 | 3건 — 전부 `status: draft` · `surfaces: []` |
| 질문 | 11건 (그중 노드를 막는 것 2건) |
| 문서 파일 | 8개 |
| 소스 커밋 이력 | 128커밋 (읽기만 함) |

---

## 4. 게이트 현황 — 이 프로젝트는 아직 검사 시야 밖이다

코드를 옮기지 않았으므로 이 프로젝트에는 산출물 폴더가 없고, **정적 검사가 이 프로젝트를
한 번도 열지 않는다.** 그 결과:

- 다른 프로젝트 작업이 이 프로젝트 때문에 막히지 않는다. 이것이 코드를 안 옮긴 이유다.
- 반대로 **들여온 코드의 위험한 자리(인증·인가·동시성)를 지금 아무 검사도 보지 않는다.**
  스펙 셋에 관찰로 적어 두었지만, 적어 둔 것은 검사가 아니다.

코드를 옮기려면 "이 프로젝트는 아직 검사 시야 밖"이라고 **선언하고 그 선언이 만료되는** 장치가
먼저 있어야 한다. 없이 옮기면 첫 편집에서 저장소 전체의 턴이 막힌다. 그 장치는 킷 백로그에
승격 트리거와 함께 등재돼 있고, 트리거가 바로 "코드를 옮기려 할 때"다.

그래프 상태는 이렇게 시작한다: 제품 정의가 있으므로 `product` 는 통과, 스펙과 시각 기준이
승인 전이라 `spec` 과 `design` 이 프론티어에 뜨고, 그 아래는 전부 막혀 있다.
