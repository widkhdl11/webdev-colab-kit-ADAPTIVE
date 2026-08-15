// graph.mjs — 실행 의존성 그래프 (킷 공통·정적)
//
// 이 파일은 "무엇이 무엇에 의존하는지"만 선언한다. "다음에 어디로 갈지"는
// 어디에도 없다 — 재작업 범위는 dirty 전파에서 파생된다(Make/Bazel 모델).
//
//   전파 규칙(유일):  상류가 dirty → 그에 의존하는 하류 전부 dirty
//   실행:            dirty 노드를 위상정렬 순서로(상류부터) 재실행
//   clean:           단계 완료 게이트가 통과하면 그 노드의 dirty 해제
//
// 노드 상태는 넷이다: dirty · clean · rework · n/a.
//   rework = "한 번 clean 이었다가 취소된 것"(리뷰 거부·승인 철회·산출물 변경). dirty 의 하위 종류다 —
//   하류를 막는 것도, 프론티어에 뜨는 것도 dirty 와 똑같다. 다른 점은 하나뿐이다:
//   선행 조건형 게이트(아래 GATE_KIND)의 실패가 턴을 막지 않는다. 재승인은 턴을 끝내야 받을 수 있는데
//   그 게이트가 턴을 막으면, 게이트를 푸는 유일한 길이 게이트 때문에 닫힌다(2026-08-06·08-10·08-11 관찰 3회).
//   판별은 기록이 아니라 현재 상태로 한다 — clean 인 노드를 mark 하면 rework, 이미 dirty 면 dirty.
//   그래서 "아직 한 번도 승인 안 받은 것"은 rework 가 될 수 없고, 선행 게이트가 그대로 막는다.
//   n/a = "이번 작업에는 이 노드가 해당 없음" 이라는 사람/모델의 판단. 하류를 막지 않고
//   프론티어에도 안 뜬다(clean 과 같은 취급). 선언은 사유 한 줄이 있어야 한다:
//     node gates/graph-stop.mjs --na <노드> "<사유>"   /  되돌리기: --na-clear <노드>
//   n/a 는 판단이라 틀릴 수 있다. 그래서 세 가지 경우에 기계가 자동으로 취소한다:
//     (1) 그 노드의 산출물이 실제로 생기거나 바뀌면 (해시 변화 → dirty)
//     (2) 상류가 dirty 가 되면 (전파 — 판단의 전제가 바뀌었다)
//     (3) risk-surface 게이트가 위험 패턴을 잡으면 spec 의 n/a 는 즉시 dirty
//   생략 판단은 모델이 하고, 생략이 틀렸다는 감지는 기계가 한다.
//
// 노드는 자기 하류가 누구인지 모른다(depends_on = 상류만). 하류는 reverse로 파생.
// 런타임 상태(clean/dirty·hash)는 여기 없다 → projects/<이름>/workspace/HANDOFF.md
//
// ★ 이 객체는 '순수 리터럴'이다 — 함수·분기·목적지 필드가 없다.
//   라우팅 로직은 코드가 아니라 이 데이터(의존성 선언)에만 존재한다.
//   (원래 graph.yaml 이었으나, 루트가 순수 node·무-의존성이라 네이티브 파싱을 위해 .mjs 리터럴로 둔다.)
//
// produces 경로는 프로젝트 공통이므로 projects/<이름>/ 기준 상대경로다.
// clean_when 은 전부 '이미 있는' 게이트/프론트매터를 가리킨다(새 판정 로직 없음):
//   - gate: [...]     → gates/run-gates.mjs 의 해당 카테고리 에러가 produces 에 0건
//   - frontmatter:... → 산출물 프론트매터 조건
//   - exists_nonempty → 파일 존재 + 비어있지 않음

export const GRAPH = {
  // ── 루트: 무엇을 만들지의 정의. 여기가 바뀌면 전부 재작업 ──
  product: {
    depends_on: [],
    produces: ["docs/PRODUCT.md"],
    clean_when: { exists_nonempty: "docs/PRODUCT.md" },
  },

  // ── 불변식 스펙(위험 기능). product 에서만 파생 (design 과 직교) ──
  spec: {
    depends_on: ["product"],
    produces: ["docs/specs/*.md"],
    clean_when: {
      frontmatter: { path: "docs/specs/*.md", require: "status: approved" },
      gate: ["spec-coverage"], // approved INV 마다 참조 테스트 존재
    },
  },

  // ── 시각/데이터 설계. product 에서만 파생 (spec 과 직교). ──
  //    자체 산출물 없는 '집계 노드' — 두 자식이 모두 clean 이라야 design clean.
  design: {
    depends_on: ["product"],
    parallel: {
      "page-designer": {
        produces: ["docs/design/design-rules.md", "docs/design/mockups/*.html"],
        clean_when: {
          // ↓ 이 신호를 기존 design/BEFORE_UI 게이트가 이미 읽어 UI 구현을 허용한다
          frontmatter: { path: "docs/design/design-rules.md", require: "status: approved" },
        },
      },
      "schema-designer": {
        produces: ["supabase/migrations/*.sql", "src/entities/*/model.ts"],
        clean_when: { gate: ["fsd", "security"] },
      },
    },
  },

  // ── 구현. spec 과 design 이 여기서 합류한다 ──
  implement: {
    depends_on: ["spec", "design"],
    produces: ["src/**"],
    // clean_when: { gate: ["fsd", "security", "tsc", "design"] }, // design = BEFORE_UI
    // tsc-notrun = 타입 검사가 아예 안 돌았음(tsconfig 없음). '에러 0건'이 '검사했다'를 뜻하지 않는다.
    clean_when: { gate: ["fsd", "security", "tsc", "tsc-notrun", "design"] }, // design = BEFORE_UI
  },

  // ── 얕은 검증. 결정론 게이트 → 매 턴 자동 clean(빠른 루프). ──
  //    실패 시 분류기가 원인 노드를 mark(라우팅 아님).
  qa: {
    depends_on: ["implement"],
    produces: ["src/**/*.test.ts", "tests/**"],
    // clean_when: { gate: ["test", "spec-coverage"] },
    // test-notrun = 테스트가 아예 안 돌았음(scripts.test 없음). 테스트 0개는 '전부 통과'로 보인다.
    clean_when: { gate: ["test", "test-notrun", "spec-coverage"] },

    // on_fail_diagnose 는 '어디로 갈지'가 아니라 '무엇을 진단할지'다. 분류기(qa-classifier)는
    // 실패(qa 테스트든 review 리뷰어든)를 spec/design/impl 레벨로 귀속해 해당 노드에 mark 만 찍는다.
    // 재작업 경로는 그 mark 에서 전파로 파생된다 — 여기엔 목적지가 없다.
    on_fail_diagnose: "qa-classifier",
  },

  // ── 깊은 리뷰. 비결정론(리뷰어 판단) → 자동 게이트 불가. ──
  //    사인오프 마커로 clean: 리뷰어가 돌아 통과하면 basis(구현 해시)와 함께 기록.
  //    구현이 바뀌면 basis 불일치 → 자동으로 낡음(dirty) → 재리뷰 강제.
  //    개발 중엔 dirty로 '리뷰 빚'을 프론티어에 표시, 리뷰어는 기능-완성 마일스톤에만 파견.
  review: {
    depends_on: ["qa"],
    produces: ["workspace/review.md"],
    // 리뷰는 깊이(리뷰어 구성)만 조절 대상이지 존재 자체는 생략 불가 → n/a 선언을 데이터로 막는다.
    // (금지가 코드 분기가 아니라 그래프 선언에 있어야 라우팅 로직이 데이터에만 남는다)
    na_allowed: false,
    // 사인오프에 '누가 리뷰했는가'를 요구한다. basis 해시만 검사하던 때는 graph-stop 이 화면에 찍어준
    // 해시를 그대로 적기만 해도 통과했다 — 리뷰를 돌린 것과 두 줄을 적은 것이 구분되지 않았다.
    // require_reviewer: 리뷰어 → 그 리뷰어를 필수로 만드는 위험 표면 목록.
    //   risk-surface 게이트가 코드에서 그 표면을 감지했는데 reviewers 에 없으면 clean 을 안 내린다.
    //   기계가 표면을 볼 수 있는 것만 여기 넣는다 — code/ui/test-auditor 파견은 판단으로 남긴다.
    clean_when: {
      signoff: {
        marker: "workspace/review.md",
        require: "status: passed",
        basis_of: "implement",
        reviewers_field: "reviewers",
        require_reviewer: { "security-reviewer": ["auth", "payment", "authz"] },
      },
    },
  },

  // ── 배포. review 에 의존 → review dirty 면 배포 차단(강제 마감). ──
  //    사인오프 마커: 실제 배포 성공 시 basis 와 함께 기록.
  deploy: {
    depends_on: ["review"],
    produces: ["workspace/deploy.md"],
    clean_when: { signoff: { marker: "workspace/deploy.md", require: "status: deployed", basis_of: "implement" } },
  },
};

// ── 게이트 카테고리의 성격 — Stop 훅이 턴을 막을지 판정할 때만 쓴다 ──────────
//
// 강제력은 두 겹이다: ① 노드가 dirty 인 동안 하류가 못 간다(그래프) ② 게이트 실패면 턴이 안 끝난다(Stop 훅).
// 문제는 ②가 ①을 푸는 길까지 막을 때다 — 사용자 승인이나 다음 세션의 구현으로만 풀리는 실패는
// 턴을 끝내야 도달하는데, 그동안 질문도 wrap-up 도 차단 메시지에 걸린다.
//
//   completion   = "끝내기 전에 있어야 한다"(예: approved 스펙의 INV 테스트).
//                  owner 가 dirty/rework 면 하류가 이미 전부 막혀 있다 — ②는 중복이라 안내로 낮춘다.
//   precondition = "시작하기 전에 승인받아야 한다"(예: design-rules approved 전 UI 금지).
//                  하류 차단은 노드 상태일 뿐 파일 쓰기를 막지 못한다 — ②가 유일한 저지선이라 유지한다.
//                  단 owner 가 rework 면 낮춘다(재승인을 받으려면 턴을 끝내야 한다).
//
// 여기 없는 카테고리(fsd·security·tsc·test·risk-surface)는 어디서 나든 무조건 차단한다.
// 그것들은 그래프가 처방한 상태에서 비롯된 게 아니라 아무 데서나 나는 위반이다.
//
// owner = 그 게이트가 검사하는 승인·산출물을 소유한 노드. clean_when.gate 를 가진 노드가 아니다 —
//   design/BEFORE_UI 는 implement.clean_when 에 걸려 있지만 원인은 design 의 승인 상태다.

export const GATE_KIND = {
  "spec-coverage": { kind: "completion", owner: "spec" },
  design: { kind: "precondition", owner: "design" },
  // 검사가 안 돌았다는 신고. 노드는 막되(clean_when 에 들어 있다) 턴은 막지 않는다 —
  // 설정을 붙이든 n/a 로 선언하든 그건 사용자 결정이고, 물어보려면 턴이 끝나야 한다.
  "tsc-notrun": { kind: "completion", owner: "implement" },
  "test-notrun": { kind: "completion", owner: "qa" },
};

