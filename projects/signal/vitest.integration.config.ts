import { defineConfig } from "vitest/config";

/**
 * 통합 테스트 전용 설정 — 실제 Supabase 에 붙는다 (rules/tdd.md).
 *
 * 기본 `npm test` 와 갈라 두는 이유: 게이트가 npm test 를 돌리는데, 여기 있는 것이
 * 섞여 있으면 프로젝트 일시정지·네트워크 장애에 게이트가 비결정적으로 실패한다.
 * 실행: `npm run test:integration` (환경변수가 있어야 한다 — 없으면 통과가 아니라 실패다).
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup-env.ts"],
    // 같은 테이블을 건드리므로 순차 실행한다.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
