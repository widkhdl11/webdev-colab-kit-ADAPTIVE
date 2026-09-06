import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // vi.spyOn 을 되돌린다. 없으면 한 검사가 세운 감시자가 파일 뒤쪽까지 살아 있어서,
    // 그 뒤의 console.warn 이 통째로 삼켜지고 무엇이 경고를 냈는지 안 보인다.
    restoreMocks: true,
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/integration/**"],
  },
});
