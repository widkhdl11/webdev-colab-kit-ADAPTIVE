#!/usr/bin/env node
//
// report-decision.mjs — 결정 카드를 기록하는 **유일한** 자리.
//
//   요청:  --ask --id <사이클id-d연번> --task <식별자> --options "착수해|아니" \
//                --what "<한 줄>" --why "<한 줄>" --visible "<한 줄>" \
//                --risk "<한 줄 또는 두 줄>" --not-doing "<한 줄>" [--also-fixing "<한 줄>"] \
//                --done-when "문장1|문장2|..." --details-ref "<근거가 있는 곳>" \
//                ( --detail-file <근거 본문 md 경로> | --detail "<근거 본문>" )
//   본문만: --amend --id <열린 결정의 id> ( --detail-file <md 경로> | --detail "<본문>" )
//   답변:  --answer "<사람이 고른 말>"
//
// 왜 하나뿐인가: 카드와 근거 본문은 **같은 턴에 쌍으로** 기록돼야 하고(한쪽만 있으면 화면의
// 「자세히」가 빈칸이거나, 아무도 안 보는 본문만 남는다), 답변은 카드를 지우면서 이력에
// 한 줄을 남겨야 한다. 쓰는 자리가 둘이면 한쪽이 그 순서를 안 지키는 날이 온다.
//
// **이 스크립트는 state.json 을 쓰지 않는다.** 그 파일을 쓰는 자리는 report-note.mjs
// 하나뿐이라는 규약(2·4절)이 그대로 적용된다. 대기 항목 연동은 같은 턴에
// `report-note.mjs --blocker <id>=<무엇을>` 로 걸고, 검사가 그 쌍을 확인한다.
//
// 정본 규약: docs/references/report-contract.md 12절

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDecision, parseVocab } from "./lib/decision-model.mjs";

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

export const paths = (dir) => ({
  decision: join(dir, "decision.json"),
  detail: join(dir, "decision-detail.md"),
  history: join(dir, "decisions-history.jsonl"),
  vocab: join(dir, "decision-vocab.json"),
});

/** 금지 표현 표를 읽는다. 설치본이 정본이고, 없으면 스킬의 기본값으로 돌아간다. */
export function loadVocab(dir) {
  const p = paths(dir).vocab;
  const fallback = join(ROOT, ".claude", "skills", "report-dashboard", "assets", "decision-vocab.json");
  const raw = readJson(p) ?? readJson(fallback);
  const { vocab, errors } = parseVocab(raw);
  if (errors.length) throw new Error(`금지 표현 표를 못 읽었다:\n- ${errors.join("\n- ")}`);
  return vocab;
}

/**
 * 결정을 연다. 카드와 근거 본문을 **같이** 쓴다 — 하나라도 못 쓰면 아무것도 쓰지 않는다.
 * 이미 열린 결정이 있으면 거부한다(열린 결정은 하나뿐이다).
 */
export function ask(dir, card, detailBody) {
  mkdirSync(dir, { recursive: true });
  const p = paths(dir);

  const open = readJson(p.decision);
  if (open && open.status === "대기") {
    throw new Error(`이미 열린 결정이 있다: ${open.id} — ${open.what}. --answer 로 닫고 시작한다.`);
  }
  if (typeof detailBody !== "string" || detailBody.trim() === "") {
    throw new Error("근거 본문이 비었다. 카드와 근거 본문은 같은 턴에 쌍으로 기록한다 (--detail-file 또는 --detail).");
  }

  const errors = validateDecision(card, loadVocab(dir));
  if (errors.length) throw new Error(`결정 카드가 규약을 어겼다:\n- ${errors.join("\n- ")}`);

  writeFileSync(p.detail, detailBody.endsWith("\n") ? detailBody : `${detailBody}\n`, "utf-8");
  writeFileSync(p.decision, `${JSON.stringify(card, null, 2)}\n`, "utf-8");
  return card;
}

/**
 * 답을 받아 결정을 닫는다. 이력에는 **근거 본문까지 실어** 한 줄을 남긴다 —
 * 본문 파일은 열린 결정 하나에만 대응하는 덮어쓰기 파일이라 여기서 안 실으면 사라진다.
 */
/**
 * 열린 결정의 **근거 본문만** 갈아끼운다. 카드는 손대지 않는다.
 *
 * 왜 필요한가 (2026-09-22): 답을 기다리는 동안 더 나은 안이 나오면 본문이 낡은 채로 남는데,
 * 사람은 그걸 읽고 결정한다. 열기는 열린 카드가 있으면 거부하고, 닫기는 선택지 중 하나를
 * 답으로 기록해야 해서 — 안 고른 답을 적지 않고는 본문을 고칠 길이 없었다.
 *
 * **묻는 말이 그대로일 때만 쓴다.** 무엇을 묻는지가 바뀌면 그건 다른 결정이므로 답을 받아
 * 닫고 새로 연다. 그 판단은 사람이 한다 — 기계가 가를 수 있는 것이 아니라서, 여기서는
 * 같은 결정을 가리키고 있는지(`id`)만 확인한다.
 */
export function amend(dir, id, detailBody) {
  const p = paths(dir);
  const open = readJson(p.decision);
  if (!open || open.status !== "대기") throw new Error("열린 결정이 없다. 본문만 갈아끼울 대상이 없다.");
  if (open.id !== id) throw new Error(`열린 결정은 ${open.id} 다. --id 가 그것과 같아야 한다 (받은 값: ${id}).`);
  if (typeof detailBody !== "string" || detailBody.trim() === "") {
    throw new Error("근거 본문이 비었다. 갈아끼울 내용이 없으면 아무것도 안 바꾼다.");
  }
  writeFileSync(p.detail, detailBody.endsWith("\n") ? detailBody : `${detailBody}\n`, "utf-8");
  return open;
}

export function answer(dir, answerText) {
  const p = paths(dir);
  const card = readJson(p.decision);
  if (!card) throw new Error("열린 결정이 없다.");
  if (card.status !== "대기") throw new Error(`이미 답변된 결정이다: ${card.id}`);

  const closed = {
    ...card,
    status: "답변됨",
    answer: answerText,
    answered_at: new Date().toISOString(),
  };
  const errors = validateDecision(closed, loadVocab(dir));
  if (errors.length) throw new Error(`답변 뒤의 카드가 규약을 어겼다:\n- ${errors.join("\n- ")}`);

  const detailBody = existsSync(p.detail) ? readFileSync(p.detail, "utf-8") : null;
  appendFileSync(p.history, `${JSON.stringify({ ...closed, detail: detailBody })}\n`, "utf-8");
  rmSync(p.decision, { force: true });
  rmSync(p.detail, { force: true });
  return closed;
}

// ── CLI ──────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const slug = (arg("project") ?? activeSlug()).trim();
  if (!slug) {
    console.error("프로젝트 slug 를 못 정했다. --project 로 주거나 루트 ACTIVE 를 채운다.");
    process.exit(2);
  }
  const dir = join(ROOT, "projects", slug, "report");

  try {
    if (has("answer")) {
      const closed = answer(dir, arg("answer"));
      console.log(`결정 닫힘: ${closed.id} — ${closed.answer}`);
      console.log(`대기 항목을 풀어야 한다: node scripts/report-note.mjs --project ${slug} --clear-blockers ...`);
    } else if (has("ask")) {
      const split = (v) => String(v ?? "").split("|").map((s) => s.trim()).filter((s) => s !== "");
      const card = {
        id: arg("id"),
        task: arg("task"),
        asked_at: new Date().toISOString(),
        answer_options: split(arg("options")),
        what: arg("what"),
        why: arg("why"),
        visible_change: arg("visible"),
        risk_and_guard: arg("risk"),
        not_doing: arg("not-doing"),
        also_fixing: arg("also-fixing") ?? null,
        done_when: split(arg("done-when")),
        details_ref: arg("details-ref"),
        status: "대기",
        answer: null,
        answered_at: null,
      };
      const detailPath = arg("detail-file");
      const detailBody = detailPath !== undefined ? readFileSync(detailPath, "utf-8") : arg("detail");
      const written = ask(dir, card, detailBody);
      console.log(`결정 열림: ${written.id} — ${written.what}`);
      console.log(`대기 항목을 걸어야 한다: node scripts/report-note.mjs --project ${slug} --blocker "${written.id}=${written.what}" ...`);
    } else if (has("amend")) {
      const detailPath = arg("detail-file");
      const detailBody = detailPath !== undefined ? readFileSync(detailPath, "utf-8") : arg("detail");
      const open = amend(dir, arg("id"), detailBody);
      console.log(`근거 본문 갈아끼움: ${open.id} — ${open.what}`);
      console.log("카드와 대기 항목은 그대로다 — 묻는 말이 안 바뀌었으므로 다시 걸 것이 없다.");
    } else {
      console.error("--ask · --amend · --answer 중 하나가 필요하다.");
      process.exit(2);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
