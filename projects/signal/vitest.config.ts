import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // tsconfig 의 paths(@/* → ./src/*)를 테스트 실행기도 알아야 한다.
  // 없으면 소스는 타입체크를 통과하는데 테스트만 import 해석에 실패한다.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // 기본 run 은 **오프라인 유닛만** 돈다 (rules/tdd.md).
    // tests/integration/ 은 실제 Supabase 에 붙으므로 여기서 뺀다 — 게이트가 npm test 를
    // 돌리는데 통합 테스트가 섞여 있으면 프로젝트 일시정지·네트워크 장애에 게이트가
    // 비결정적으로 실패한다. 통합은 `npm run test:integration`.
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/integration/**"],
  },
});
