// graph.mjs — 실행 의존성 그래프 (킷 공통·정적)
//
// 이 파일은 "무엇이 무엇에 의존하는지"만 선언한다. "다음에 어디로 갈지"는
// 어디에도 없다 — 재작업 범위는 dirty 전파에서 파생된다(Make/Bazel 모델).
//
//   전파 규칙(유일):  상류가 dirty → 그에 의존하는 하류 전부 dirty
//   실행:            dirty 노드를 위상정렬 순서로(상류부터) 재실행
//   clean:           단계 완료 게이트가 통과하면 그 노드의 dirty 해제
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
    clean_when: { gate: ["fsd", "security", "tsc", "design"] }, // design = BEFORE_UI
  },

  // ── 얕은 검증. 결정론 게이트 → 매 턴 자동 clean(빠른 루프). ──
  //    실패 시 분류기가 원인 노드를 mark(라우팅 아님).
  qa: {
    depends_on: ["implement"],
    produces: ["src/**/*.test.ts", "tests/**"],
    clean_when: { gate: ["test", "spec-coverage"] },
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
    clean_when: { signoff: { marker: "workspace/review.md", require: "status: passed", basis_of: "implement" } },
  },

  // ── 배포. review 에 의존 → review dirty 면 배포 차단(강제 마감). ──
  //    사인오프 마커: 실제 배포 성공 시 basis 와 함께 기록.
  deploy: {
    depends_on: ["review"],
    produces: ["workspace/deploy.md"],
    clean_when: { signoff: { marker: "workspace/deploy.md", require: "status: deployed", basis_of: "implement" } },
  },
};
