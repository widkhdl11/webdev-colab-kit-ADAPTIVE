#!/usr/bin/env node
//
// report-activity.mjs — 3층(활동 로그). PostToolUse 훅이 부른다.
//
// 모델 컨텍스트에는 아무것도 넣지 않는다. stdin 의 훅 입력에서 시각·툴 이름·대상만 뽑아
// projects/<ACTIVE>/report/activity.jsonl 에 한 줄 덧붙이고 즉시 끝난다.
//
// 실패해도 조용히 끝낸다(exit 0). 관찰하려고 넣은 것이 관찰 대상을 망가뜨리면 안 된다.
//
// **이 파일이 정본이다.** 설치하면 .claude/hooks/report-activity.mjs 로 복사되고,
// 도는 것은 그 사본이다. 고칠 때는 이 파일을 고치고 다시 복사한다 —
// 둘이 갈라지면 check-report 가 잡는다(사본이 존재할 때만 대조한다).

import { readFileSync, appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";

const MAX_TARGET = 200;

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf-8"));
  } catch {
    return;
  }
  const root = input.cwd;
  if (!root) return;

  let slug = "";
  try {
    slug = readFileSync(join(root, "ACTIVE"), "utf-8").trim();
  } catch {
    return;
  }
  if (!slug) return;

  const dir = join(root, "projects", slug, "report");
  if (!existsSync(dir)) return; // 설치 안 된 프로젝트에는 아무것도 만들지 않는다

  const ti = input.tool_input ?? {};
  const target = String(ti.file_path ?? ti.path ?? ti.command ?? ti.pattern ?? "").slice(0, MAX_TARGET);

  const at = new Date().toISOString();
  const path = join(dir, "activity.jsonl");
  rotate(path, at.slice(0, 10));

  const line = JSON.stringify({
    at,
    tool: String(input.tool_name ?? "unknown"),
    target,
    session_id: String(input.session_id ?? ""),
  });
  mkdirSync(dir, { recursive: true });
  appendFileSync(path, `${line}\n`, "utf-8");
}

// 날이 바뀌면 어제치를 activity-<날짜>.jsonl 로 옮긴다.
// 회전이 없으면 이 파일은 세션마다 자라기만 하고, 화면은 그것을 통째로 fetch 한다.
function rotate(path, today) {
  if (!existsSync(path)) return;
  // 필요한 건 첫 줄의 날짜 열 글자뿐이다. 파일 전체를 읽으면 툴 호출마다 하루치를 통째로
  // 메모리에 올리게 된다 — 관찰 비용이 관찰 대상에 그대로 붙는 자리라 앞부분만 읽는다.
  let first = "";
  try {
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(256);
      const n = readSync(fd, buf, 0, 256, 0);
      first = buf.subarray(0, n).toString("utf-8").split("\n", 1)[0] ?? "";
    } finally {
      closeSync(fd);
    }
  } catch {
    return;
  }
  if (first.trim() === "") return;
  // 256바이트는 한 줄을 다 못 담을 수 있으므로 JSON.parse 하지 않는다 — 잘린 줄은 파싱에
  // 실패하고, 그러면 회전이 조용히 안 일어난다. at 은 첫 필드라 앞머리에서 날짜만 집어낸다.
  const day = first.match(/"at"\s*:\s*"(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!day || day === today) return;
  try {
    renameSync(path, path.replace(/activity\.jsonl$/, `activity-${day}.jsonl`));
    writeFileSync(path, "", "utf-8");
  } catch {
    /* 회전 실패는 기록 실패로 번지지 않는다 */
  }
}

try {
  main();
} catch {
  /* 조용히 */
}
process.exit(0);
