// loop-files.mjs — 루프가 쓰는 파일 자리와 잠금. run-loop·report-decision·check-run-loop 가 같이 쓴다.
//
// 자리를 한 곳에 두는 이유: 잠금 파일 경로가 두 벌이면 한쪽은 "도는 루프 없음"이라 판단하고
// 두 번째 루프를 띄운다. 두 루프가 같은 요청을 만지면 커밋과 그래프 상태가 섞인다.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mergeLoopConfig } from "./loop-model.mjs";

export function loopPaths(root, slug) {
  const report = join(root, "projects", slug, "report");
  const dir = join(report, "loop");
  return {
    report,
    dir,
    // 잠금은 loop/ 밖에 둔다 — 게이트(보호 파일 패치)가 이 한 파일만 보면 되게.
    lock: join(report, "loop.lock"),
    state: join(dir, "state.json"),
    config: join(dir, "config.json"),
    stop: join(dir, "stop-requested"),
    permissions: join(dir, "permissions.json"),
    log: (n) => join(dir, `${n}.log`),
    round: (n) => join(dir, `${n}.json`),
    wrapup: (n) => join(dir, `${n}.wrapup.json`),
  };
}

export const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; } };

export function loadLoopConfig(root, slug) {
  return mergeLoopConfig(readJson(loopPaths(root, slug).config));
}

/** 그 프로세스가 살아 있나. Windows 에서도 신호 0 은 존재 확인만 한다. */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

/** 잠금 상태: { lock, alive } — 잠금이 없으면 lock 은 null. 남았는데 프로세스가 없으면 alive=false(비정상 종료). */
export function lockStatus(root, slug) {
  const lock = readJson(loopPaths(root, slug).lock);
  if (!lock) return { lock: null, alive: false };
  return { lock, alive: pidAlive(lock.pid) };
}

/** 다음 로그 번호. 루프를 다시 띄워도 앞 로그를 덮지 않게 이어서 센다. */
export function nextRoundNumber(dir) {
  if (!existsSync(dir)) return 1;
  const ns = readdirSync(dir).map((f) => f.match(/^(\d+)\.log$/)?.[1]).filter(Boolean).map(Number);
  return ns.length ? Math.max(...ns) + 1 : 1;
}
