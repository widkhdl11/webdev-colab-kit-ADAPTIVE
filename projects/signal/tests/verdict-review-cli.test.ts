import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * 판정 검토 주간 실행 스크립트를 실제로 돌린다 — docs/specs/verdict-review.md INV-VR1·VR2·VR5·VR8.
 *
 * 순수 함수 테스트는 함수 하나하나를 보지만, 「닫고 → 줄을 붙이고 → 뽑고 → 알림을 쓴다」는
 * 순서와 파일 다루기는 이 스크립트에만 있다. DB 대신 `--rows-file` 을, 시각은 `--now` 를 준다.
 */

const CLI = resolve(process.cwd(), "scripts/verdict-review.mjs");
const NOW = "2026-09-28T08:00:00+09:00"; // 월요일 — 2026-W40
const NOW_MS = Date.parse(NOW);
const DAY = 86_400_000;

let dir = "";
const samples = () => join(dir, "report", "review-samples");
const file = (week: string) => join(samples(), `${week}.json`);
const rowsFile = () => join(dir, "rows.json");

function rows(hotCount: number, notCount: number) {
  const out = [];
  for (let i = 0; i < hotCount + notCount; i += 1) {
    const hot = i < hotCount;
    out.push({
      id: `r${i}`, title: `글 ${i}`, source_id: `s${i % 6}`, source_name: `출처${i % 6}`, original_url: `https://ex.com/${i}`,
      gate: hot ? "gate1" : null, hot_issue_at: new Date(NOW_MS - (1 + (i % 5)) * DAY).toISOString(),
      hot_issue_answers: { "변화": hot, "방향": false, "기회": false }, hot_issue_reasons: {}, one_line: null, summary_points: [],
    });
  }
  return out;
}

function run(now = NOW) {
  const r = spawnSync(process.execPath, [CLI, "--now", now, "--report-dir", join(dir, "report"), "--rows-file", rowsFile()], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

const notices = () => JSON.parse(readFileSync(join(dir, "report", "notices.json"), "utf8"));
const summaryLines = () =>
  existsSync(join(dir, "report", "review-summary.jsonl"))
    ? readFileSync(join(dir, "report", "review-summary.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];

/** 지난주(W39) 표본 — 전부 답이 있다. */
function answeredLastWeek() {
  const items = [0, 1, 2].map((i) => ({ id: `old${i}`, title: "t", source: "s", verdict: { hot: i === 0, true_questions: i === 0 ? ["기회"] : [], reasons: {} } }));
  const at = new Date(NOW_MS - 7 * DAY + 3600_000).toISOString();
  return {
    week: "2026-W39", extracted_at: new Date(NOW_MS - 7 * DAY).toISOString(), items,
    answers: { old0: { answer: "wrong", direction: "should_not_be_hot", at }, old1: { answer: "correct", at }, old2: { answer: "correct", at } },
    first_answer_at: at, completed_at: at,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "verdict-cli-"));
  mkdirSync(samples(), { recursive: true });
  writeFileSync(rowsFile(), JSON.stringify(rows(15, 15)));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("주간 실행", () => {
  it("INV-VR1: 표본을 뽑아 파일로 만들고, 모자라면 모자란 수를 적는다", () => {
    writeFileSync(rowsFile(), JSON.stringify(rows(3, 15)));
    const r = run();
    expect(r.code).toBe(0);
    const s = JSON.parse(readFileSync(file("2026-W40"), "utf8"));
    expect(s.items.filter((i: { verdict: { hot: boolean } }) => i.verdict.hot)).toHaveLength(3);
    expect(s.shortfall).toEqual({ hot: 7, not_hot: 0 });
    expect(s.extracted_at).toBe(new Date(NOW_MS).toISOString());
  });

  it("INV-VR2: 이번 주 표본이 이미 있으면 다시 뽑지 않고 한 글자도 안 바꾼다", () => {
    expect(run().code).toBe(0);
    const before = readFileSync(file("2026-W40"));
    const r = run();
    expect(r.code).toBe(0);
    expect(readFileSync(file("2026-W40")).equals(before)).toBe(true);
  });

  it("INV-VR2: 이번 주 파일이 깨져 있어도 덮어쓰지 않고 실패로 알린다", () => {
    writeFileSync(file("2026-W40"), "{");
    const r = run();
    expect(r.code).toBe(1);
    expect(readFileSync(file("2026-W40"), "utf8")).toBe("{");
    expect(notices()["verdict-review"].rows[0].text.startsWith("판정 검토 실행 실패")).toBe(true);
  });

  it("INV-VR2: 지난주 표본 파일은 닫을 때도 안 고친다 — 닫힘은 집계 줄로만 적는다", () => {
    writeFileSync(file("2026-W39"), JSON.stringify(answeredLastWeek()));
    const before = readFileSync(file("2026-W39"));
    run();
    run();
    expect(readFileSync(file("2026-W39")).equals(before)).toBe(true);
  });

  it("INV-VR5: 다 답한 지난주는 검토됨으로 한 번만 닫히고, 알림에 정확도가 바로 뜬다", () => {
    writeFileSync(file("2026-W39"), JSON.stringify(answeredLastWeek()));
    run();
    // 닫은 그 실행의 알림에 바로 떠야 한다 — 한 주 늦게 뜨면 안 된다
    expect(notices()["verdict-review"].rows.map((r: { text: string }) => r.text)).toContain("9/21 주 판정 정확도 67% (3건 검토)");
    run();
    const lines = summaryLines().filter((l) => l.week === "2026-W39");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ status: "reviewed", correct: 2, wrong: 1, kinds: { "should_not_be_hot:기회": 1 } });
  });

  it("INV-VR5: 답이 모자란 지난주는 검토 안 함으로 닫히고, 이번 주 표본은 그대로 뽑힌다", () => {
    const s = answeredLastWeek();
    delete (s.answers as Record<string, unknown>).old2;
    writeFileSync(file("2026-W39"), JSON.stringify(s));
    expect(run().code).toBe(0);
    expect(summaryLines()).toEqual([expect.objectContaining({ week: "2026-W39", status: "unreviewed", accuracy: null, answered: 2 })]);
    expect(existsSync(file("2026-W40"))).toBe(true);
    const index = JSON.parse(readFileSync(join(samples(), "index.json"), "utf8"));
    expect(index).toEqual({ weeks: ["2026-W39", "2026-W40"], open: "2026-W40" });
  });

  it("INV-VR1: 지난 표본에 들어간 글은 이번 주에 다시 안 뽑힌다", () => {
    const s = answeredLastWeek();
    s.items[0]!.id = "r0";
    writeFileSync(file("2026-W39"), JSON.stringify({ ...s, answers: { r0: s.answers.old0, old1: s.answers.old1, old2: s.answers.old2 } }));
    run();
    const ids = JSON.parse(readFileSync(file("2026-W40"), "utf8")).items.map((i: { id: string }) => i.id);
    expect(ids).not.toContain("r0");
  });

  it("INV-VR8: 알림은 제 칸만 쓰고, 기록 시각과 기한을 남긴다", () => {
    writeFileSync(join(dir, "report", "notices.json"), JSON.stringify({ other: { rows: [{ tone: "info", text: "남의 줄" }] } }));
    run();
    const n = notices();
    expect(n.other.rows[0].text).toBe("남의 줄");
    expect(n["verdict-review"].generated_at).toBe(new Date(NOW_MS).toISOString());
    expect(n["verdict-review"].stale_after_hours).toBe(192);
  });

  it("INV-VR8: DB 를 못 읽으면 실패 줄을 쓰고, 열려 있는 주의 안내는 지우지 않는다", () => {
    expect(run().code).toBe(0); // 이번 주 표본을 연다
    rmSync(rowsFile());
    // 다음 주 실행: 이번 주는 닫고(검토 안 함), 새 표본을 뽑다가 실패한다
    const r = run("2026-10-05T08:00:00+09:00");
    expect(r.code).toBe(1);
    const texts = notices()["verdict-review"].rows.map((x: { text: string }) => x.text);
    expect(texts[0]).toMatch(/^판정 검토 실행 실패/);
  });

  it("INV-VR8: 실패해도 아직 열려 있는 주의 안내는 남는다", () => {
    expect(run().code).toBe(0);
    rmSync(rowsFile());
    writeFileSync(join(dir, "report", "review-summary.jsonl"), "");
    // 같은 주에 한 번 더 — 표본은 이미 있어 DB 를 안 읽는다. 대신 알림 쓰기 전에 실패하게 만들 수는 없으니
    // 실패 경로를 직접 보려면 표본 목록을 깨뜨린다: index.json 자리를 폴더로 막는다.
    rmSync(join(samples(), "index.json"));
    mkdirSync(join(samples(), "index.json"));
    const r = run();
    expect(r.code).toBe(1);
    const texts = notices()["verdict-review"].rows.map((x: { text: string }) => x.text);
    expect(texts[0]).toMatch(/^판정 검토 실행 실패/);
    expect(texts.some((t: string) => t.includes("판정 표본") && t.includes("열려 있다"))).toBe(true);
  });

  it("INV-VR5: 다른 실행이 돌고 있으면(잠금) 아무것도 안 쓰고 끝낸다", () => {
    writeFileSync(join(dir, "report", ".verdict-review.lock"), "1 x");
    const r = run();
    expect(r.code).toBe(0);
    expect(existsSync(file("2026-W40"))).toBe(false);
    expect(existsSync(join(dir, "report", "notices.json"))).toBe(false);
  });
});
