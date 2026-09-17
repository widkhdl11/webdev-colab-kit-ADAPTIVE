#!/usr/bin/env node
// @check-role: on-change
// @check-guards: scripts/measurement-gap.mjs
//
// check-measurement-gap.mjs — scripts/measurement-gap.mjs 의 계약 테스트.
//
// 무엇을 지키는 검사인가:
//   이 도구가 고장 나는 모양은 둘 다 **조용하다**.
//   ① 계측이 멈췄는데 아무 말도 안 한다 → 사람은 화면이 맞는 줄 안다
//   ② 멀쩡한 턴마다 떠든다 → 알림이 잡음이 되고, 잡음은 습관적으로 넘겨진다
//   그래서 「신고한다」와 「입 다문다」를 **양쪽 다** 심어서 확인한다. 한쪽만 보면
//   「언제나 신고」 또는 「언제나 침묵」인 구현이 절반을 통과한다.
//
//   그리고 마지막 항목(G)은 **패치가 붙었는지**를 본다. 판단 로직이 멀쩡해도 그것을
//   부르는 자리가 없으면 화면에는 아무것도 안 뜬다 — 「검사를 붙인 것과 그 검사가 도는
//   것은 다르다」(LESSONS 2026-09-16)가 정확히 이 자리다.
//
// 쓰는 법:
//   node scripts/check-measurement-gap.mjs                  (게이트가 부르는 모양)
//   node scripts/check-measurement-gap.mjs --require-wiring (패치 적용 판정용)
//
//   종료 코드 0 = 통과, 1 = 실패.
//
// **배선(G1)은 기본으로 막지 않는다.** 배선은 보호 파일(gates/) 패치라 사용자만 할 수 있는데,
// 그것을 게이트 실패로 만들면 패치를 붙일 때까지 **다른 모든 작업이 막힌다**. 그래서 기본
// 실행에서는 레포의 기존 방식대로 「배선 대기」 한 줄로 신고하고 통과한다.
// `--require-wiring` 을 주면 실패로 바뀐다 — 패치 문서의 「적용 전 실패 / 적용 후 통과」가 그것이다.
//
// 대신 **조용해지지는 않는다**: 배선이 없는데 패치 문서까지 사라지면 그때는 그냥 실패한다.
// 미루기는 「곧 붙인다는 문서가 살아 있는 동안」만 유효하다.

import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { 계측격차, 격차신고줄, jsonl, 활동전부, 기본임계 } from "./measurement-gap.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let 실패 = 0;
const 판정 = (id, ok, 설명, 덧붙임 = "") => {
  console.log(`${ok ? "  ok " : "FAIL"} ${id} — ${설명}${덧붙임 ? `\n       ${덧붙임}` : ""}`);
  if (!ok) 실패 += 1;
};

const 때 = (분) => new Date(Date.UTC(2026, 8, 17, 0, 분)).toISOString();
const 활동줄 = (n, 시작 = 0) => Array.from({ length: n }, (_, i) => ({ at: 때(시작 + i), tool: "Bash" }));

// ── A. 전환이 한 줄도 없고 활동만 잔뜩 — 신고해야 한다 ───────────────────
{
  const g = 계측격차(활동줄(기본임계), []);
  판정("A1", g.신고 === true, "전환 0건 + 활동이 임계만큼 → 신고", `활동수=${g.활동수}`);
  판정("A2", g.활동수 === 기본임계, "전환이 없으면 활동 전부를 센다");
  const line = 격차신고줄(g);
  판정("A3", typeof line === "string" && line.includes("전환 줄이 한 번도 없다"),
    "신고줄이 「한 번도 없다」를 구별해 말한다", String(line).slice(0, 60));
  판정("A4", String(line).includes("report-note.mjs"),
    "신고줄에 무엇을 하라는지가 들어 있다 — 격차만 알리면 읽는 쪽이 멈춘다");
}

// ── B. 심은 위반: 계측이 멈춘 실제 모양 ──────────────────────────────────
//     전환은 옛날에 몇 줄 있고, 그 뒤로 활동만 흐른다. 2026-09-15~17 에 난 그 모양이다.
{
  const 전환 = [{ at: 때(0) }, { at: 때(5) }];
  const g = 계측격차(활동줄(기본임계, 10), 전환);
  판정("B1", g.신고 === true, "마지막 전환 이후 활동이 임계를 넘으면 신고", `활동수=${g.활동수}`);
  판정("B2", g.마지막전환 === Date.parse(때(5)), "마지막 전환 시각을 집는다");
  판정("B3", String(격차신고줄(g)).includes("2026-09-17 00:05"),
    "신고줄이 언제부터 멈췄는지를 적는다");
}

// ── C. 입 다물어야 하는 경우 — 이 항목이 없으면 「언제나 신고」가 통과한다 ──
{
  const 전환 = [{ at: 때(100) }];
  const g = 계측격차(활동줄(기본임계, 101), 전환);   // 활동은 많지만 전환이 방금 찍혔다? → 아니다
  판정("C1", g.활동수 === 기본임계 && g.신고 === true,
    "전환 뒤에 쌓인 활동은 그대로 센다 (전환이 최근이어도 그 뒤가 비면 안 된다)");

  const 조용 = 계측격차(활동줄(5, 101), 전환);
  판정("C2", 조용.신고 === false, "임계 미만이면 신고하지 않는다 — 한 턴 쉰 것과 멈춘 것은 다르다", `활동수=${조용.활동수}`);
  판정("C3", 격차신고줄(조용) === null, "신고할 것이 없으면 줄 자체를 안 만든다");

  const 따라옴 = 계측격차(활동줄(기본임계, 0), [{ at: 때(999) }]);
  판정("C4", 따라옴.활동수 === 0 && 따라옴.신고 === false,
    "전환이 활동보다 뒤면 격차가 0 이다 — 기록이 따라온 상태");
}

// ── D. 줄 순서를 안 믿는다 ─────────────────────────────────────────────
//     덧붙이기 파일이라 정렬이 보장되지 않는다. 마지막 줄만 보는 구현이면 여기서 빨간불이다.
{
  const 뒤섞임 = [{ at: 때(50) }, { at: 때(3) }];   // 마지막 줄이 더 옛날이다
  const g = 계측격차(활동줄(기본임계, 4), 뒤섞임);
  판정("D1", g.마지막전환 === Date.parse(때(50)),
    "마지막 줄이 아니라 제일 늦은 시각을 쓴다", `집은 시각=${new Date(g.마지막전환).toISOString()}`);
  판정("D2", g.활동수 < 기본임계, "그래서 옛 줄 하나가 뒤에 붙어도 격차가 사라지지 않는다");
}

// ── E. 깨진 입력에도 안 죽는다 ─────────────────────────────────────────
{
  const rows = jsonl('{"at":"2026-09-17T00:00:00Z"}\n{깨진 줄\n\n{"at":"nope"}\n');
  판정("E1", rows.length === 2, "깨진 줄은 버리고 나머지는 읽는다", `읽은 줄=${rows.length}`);
  const g = 계측격차(rows, []);
  판정("E2", g.활동수 === 1, "시각을 못 읽는 줄은 안 센다 — 셌다면 없는 활동이 격차를 만든다");
  판정("E3", 계측격차([], []).신고 === false, "빈 기록은 신고하지 않는다(대시보드를 안 깐 프로젝트)");
}

// ── F. 임계는 한 턴 분량보다 위에 있어야 한다 ───────────────────────────
{
  판정("F1", 기본임계 >= 40,
    "임계가 한 턴 분량(수십 줄)보다 위다 — 매 턴 뜨면 알림이 잡음이 된다", `임계=${기본임계}`);
}

// ── H. 날짜별로 갈라진 활동 파일까지 읽는다 ─────────────────────────────
//     오늘치만 읽으면 **계측이 오래 멈출수록 안 잡힌다** — 정확히 거꾸로다.
//     실제로 그랬다: 2026-09-15~17 의 고장을 넣었더니 오늘치 45줄만 잡혀 임계 미달이었다.
{
  const dir = mkdtempSync(join(tmpdir(), "mgap-"));
  try {
    const 적기 = (name, rows) =>
      writeFileSync(join(dir, name), rows.map((r) => JSON.stringify(r)).join("\n"));
    적기("activity.jsonl", 활동줄(5, 200));
    적기("activity-2026-09-15.jsonl", 활동줄(100, 0));
    writeFileSync(join(dir, "transitions.jsonl"), "");
    const 활동 = 활동전부(dir);
    판정("H1", 활동.length === 105, "오늘치와 넘어간 파일을 함께 읽는다", `읽은 줄=${활동.length}`);
    판정("H2", 계측격차(활동, []).신고 === true,
      "그래서 며칠에 걸친 멈춤이 잡힌다 — 오늘치(5줄)만 보면 안 잡혔다");

    // 심은 위반: 넘어간 파일을 안 읽는 구현이면 여기가 빨간불이다
    const 오늘만 = jsonl(readFileSync(join(dir, "activity.jsonl"), "utf-8"));
    판정("H3", 계측격차(오늘만, []).신고 === false,
      "(대조) 오늘치만 세면 같은 고장이 안 잡힌다 — H2 가 지키는 것이 이 차이다");

    writeFileSync(join(dir, "activity-something-else.log"), "무시해야 한다");
    판정("H4", 활동전부(dir).length === 105, "활동 기록이 아닌 파일은 안 읽는다");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── G. 배선 — 판단 로직이 멀쩡해도 부르는 자리가 없으면 화면엔 안 뜬다 ───
{
  const p = join(ROOT, "gates", "graph-stop.mjs");
  const src = existsSync(p) ? readFileSync(p, "utf-8") : "";
  const 부름 = /measurement-gap\.mjs/.test(src) && /격차신고/.test(src);
  const 감쌈 = /try\s*{[^}]*격차신고[\s\S]{0,400}?catch/.test(src);
  const 패치문서 = join(ROOT, "docs", "references", "pending-patches", "2026-09-17-measurement-gap.md");
  const 미루기유효 = existsSync(패치문서);
  const 배선요구 = process.argv.includes("--require-wiring");

  if (부름) {
    판정("G1", true, "gates/graph-stop.mjs 가 이 도구를 부른다");
    판정("G2", 감쌈,
      "부르는 자리가 try/catch 안에 있다 — 여기서 던지면 훅이 죽고 차단 판정에 영영 도달 못 한다");
  } else if (배선요구 || !미루기유효) {
    판정("G1", false, "gates/graph-stop.mjs 가 이 도구를 부른다",
      미루기유효
        ? "아직 안 붙었다 → docs/references/pending-patches/2026-09-17-measurement-gap.md"
        : "안 붙었는데 패치 문서도 없다 — 미루기의 근거가 사라졌다");
  } else {
    console.log(
      [
        "▦ 배선 대기 1건 — gates/graph-stop.mjs 가 아직 이 도구를 안 부른다(보호 파일이라 사용자가 붙인다).",
        "       판단 로직은 위 항목들이 지키고 있고, 화면에 뜨는 것은 패치를 붙인 뒤다.",
        "       붙일 것: docs/references/pending-patches/2026-09-17-measurement-gap.md",
        "       적용 판정: node scripts/check-measurement-gap.mjs --require-wiring",
      ].join("\n"),
    );
  }
}

console.log(실패 === 0 ? "\n계약 테스트 통과" : `\n실패 ${실패}건`);
process.exit(실패 === 0 ? 0 : 1);
