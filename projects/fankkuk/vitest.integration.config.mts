import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 통합 테스트 전용 설정 — 로컬 Supabase 에 실제로 붙는다 (rules/tdd.md).
 * 기본 `npm test` 와 갈라 두는 이유: 게이트가 npm test 를 돌리는데, DB 가 꺼져 있을 때
 * 게이트가 실패하면 안 된다. 실행: `npm run test:integration` (로컬 DB 가 떠 있어야 한다 — 없으면 실패다).
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup-env.ts"],
    globalSetup: ["tests/integration/global-cleanup.ts"],
    // 같은 표를 건드리므로 순차 실행한다.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
