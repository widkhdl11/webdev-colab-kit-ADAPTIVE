import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 핫이슈 마이그레이션이 스펙대로 생겼는지 — hot-issue.md INV-H2 · H1 · G1.
 *
 * schema-contract.test.ts 와 같은 방법이다: 이 조항들의 강제 위치가 애플리케이션이 아니라
 * **DB 의 칸 유무와 제약**이라, 가짜 저장소로 확인하면 우리 fake 를 검증하는 셈이 된다.
 */

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0008_hot_issue.sql"),
  "utf8",
);

const answersSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0009_hot_issue_answers.sql"),
  "utf8",
);

/** 주석을 뺀 본문. 주석에 적힌 단어가 제약으로 오인되지 않게. */
const strip = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toLowerCase();

const body = strip(sql);
const answersBody = strip(answersSql);

describe("0008_hot_issue.sql — INV-H2 이슈성은 저장하지 않고 중요도는 저장한다", () => {
  it("INV-H2 (S37): 중요도 칸이 있다", () => {
    expect(body).toMatch(/\bimportance\b/);
  });

  it("INV-H2 (S37): 이슈성 칸은 없다 — 시간이 흐르면 낡는 파생값이다", () => {
    expect(body).not.toMatch(/\bissue_score\b/);
    expect(body).not.toMatch(/\bissueness\b/);
  });

  it("INV-H2: 판정했다는 표시를 따로 둔다 — 중요도 0 과 '못 물어봤다'를 가른다", () => {
    expect(body).toMatch(/\bhot_issue_at\b/);
  });
});

describe("0008_hot_issue.sql — INV-H1 문 배정을 저장한다", () => {
  it("INV-H1 (S34): 문 배정 칸이 있다", () => {
    expect(body).toMatch(/\bgate\b/);
  });

  it("INV-H1: 이번 범위에서 허용하는 문 값은 1번 하나다", () => {
    // 값 셋 밖이 들어오면 막는다. 제약이 없으면 오타가 새 문이 된다.
    expect(body).toMatch(/gate_check|gate\s+in\s*\(/);
    expect(body).toMatch(/'gate1'/);
    // 아직 안 여는 문을 미리 허용하지 않는다 — 허용해 두면 빈 문이 화면에 뚫린다.
    expect(body).not.toMatch(/'gate2'/);
    expect(body).not.toMatch(/'gate3'/);
  });
});

describe("0008_hot_issue.sql — INV-G1 종류는 다대다", () => {
  it("INV-G1 (S30): 항목의 칸이 아니라 따로 이어 붙이는 자리에 담는다", () => {
    // 항목의 단일 칸이면 한 글이 뉴스이면서 툴일 수 없다.
    expect(body).toMatch(/create\s+table[^;]*item_kind/);
    expect(body).not.toMatch(/alter\s+table\s+public\.item\s+add\s+column[^;]*\bkind\b/);
  });

  it("INV-G1: 허용 값은 뉴스와 툴 둘뿐이다", () => {
    expect(body).toMatch(/'news'/);
    expect(body).toMatch(/'tool'/);
  });
});

describe("0009_hot_issue_answers.sql — INV-G2 어느 질문이 참이었는지 남긴다 (S31)", () => {
  it("INV-G2 (S31): 판정 근거를 담는 칸이 있다", () => {
    expect(answersBody).toMatch(/\bhot_issue_answers\b/);
  });

  it("INV-G2 (S31): 중요도와 **다른 칸**이다 — 개수만으로는 어느 질문인지 못 되짚는다", () => {
    // 0008 의 importance 를 고쳐 쓰는 것이 아니라 칸을 하나 더 다는지 본다.
    expect(answersBody).toMatch(/add column if not exists hot_issue_answers/);
  });
});
