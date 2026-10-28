// 앱의 송장 출력 함수(src/app/_sign-gateway/decryptor-entry.ts)를 의존 모듈(supabase-js·zod 포함)까지 한 파일로 묶는다.
// 내 PC 에서 서버에 올리기 전에 돌린다:  node sign-gateway/scripts/build-decryptor.mjs   (projects/fankkuk 에서)
// 결과: sign-gateway/dist/decryptor.mjs — 저장소에는 넣지 않는다(.gitignore). 게이트웨이는 이 파일만 불러 쓴다.
// 묶는 도구는 앱이 이미 쓰는 vite 다 — 새 의존성을 들이지 않는다.

import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const outDir = fileURLToPath(new URL("../dist", import.meta.url));

await build({
  configFile: false,
  root: projectRoot,
  logLevel: "warn",
  publicDir: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "src/app/_sign-gateway/decryptor-entry.ts",
    outDir,
    emptyOutDir: true,
    target: "node22",
    minify: false,
    sourcemap: false,
    rollupOptions: { output: { format: "es", entryFileNames: "decryptor.mjs", codeSplitting: false } },
  },
});

console.log(`묶음 완료: ${outDir}/decryptor.mjs`);
