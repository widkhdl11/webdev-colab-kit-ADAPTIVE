// 통합 테스트 전용 설정. 기본 `npm test` 와 분리한다 — 로컬 Supabase 가 안 떠 있으면
// 실패하는 테스트가 게이트에 섞이면, 게이트가 코드와 무관하게 빨간불이 된다.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // vi.spyOn 을 되돌린다. 없으면 한 검사가 세운 감시자가 파일 뒤쪽까지 살아 있어서,
    // 그 뒤의 console.warn 이 통째로 삼켜지고 무엇이 경고를 냈는지 안 보인다.
    restoreMocks: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // 정원·경합 검사가 같은 스터디 행을 잠그므로 파일을 나란히 돌리지 않는다.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
