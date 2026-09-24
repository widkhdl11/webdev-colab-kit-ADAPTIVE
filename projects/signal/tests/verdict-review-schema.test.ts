import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 판정 검토 마이그레이션이 스펙대로 생겼는지 — verdict-review.md INV-VR2·VR3·VR4·VR9.
 *
 * hot-issue-schema.test.ts 와 같은 방법이다: 이 조항들의 강제 위치가 **DB 의 제약·권한·트리거**라
 * 가짜 저장소로 확인하면 우리 fake 를 검증하는 셈이 된다. 실제 DB 에서의 동작은
 * tests/integration/verdict-review.integration.test.ts 가 본다(마이그레이션 적용 후).
 */

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/0012_verdict_review.sql"), "utf8");
const body = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n")
  .toLowerCase();

const TABLES = ["verdict_review_week", "verdict_review_item", "verdict_review_run"];

describe("0012 판정 검토 마이그레이션", () => {
  it("INV-VR9: 세 테이블 모두 행 수준 접근 제어를 켠다", () => {
    for (const t of TABLES) expect(body).toContain(`alter table public.${t} enable row level security`);
  });

  it("INV-VR9: 정책을 하나도 만들지 않는다 — 공개 키로는 읽지도 쓰지도 못한다", () => {
    expect(body).not.toMatch(/create\s+policy/);
  });

  it("INV-VR9: 답 쓰기 함수는 공개 역할이 실행하지 못한다 — PUBLIC·anon·authenticated 에서 회수", () => {
    expect(body).toContain("revoke all on function public.answer_verdict_item(text, uuid, text, text) from public");
    expect(body).toContain("revoke all on function public.answer_verdict_item(text, uuid, text, text) from anon, authenticated");
    expect(body).toContain("revoke all on function public.create_verdict_week(text, timestamptz, integer, integer, jsonb, jsonb) from public");
    expect(body).toContain("revoke all on function public.create_verdict_week(text, timestamptz, integer, integer, jsonb, jsonb) from anon, authenticated");
    // 권한을 올려 실행하면(RLS 우회) 회수가 뚫린다 — 호출자 권한으로 돈다
    expect(body).toMatch(/answer_verdict_item[\s\S]*?security invoker/);
    expect(body).not.toContain("security definer");
  });

  it("INV-VR2: 주차가 기본 키이고, 표본 칸을 바꾸는 update 는 트리거가 거부한다", () => {
    expect(body).toMatch(/week text primary key/);
    expect(body).toMatch(/before update on public\.verdict_review_item[\s\S]*?verdict_review_item_freeze/);
    for (const col of ["week", "item_id", "position", "hot", "snapshot"]) {
      expect(body).toContain(`new.${col} is distinct from old.${col}`);
    }
    expect(body).toMatch(/before update on public\.verdict_review_week[\s\S]*?verdict_review_week_freeze/);
  });

  it("INV-VR3: 방향은 틀리다에만, 판정에 맞는 것만 — DB 제약으로도 막는다", () => {
    expect(body).toContain("constraint verdict_review_item_direction");
    expect(body).toContain("(answer = 'wrong' and not hot and direction = 'should_be_hot')");
    expect(body).toContain("(answer = 'wrong' and hot and direction in ('should_not_be_hot', 'wrong_reason', 'unknown'))");
  });

  it("INV-VR4·VR5: 답 함수는 주의 행을 for update 로 잠그고, 닫힘 표지·닫힘·7일을 본 뒤 쓴다", () => {
    const fn = body.slice(body.indexOf("create or replace function public.answer_verdict_item"));
    // 기다리는 잠금이어야 한다 — `skip locked`·`nowait` 는 닫는 쪽과 순서를 세우지 못한다
    expect(fn).toMatch(/from public\.verdict_review_week where week = p_week for update\s*;/);
    const lock = fn.indexOf("from public.verdict_review_week where week = p_week for update");
    const closedCheck = fn.indexOf("w.closing_at is not null or w.status is not null");
    const write = fn.indexOf("update public.verdict_review_item");
    expect(lock).toBeGreaterThan(-1);
    expect(closedCheck).toBeGreaterThan(lock);
    expect(write).toBeGreaterThan(closedCheck);
    // 첫 답·전부 답한 시각은 처음 한 번만
    expect(fn).toContain("first_answer_at = coalesce(first_answer_at, now())");
    expect(fn).toMatch(/completed_at = coalesce\(\s*completed_at/);
  });

  it("INV-VR2: 주와 표본은 한 함수에서 만든다 — 주 행과 표본 행이 같은 트랜잭션이다", () => {
    const fn = body.slice(body.indexOf("create or replace function public.create_verdict_week"));
    const weekInsert = fn.indexOf("insert into public.verdict_review_week");
    const itemInsert = fn.indexOf("insert into public.verdict_review_item");
    expect(weekInsert).toBeGreaterThan(-1);
    expect(itemInsert).toBeGreaterThan(weekInsert);
    expect(fn.slice(0, fn.indexOf("end $$"))).toContain("on conflict (week) do nothing");
  });

  it("다시 돌려도 안전하다 — 조건 없는 update·delete·truncate 가 없다 (rules/supabase)", () => {
    // 함수 본문(`$$ … $$`) 밖에서, 문장 맨 앞의 update·delete·truncate 만 본다 — `before update on` 같은
    // 트리거 정의는 데이터를 안 바꾼다.
    const outsideFunctions = body.replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(outsideFunctions).not.toMatch(/(^|;)\s*(update\s|delete\s+from|truncate)/m);
    // 이 검사가 실제로 잡는지 — 심은 문장은 걸린다
    expect(`${outsideFunctions}\nupdate public.item set gate = null;`).toMatch(/(^|;)\s*(update\s|delete\s+from|truncate)/m);
  });
});
