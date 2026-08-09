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
  },
});
