#!/usr/bin/env node
// 예외 경고가 "이 예외가 자동으로 만료되는가"를 말하는지 검사한다.
//
// 왜 있나: CLAUDE.md 는 "예외는 영구가 아니다 — 전제가 깨지면 게이트가 만료시킨다"고 선언하는데,
// 실제 만료 검사는 표면 4개 중 일부에만 있다. 지금 ⚠ 경고는 만료가 걸린 예외와 안 걸린 예외를
// 같은 문장으로 내보내므로, 읽는 사람이 "이건 기계가 지켜본다"고 잘못 믿을 수 있다.
//
// 판정 방식: 만료 규칙 목록을 여기 베끼지 않고 게이트 소스에서 직접 읽는다.
// 베껴 두면 나중에 표면이 늘 때 이 검사가 조용히 빠진다(check-hooks 와 같은 이유).
//
// 사용: node scripts/check-exempt-expiry.mjs [<루트>]
//   <루트> 를 주면 그 레포를 대신 검사한다 — 픽스처로 양방향(패치 전 실패 / 후 통과)을 확인할 때 쓴다.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = join(ROOT, "gates", "run-gates.mjs");

const HAS_EXPIRY = "자동으로 만료된다";
const NO_EXPIRY = "만료 검사가 없다";

// 표면 라벨 → 키. 게이트의 RISK_SURFACES 에서 읽는다(라벨을 손으로 베끼지 않는다).
function surfacesFromGate(src) {
  const block = src.match(/const RISK_SURFACES\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) return null;
  const byLabel = new Map();
  const re = /^\s{2}([a-z]+):\s*\{[\s\S]*?label:\s*"([^"]+)"/gm;
  for (const m of block[1].matchAll(re)) byLabel.set(m[2], m[1]);
  return byLabel.size ? byLabel : null;
}

// 만료 규칙이 선언된 표면 집합. 패치가 도입하는 선언이다 — 없으면 이 검사는 실패한다.
function expiryRuleKeys(src) {
  const block = src.match(/const EXPIRY_RULES\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) return null;
  return new Set([...block[1].matchAll(/^\s*([a-z]+)\s*:/gm)].map((m) => m[1]));
}

const src = readFileSync(GATE, "utf-8");

const byLabel = surfacesFromGate(src);
if (!byLabel) {
  console.error("✗ 게이트에서 RISK_SURFACES 라벨을 못 읽었다 — 이 검사가 낡았다. 검사기를 먼저 고쳐라.");
  process.exit(1);
}

const ruleKeys = expiryRuleKeys(src);
if (!ruleKeys) {
  console.error(
    "✗ gates/run-gates.mjs 에 `const EXPIRY_RULES = { ... };` 선언이 없다.\n" +
      "  만료 규칙이 있는 표면과 없는 표면을 구분할 근거가 코드에 없으므로, 경고가 그 차이를 말할 수 없다.\n" +
      "  → 패치를 적용해야 통과한다.",
  );
  process.exit(1);
}

const run = spawnSync("node", [GATE, "--quick"], { cwd: ROOT, encoding: "utf-8" });
const out = (run.stdout ?? "") + (run.stderr ?? "");

const lines = out.split(/\r?\n/).filter((l) => l.includes("[risk-surface/EXEMPT]"));
if (lines.length === 0) {
  console.error("✗ 예외 경고가 한 건도 없다 — 이 검사는 판정할 근거가 없다(레포에 예외 주석이 있어야 한다).");
  process.exit(1);
}

let bad = 0;
const sawKind = { has: 0, none: 0 };

for (const line of lines) {
  const m = line.match(/\[risk-surface\/EXEMPT\]\s+(\S+)\s+—\s+([^(]+)\(/);
  if (!m) {
    console.error(`✗ 경고 줄 모양이 바뀌었다(검사기가 못 읽는다): ${line.slice(0, 90)}`);
    bad++;
    continue;
  }
  const [, where, label] = m;
  const surface = byLabel.get(label.trim());
  if (!surface) {
    console.error(`✗ 모르는 표면 라벨 "${label.trim()}" — ${where}`);
    bad++;
    continue;
  }

  const shouldHave = ruleKeys.has(surface);
  const wants = shouldHave ? HAS_EXPIRY : NO_EXPIRY;
  const forbids = shouldHave ? NO_EXPIRY : HAS_EXPIRY;

  if (!line.includes(wants) || line.includes(forbids)) {
    console.error(
      `✗ ${where} — ${surface} 예외 경고가 만료 여부를 안 말한다.\n` +
        `    기대: "${wants}" 가 문장에 있어야 한다${shouldHave ? "(만료 규칙이 선언된 표면)" : "(만료 규칙이 없는 표면)"}\n` +
        `    실제: ${line.trim().slice(0, 160)}`,
    );
    bad++;
    continue;
  }
  sawKind[shouldHave ? "has" : "none"]++;
}

// 두 종류가 실제로 섞여 있는데 한쪽만 나왔다면, 문구를 통째로 하드코딩한 패치다.
const surfacesSeen = new Set(
  lines
    .map((l) => l.match(/\[risk-surface\/EXEMPT\]\s+\S+\s+—\s+([^(]+)\(/)?.[1]?.trim())
    .map((lb) => byLabel.get(lb ?? ""))
    .filter(Boolean),
);
const spansBoth = [...surfacesSeen].some((s) => ruleKeys.has(s)) && [...surfacesSeen].some((s) => !ruleKeys.has(s));
if (spansBoth && (sawKind.has === 0 || sawKind.none === 0)) {
  console.error("✗ 만료 있는 표면과 없는 표면이 둘 다 있는데 경고가 한 종류만 나온다 — 문구가 하드코딩됐다.");
  bad++;
}

if (bad > 0) {
  console.error(`\n예외 경고 ${lines.length}건 중 ${bad}건 실패.`);
  process.exit(1);
}

console.log(
  `✓ 예외 경고 ${lines.length}건 전부 만료 여부를 밝힌다 ` +
    `(만료 규칙 있음 ${sawKind.has}건 · 없음 ${sawKind.none}건 · 규칙 선언 표면: ${[...ruleKeys].join(", ") || "없음"}).`,
);
