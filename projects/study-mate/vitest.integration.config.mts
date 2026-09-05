// 통합 테스트 전용 설정. 기본 `npm test` 와 분리한다 — 로컬 Supabase 가 안 떠 있으면
// 실패하는 테스트가 게이트에 섞이면, 게이트가 코드와 무관하게 빨간불이 된다.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // 정원·경합 검사가 같은 스터디 행을 잠그므로 파일을 나란히 돌리지 않는다.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
