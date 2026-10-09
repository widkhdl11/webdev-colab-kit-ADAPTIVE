#!/usr/bin/env node
// @check-role: pending
// @check-backlog: 사인오프 뒤 PROGRESS 가 낡은 채 남는다
//
// check-progress-fresh.mjs — Stop 훅. 기능 하나를 끝냈는데(review 사인오프) PROGRESS 「현재 상태」가
// 그 전 그대로면 턴을 끝내지 못하게 한다.
//
// 왜: 대화가 길어져 앞부분이 요약되면, 다음에 이어 갈 위치는 브리핑이 PROGRESS 에서 읽는다.
// PROGRESS 는 세션을 마칠 때만 갱신돼서, 요약이 세션 중간에 일어나면 이미 끝난 일을
// 「다음 할 일」로 안내했다(2026-10-09: 끝난 백로그 두 건이 다음 할 일로 남아 있었다).
//
// 판정(커밋 순서로 본다 — 시각은 같은 초에 겹칠 수 있다):
//   R = review.md 를 마지막으로 바꾼 커밋, P = PROGRESS.md 를 마지막으로 바꾼 커밋
//   · PROGRESS.md 가 커밋 안 된 채 바뀌어 있으면 → 통과(갱신 중이다)
//   · review.md 가 커밋 안 된 채 바뀌어 있으면 → 실패(사인오프를 쓰는 중인데 PROGRESS 는 그대로)
//   · R 이 P 의 조상이거나 같으면 → 통과, 아니면 실패
// 실패하면 종료 코드 2 + stderr 안내 — Stop 훅에서 2 는 「멈추지 말고 이것부터 하라」다.
// 같은 턴에 이미 한 번 막았으면(stop_hook_active) 안내만 하고 0 — 같은 이유로 끝없이 막지 않는다.
//
// 사용:
//   Stop 훅:            node scripts/check-progress-fresh.mjs            (stdin 으로 훅 입력)
//   직접:               node scripts/check-progress-fresh.mjs --root <레포>
//   설치 확인:          node scripts/check-progress-fresh.mjs --check-installed
//   자기 시험:          node scripts/check-progress-fresh.mjs --self-test
// 종료 코드: 통과 0 · 낡음 2 · 설치 안 됨/자기 시험 실패 1

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  return { code: r.status ?? 1, out: (r.stdout ?? "").trim() };
}

/** @returns {{ fresh: boolean, why: string }} */
export function progressFreshness(root) {
  const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf-8") : "");
  const slug = read("ACTIVE").trim();
  if (!slug) return { fresh: true, why: "활성 프로젝트 없음" };
  const review = `projects/${slug}/workspace/review.md`;
  const progress = `projects/${slug}/workspace/PROGRESS.md`;
  if (!existsSync(join(root, review)) || !existsSync(join(root, progress))) return { fresh: true, why: "review.md 나 PROGRESS.md 가 아직 없음" };

  const dirty = (p) => git(root, ["status", "--porcelain", "--", p]).out !== "";
  if (dirty(progress)) return { fresh: true, why: "PROGRESS 를 갱신하는 중" };
  if (dirty(review)) return { fresh: false, why: "사인오프(review.md)를 바꿨는데 PROGRESS.md 는 그대로다" };

  const last = (p) => git(root, ["log", "-1", "--format=%H", "--", p]).out;
  const r = last(review);
  const p = last(progress);
  if (!r) return { fresh: true, why: "사인오프 커밋 없음" };
  if (!p) return { fresh: false, why: "PROGRESS.md 가 한 번도 커밋되지 않았다" };
  if (git(root, ["merge-base", "--is-ancestor", r, p]).code === 0) return { fresh: true, why: "사인오프 뒤에 PROGRESS 갱신됨" };
  return { fresh: false, why: `사인오프 커밋 ${r.slice(0, 7)} 뒤로 PROGRESS.md 가 갱신되지 않았다(마지막 ${p.slice(0, 7)})` };
}

function message(slug, why) {
  return [
    `⚠ PROGRESS 가 낡았다 — ${why}.`,
    `  projects/${slug}/workspace/PROGRESS.md 의 「현재 상태」 다섯 칸을 지금 상태로 덮어써라(10줄 이내, 로그는 붙이지 않는다).`,
    "  대화가 요약되면 다음 위치는 브리핑이 이 칸에서 읽는다.",
  ].join("\n");
}

function checkInstalled(root) {
  const settings = join(root, ".claude", "settings.json");
  let cfg;
  try { cfg = JSON.parse(readFileSync(settings, "utf-8")); } catch { console.error("설치 안 됨 — .claude/settings.json 을 읽지 못했다"); return 1; }
  const cmds = (cfg.hooks?.Stop ?? []).flatMap((g) => (g.hooks ?? []).map((h) => String(h.command ?? "")));
  if (cmds.some((c) => c.includes("scripts/check-progress-fresh.mjs"))) { console.log("설치됨 — Stop 훅에 check-progress-fresh 가 있다"); return 0; }
  console.error("설치 안 됨 — .claude/settings.json 의 Stop 훅에 check-progress-fresh 가 없다");
  return 1;
}

// 프로브: 임시 레포에 낡은 상태(사인오프만 바뀜)를 일부러 심어 종료 코드 2 로 잡히는지 본다.
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "progress-fresh-"));
  const run = (args, input = "") => spawnSync("node", [SELF, "--root", dir, ...args], { input, encoding: "utf-8" }).status;
  const g = (...a) => { const r = spawnSync("git", a, { cwd: dir, encoding: "utf-8" }); if (r.status !== 0) throw new Error(r.stderr); };
  const put = (p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
  const commit = (m) => { g("add", "-A"); g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", m); };
  const cases = [];
  const expect = (name, got, want) => cases.push({ name, ok: got === want, got, want });
  try {
    g("init", "-q");
    put("ACTIVE", "demo\n");
    put("projects/demo/workspace/PROGRESS.md", "# p\n");
    put("projects/demo/workspace/review.md", "basis: a\n");
    commit("시작 — 둘이 같은 커밋");
    expect("같은 커밋에서 둘 다 바뀜 → 통과", run([]), 0);

    put("projects/demo/workspace/review.md", "basis: b\n");
    expect("사인오프를 쓰는 중, PROGRESS 그대로 → 막음", run([]), 2);
    commit("사인오프만 커밋");
    expect("사인오프 커밋 뒤 PROGRESS 없음 → 막음", run([]), 2);
    expect("같은 턴에 이미 막았으면 안내만 → 통과", run([], JSON.stringify({ stop_hook_active: true })), 0);

    put("projects/demo/workspace/PROGRESS.md", "# p2\n");
    expect("PROGRESS 를 고치는 중 → 통과", run([]), 0);
    commit("PROGRESS 갱신");
    expect("사인오프 뒤 PROGRESS 커밋 → 통과", run([]), 0);

    put("projects/demo/src.ts", "x\n");
    commit("코드만 바뀜");
    expect("사인오프와 무관한 커밋 → 통과", run([]), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const c of cases) console.log(`${c.ok ? "✓" : "✗"} ${c.name} (종료 코드 ${c.got}, 기대 ${c.want})`);
  const bad = cases.filter((c) => !c.ok).length;
  console.log(bad ? `자기 시험 실패 ${bad}/${cases.length}` : `자기 시험 통과 ${cases.length}/${cases.length}`);
  return bad ? 1 : 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === SELF;
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--root");
  const root = at >= 0 ? resolve(args[at + 1]) : KIT_ROOT;
  if (args.includes("--self-test")) process.exit(selfTest());
  if (args.includes("--check-installed")) process.exit(checkInstalled(root));
  if (process.env.KIT_RUN_LOOP) process.exit(0); // 무인 루프는 회차마다 wrap-up 검사가 따로 본다

  let input = {};
  if (!process.stdin.isTTY) { try { input = JSON.parse(readFileSync(0, "utf-8") || "{}"); } catch { input = {}; } }
  const { fresh, why } = progressFreshness(root);
  if (fresh) process.exit(0);
  const slug = readFileSync(join(root, "ACTIVE"), "utf-8").trim();
  console.error(message(slug, why));
  process.exit(input.stop_hook_active ? 0 : 2);
}
