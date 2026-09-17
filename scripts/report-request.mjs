#!/usr/bin/env node
//
// report-request.mjs — 요청 층을 기록하는 **유일한** 자리.
//
//   시작:      --start --task <식별자> --request "<사람이 시킨 문장 원문>"
//                      ( --spec <스펙 경로> | --items "항목1|항목2|..." )
//                      [--goal "<왜 하는지 한 줄>"] [--title "<한 줄 제목 40자 이내>"]
//   항목 완료: --done <item-id>
//   상태 변경: --status "승인 대기" --reason "<사유>"     (되돌리기: --status "진행 중")
//   끝내기:    --finish 완료            /  --finish 중단 --reason "<사유>"
//
// 왜 하나뿐인가: request.json 과 requests-history.jsonl 을 같이 다뤄야 하고,
// 무엇보다 **items 가 시작 후에 바뀌지 않는 것**을 한 자리에서 막아야 하기 때문이다.
// 쓰는 자리가 둘이면 한쪽이 그 규칙을 안 지키는 날이 온다.
//
// 정본 규약: docs/references/report-contract.md

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRequest, frozenItemsErrors, itemsFromSpec } from "./lib/request-model.mjs";
import { progressResidue } from "./lib/record-rules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function value(v, flag) {
  if (v === undefined) return undefined;
  if (v.startsWith("--")) {
    console.error(`--${flag} 의 값이 빠졌다 (다음 인자가 ${v} 다).`);
    process.exit(2);
  }
  return v;
}
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? value(process.argv[i + 1], name) : undefined;
}
const has = (name) => process.argv.includes(`--${name}`);

function activeSlug() {
  try { return readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim(); } catch { return ""; }
}
function readJson(p) {
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
}

const paths = (dir) => ({
  request: join(dir, "request.json"),
  history: join(dir, "requests-history.jsonl"),
});

/** 새 요청을 연다. 이미 열린 요청이 있으면 거부한다 — 현재 요청은 하나뿐이다. */
export function start(dir, { task, request, items, specPath, goal = null, title = null }) {
  mkdirSync(dir, { recursive: true });
  const p = paths(dir);
  const open = readJson(p.request);
  if (open && open.status !== "완료" && open.status !== "중단") {
    throw new Error(`이미 열린 요청이 있다: ${open.task} (${open.status}). --finish 로 끝내고 시작한다.`);
  }
  const req = {
    task,
    // 제목은 **시작할 때 확정된다**(사람이 확인한 뒤 여기 들어온다). 안 주면 null 이고,
    // 화면은 원문 앞 40자를 대신 쓴다 — "아직 확인 못 받았다"와 "제목이 이것이다"는 다르다.
    title: title || null,
    request,
    goal: goal || null,
    source: specPath ? "spec" : "manual",
    spec_path: specPath ?? null,
    items,
    status: "진행 중",
    status_reason: null,
    started_at: new Date().toISOString(),
    ended_at: null,
  };
  const errors = validateRequest(req);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  writeFileSync(p.request, `${JSON.stringify(req, null, 2)}\n`, "utf-8");
  return req;
}

/**
 * 열린 요청을 고친다. **items 는 done 말고 아무것도 못 바꾼다** — 이 함수가 그 방벽이다.
 * mutate 는 사본을 받아 고치고, 고친 결과를 얼어붙음 검사에 건다.
 */
export function update(dir, mutate) {
  const p = paths(dir);
  const before = readJson(p.request);
  if (!before) throw new Error(`열린 요청이 없다 (${p.request}). --start 로 먼저 연다.`);

  const after = JSON.parse(JSON.stringify(before));
  mutate(after);

  // 제목도 시작 시점에 얼어붙는다. 진행 중에 바뀌면 화면 맨 위 한 줄과 이력의 제목이
  // 갈라지고, "무슨 요청이었나"를 나중에 대조할 기준이 사라진다.
  if ((before.title ?? null) !== (after.title ?? null)) {
    throw new Error(`request.title 은 시작 후 안 바뀐다 (${before.title ?? "없음"} → ${after.title ?? "없음"})`);
  }
  const frozen = frozenItemsErrors(before.items, after.items);
  if (frozen.length > 0) throw new Error(frozen.join("\n"));
  const errors = validateRequest(after);
  if (errors.length > 0) throw new Error(errors.join("\n"));

  writeFileSync(p.request, `${JSON.stringify(after, null, 2)}\n`, "utf-8");
  return after;
}

/** 요청을 끝내고 이력으로 옮긴다. request.json 은 지운다(열린 요청 없음). */
/**
 * 요청을 끝낸다.
 *
 * **끝내기 전에 PROGRESS 를 본다.** 「마감 내용인가」는 기계가 못 세지만 「**앞 요청의 랩업이
 * 그대로 남아 있나**」는 셀 수 있고, 이 검사의 목적이 그것이다(잔재 검사). 요청이 닫히는
 * 순간이 그것을 볼 수 있는 마지막 자리다 — 지나가면 이력에 「완료」로 박히고 아무도 안 본다.
 *
 * @param progressPath 대조할 PROGRESS. 안 주면 `<dir>/../workspace/PROGRESS.md` 다. 파일이
 *                     없으면 검사하지 않는다 — 없는 파일을 근거로 요청을 못 닫게 하지 않는다.
 */
export function finish(dir, { status, reason, progressPath }) {
  const p = paths(dir);
  const req = readJson(p.request);
  if (!req) throw new Error(`열린 요청이 없다 (${p.request}).`);
  const pp = progressPath ?? join(dir, "..", "workspace", "PROGRESS.md");
  if (existsSync(pp)) {
    const leftover = progressResidue(readFileSync(pp, "utf-8"), req);
    if (leftover) throw new Error(`${leftover}\n  대조한 파일: ${pp}`);
  }
  const done = { ...req, status, status_reason: reason ?? req.status_reason ?? null, ended_at: new Date().toISOString() };
  const errors = validateRequest(done);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  appendFileSync(p.history, `${JSON.stringify(done)}\n`, "utf-8");
  rmSync(p.request, { force: true });
  return done;
}

// ── CLI ────────────────────────────────────────────────────────────────
if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  const slug = (arg("project") ?? activeSlug()).trim();
  if (!slug) { console.error("프로젝트 slug 를 못 정했다."); process.exit(2); }
  const dir = join(ROOT, "projects", slug, "report");

  try {
    if (has("start")) {
      const task = arg("task");
      const request = arg("request");
      const specArg = arg("spec");
      const itemsArg = arg("items");
      if (!task || !request || (!specArg && !itemsArg)) {
        console.error('사용: --start --task <식별자> --request "<원문>" (--spec <경로> | --items "a|b|c") [--goal "<왜>"] [--title "<제목>"]');
        process.exit(2);
      }
      let items;
      let specPath = null;
      if (specArg) {
        specPath = specArg;
        const full = resolve(ROOT, specArg);
        if (!existsSync(full)) { console.error(`스펙 파일이 없다: ${specArg}`); process.exit(2); }
        items = itemsFromSpec(readFileSync(full, "utf-8"));
        if (items.length === 0) {
          console.error(`스펙에서 불변식(- INV-…:)을 하나도 못 찾았다: ${specArg}`);
          console.error("항목 출처는 불변식 정의 앵커다. 스펙이 비었거나 형식이 다르면 --items 로 직접 준다.");
          process.exit(2);
        }
      } else {
        items = itemsArg.split("|").map((s, i) => ({ id: `I${i + 1}`, label: s.trim(), done: false }))
          .filter((it) => it.label !== "");
      }
      const req = start(dir, { task, request, items, specPath, goal: arg("goal") ?? null, title: arg("title") ?? null });
      console.log(`요청 시작: ${req.task} · ${req.source} · 항목 ${req.items.length}개`);
      console.log(`  제목: ${req.title ?? "(확정 전 — 화면은 원문 앞 40자를 쓴다)"}`);
      for (const it of req.items) console.log(`  ☐ ${it.id} ${it.label}`);
    } else if (arg("done")) {
      const id = arg("done");
      const req = update(dir, (r) => {
        const it = r.items.find((x) => x.id === id);
        if (!it) throw new Error(`그런 항목이 없다: ${id} (있는 것: ${r.items.map((x) => x.id).join(", ")})`);
        it.done = true;
      });
      console.log(`항목 완료: ${id} — ${req.items.filter((i) => i.done).length}/${req.items.length}`);
    } else if (arg("status")) {
      const status = arg("status");
      const reason = arg("reason") ?? null;
      const req = update(dir, (r) => { r.status = status; r.status_reason = status === "진행 중" ? null : reason; });
      console.log(`상태: ${req.status}${req.status_reason ? ` — ${req.status_reason}` : ""}`);
    } else if (arg("finish")) {
      const req = finish(dir, { status: arg("finish"), reason: arg("reason") });
      console.log(`요청 ${req.status}: ${req.task} — 이력으로 옮겼다 (항목 ${req.items.filter((i) => i.done).length}/${req.items.length})`);
    } else {
      console.error("무엇을 할지 안 줬다. --start / --done / --status / --finish 중 하나.");
      process.exit(2);
    }
  } catch (e) {
    console.error(`거부:\n${e.message}`);
    process.exit(2);
  }
}
