#!/usr/bin/env node
// basis 불일치 메시지가 아는 것보다 많이 말하지 않는지 검사한다.
//
// 왜 있나: basis 해시는 `src/**` 파일의 원문 바이트로 계산된다. 그래서 기계가 아는 것은
// "산출물이 바뀌었다"까지이고, "구현이 바뀌었다"는 아니다. 2026-08-17 에 실제로 갈렸다 —
// 주석 3줄만 바뀌었는데 메시지는 구현이 바뀌었다고 단정했고, diff 를 안 열었으면
// 리뷰어에게 틀린 전제를 넘길 뻔했다.
//
// ⚠ 이 검사의 한계: **소스 문자열 대조다. 동작 검사가 아니다.**
// 그 문장은 graph-stop 내부 함수가 만들고, 실제로 출력시키려면 product~qa 노드를 전부 clean 으로
// 만든 픽스처 레포(tsconfig·package.json·통과하는 테스트 포함)가 필요하다. 문구 한 줄을 지키자고
// 세우기엔 비싸서 여기서 멈췄다. 즉 이 검사는 "문구가 바뀌었나"만 보증하고
// "그 문구가 실제로 출력되나"는 보증하지 않는다.
//
// 사용: node scripts/check-basis-message.mjs [<루트>]

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "gates", "graph-stop.mjs");

const src = readFileSync(FILE, "utf-8");

// basis 불일치를 설명하는 그 한 줄만 본다(파일 전체가 아니라).
const line = src.split(/\r?\n/).find((l) => l.includes("basis 불일치 (기록"));
if (!line) {
  console.error("✗ gates/graph-stop.mjs 에서 basis 불일치 메시지를 못 찾았다 — 이 검사가 낡았다.");
  process.exit(1);
}

const OVERCLAIM = "구현이 바뀌었으니";
const WANTED = "산출물이 바뀌었으니";

if (line.includes(OVERCLAIM)) {
  console.error(
    `✗ basis 불일치 메시지가 "${OVERCLAIM}"라고 단정한다.\n` +
      "  해시는 src/** 의 원문 바이트라 주석·공백 변경도 불일치를 만든다 — 기계는 구현이 바뀌었는지 모른다.\n" +
      `  → "${WANTED}"로 바꾸고 주석·공백도 해시에 들어간다는 사실을 덧붙여야 통과한다.\n` +
      `  실제: ${line.trim()}`,
  );
  process.exit(1);
}

if (!line.includes(WANTED)) {
  console.error(
    `✗ basis 불일치 메시지에 "${WANTED}"가 없다 — 무엇이 불일치를 만들었는지 말하지 않는다.\n` +
      `  실제: ${line.trim()}`,
  );
  process.exit(1);
}

console.log(`✓ basis 불일치 메시지가 아는 만큼만 말한다 ("${WANTED}").`);
console.log("  (한계: 소스 문자열 대조다 — 그 문장이 실제로 출력되는지는 이 검사가 보증하지 않는다)");
