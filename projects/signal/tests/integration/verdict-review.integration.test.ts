import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createReviewDb } from "@/features/verdict-review/api/review-db";

/**
 * 판정 검토가 **실제 DB 에서** 스펙대로 도는지 — verdict-review.md INV-VR2·VR3·VR4·VR5·VR9.
 *
 * 이 조항들의 강제 위치가 DB(권한·트리거·함수)라 가짜 저장소로는 확인할 수 없다.
 * 제품 코드의 저장소(`createReviewDb`)를 그대로 부르고, 권한은 공개 키 클라이언트로 직접 두드린다.
 *
 * 쓰는 주차는 `2001-W01` 하나다 — 실제 주와 겹칠 일이 없는 과거 주차. 시작과 끝에 지운다.
 * 실행: `npm run test:integration` (0012 적용 후, SUPABASE_SECRET_KEY 필요).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const WEEK = "2001-W01";
const HOT = "11111111-1111-4111-8111-111111111111";
const NOT_HOT = "22222222-2222-4222-8222-222222222222";

let db: SupabaseClient;
let anon: SupabaseClient;

const snapshot = { title: "t", source: "s", source_name: "S", url: null, judged_at: "", true_questions: ["변화"], reasons: {}, one_line: null, points: [] };

async function seed(extractedAt = new Date().toISOString()) {
  await db.from("verdict_review_week").delete().eq("week", WEEK);
  const w = await db.from("verdict_review_week").insert({ week: WEEK, extracted_at: extractedAt, seed: 1, pool_size: 2, shortfall: { hot: 0, not_hot: 0 } });
  if (w.error) throw new Error(w.error.message);
  const i = await db.from("verdict_review_item").insert([
    { week: WEEK, item_id: HOT, position: 1, hot: true, snapshot },
    { week: WEEK, item_id: NOT_HOT, position: 2, hot: false, snapshot: { ...snapshot, true_questions: [] } },
  ]);
  if (i.error) throw new Error(i.error.message);
}

const row = async () => (await db.from("verdict_review_item").select("item_id, answer, direction").eq("week", WEEK).order("position")).data ?? [];
const weekRow = async () => (await db.from("verdict_review_week").select("*").eq("week", WEEK).single()).data;

beforeAll(() => {
  if (!url || !secret || !publishable) {
    throw new Error("통합 테스트에 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY · NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 필요하다.");
  }
  db = createClient(url, secret, { auth: { persistSession: false } });
  anon = createClient(url, publishable, { auth: { persistSession: false } });
});

beforeEach(() => seed());

let probeRunId: number | null = null;
beforeAll(async () => {
  // 실행 기록 테이블이 비어 있으면 RLS 가 꺼져 있어도 공개 키 조회가 [] 로 통과한다 — 한 줄 넣어 둔다
  const r = await db.from("verdict_review_run").insert({ ok: true, message: "it-probe" }).select("id").single();
  probeRunId = (r.data as { id: number } | null)?.id ?? null;
});

afterAll(async () => {
  await db?.from("verdict_review_week").delete().in("week", [WEEK, "2001-W02", "2001-W03"]);
  if (probeRunId !== null) await db?.from("verdict_review_run").delete().eq("id", probeRunId);
});

describe("권한 (INV-VR9)", () => {
  it("INV-VR9: 공개 키로는 세 테이블 어느 것도 안 보인다", async () => {
    for (const t of ["verdict_review_week", "verdict_review_item", "verdict_review_run"]) {
      const { data, error } = await anon.from(t).select("*").limit(5);
      // 정책이 없으면 에러가 아니라 빈 결과다 — 둘 중 무엇이든 행이 나오면 안 된다
      expect(error === null ? data : []).toEqual([]);
    }
  });

  it("INV-VR9: 공개 키로는 답을 못 쓴다 — 함수 실행 권한이 없다", async () => {
    const { error } = await anon.rpc("answer_verdict_item", { p_week: WEEK, p_item: HOT, p_answer: "correct", p_direction: null });
    expect(error).not.toBeNull();
    expect((await row())[0]!.answer).toBeNull();
  });

  it("INV-VR9: 공개 키로는 표본을 못 넣는다", async () => {
    const { error } = await anon.from("verdict_review_week").insert({ week: "2001-W02", extracted_at: new Date().toISOString(), seed: 1, pool_size: 0, shortfall: {} });
    expect(error).not.toBeNull();
    expect((await db.from("verdict_review_week").select("week").eq("week", "2001-W02")).data).toEqual([]);
  });

  it("INV-VR9: 공개 키로는 답을 고치지도 주를 지우지도 못한다 — 오류 없이 0행이어도 secret 키로 다시 읽어 확인한다", async () => {
    await anon.from("verdict_review_item").update({ answer: "correct", answered_at: new Date().toISOString() }).eq("week", WEEK);
    expect((await row()).every((r) => r.answer === null)).toBe(true);
    await anon.from("verdict_review_week").delete().eq("week", WEEK);
    expect(await weekRow()).not.toBeNull();
  });

  it("INV-VR9: 공개 키로는 주를 만드는 함수도 못 부른다", async () => {
    const { error } = await anon.rpc("create_verdict_week", { p_week: "2001-W03", p_extracted_at: new Date().toISOString(), p_seed: 1, p_pool_size: 0, p_shortfall: {}, p_items: [] });
    expect(error).not.toBeNull();
  });
});

describe("답 쓰기 (INV-VR3·VR4)", () => {
  it("INV-VR3: 답을 쓰고, 방향 없는 틀리다는 판정에 따라 채운다", async () => {
    const store = createReviewDb(db);
    expect(await store.answer(WEEK, HOT, "wrong", null)).toEqual({ ok: true });
    expect(await store.answer(WEEK, NOT_HOT, "wrong", null)).toEqual({ ok: true });
    expect(await row()).toEqual([
      { item_id: HOT, answer: "wrong", direction: "unknown" },
      { item_id: NOT_HOT, answer: "wrong", direction: "should_be_hot" },
    ]);
  });

  it("INV-VR3: 고른 방향은 받아들이고, 다시 답하면 마지막 답이 남는다 — 틀리다에서 맞다로 가면 방향이 비워진다", async () => {
    const store = createReviewDb(db);
    expect(await store.answer(WEEK, HOT, "wrong", "wrong_reason")).toEqual({ ok: true });
    expect((await row())[0]).toEqual({ item_id: HOT, answer: "wrong", direction: "wrong_reason" });
    expect(await store.answer(WEEK, HOT, "wrong", "should_not_be_hot")).toEqual({ ok: true });
    expect((await row())[0]!.direction).toBe("should_not_be_hot");
    expect(await store.answer(WEEK, HOT, "correct", null)).toEqual({ ok: true });
    expect((await row())[0]).toEqual({ item_id: HOT, answer: "correct", direction: null });
    expect(await store.answer(WEEK, NOT_HOT, "unsure", null)).toEqual({ ok: true });
    expect(await store.answer(WEEK, NOT_HOT, "correct", null)).toEqual({ ok: true });
    expect((await row())[1]).toEqual({ item_id: NOT_HOT, answer: "correct", direction: null });
  });

  it("INV-VR3: 방향 제약은 함수를 거치지 않아도 걸린다 — 아님 글에 근거 오류를 직접 쓰면 DB 가 거부한다", async () => {
    const r = await db.from("verdict_review_item").update({ answer: "wrong", direction: "wrong_reason", answered_at: new Date().toISOString() }).eq("item_id", NOT_HOT).eq("week", WEEK);
    expect(r.error).not.toBeNull();
  });

  it("INV-VR3: 판정과 안 맞는 방향·맞다에 방향·없는 글은 거부하고 아무것도 안 바꾼다", async () => {
    const store = createReviewDb(db);
    expect(await store.answer(WEEK, NOT_HOT, "wrong", "wrong_reason")).toEqual({ ok: false, error: "bad_direction" });
    expect(await store.answer(WEEK, HOT, "wrong", "should_be_hot")).toEqual({ ok: false, error: "bad_direction" });
    expect(await store.answer(WEEK, HOT, "correct", "wrong_reason")).toEqual({ ok: false, error: "bad_direction" });
    expect(await store.answer(WEEK, "33333333-3333-4333-8333-333333333333", "correct", null)).toEqual({ ok: false, error: "no_item" });
    expect((await row()).every((r) => r.answer === null)).toBe(true);
  });

  it("INV-VR4: 첫 답·전부 답한 시각은 처음 한 번만 적힌다", async () => {
    const store = createReviewDb(db);
    await store.answer(WEEK, HOT, "correct", null);
    const first = (await weekRow())!.first_answer_at;
    expect(first).not.toBeNull();
    expect((await weekRow())!.completed_at).toBeNull();
    await store.answer(WEEK, NOT_HOT, "unsure", null);
    const done = (await weekRow())!.completed_at;
    expect(done).not.toBeNull();
    await store.answer(WEEK, NOT_HOT, "correct", null);
    const after = (await weekRow())!;
    expect([after.first_answer_at, after.completed_at]).toEqual([first, done]);
  });

  it("INV-VR4·VR5: 한 번 적힌 시각·닫힘 표지는 직접 update 로도 못 바꾼다 — 트리거가 거부한다", async () => {
    const store = createReviewDb(db);
    await store.answer(WEEK, HOT, "correct", null);
    const a = await db.from("verdict_review_week").update({ first_answer_at: new Date(0).toISOString() }).eq("week", WEEK);
    expect(a.error).not.toBeNull();
    await store.markClosing(WEEK);
    const b = await db.from("verdict_review_week").update({ closing_at: new Date(0).toISOString() }).eq("week", WEEK);
    expect(b.error).not.toBeNull();
  });

  it("INV-VR4: 같은 주에 동시에 답해도 교착 없이 둘 다 남는다", async () => {
    const store = createReviewDb(db);
    const rs = await Promise.all([
      store.answer(WEEK, HOT, "correct", null),
      store.answer(WEEK, NOT_HOT, "correct", null),
      store.answer(WEEK, HOT, "unsure", null),
      store.answer(WEEK, NOT_HOT, "unsure", null),
    ]);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect((await row()).every((r) => r.answer !== null)).toBe(true);
  });
});

describe("닫힘 (INV-VR5)", () => {
  it("INV-VR5: 닫힘 표지가 커밋되면 답을 받지 않는다", async () => {
    const store = createReviewDb(db);
    await store.markClosing(WEEK);
    expect(await store.answer(WEEK, HOT, "correct", null)).toEqual({ ok: false, error: "closed" });
  });

  it("INV-VR5: 7일 경계 — 1분 모자라면 받고, 1분 넘으면 안 받는다", async () => {
    await seed(new Date(Date.now() - 7 * 86_400_000 + 60_000).toISOString());
    expect(await createReviewDb(db).answer(WEEK, HOT, "correct", null)).toEqual({ ok: true });
    await seed(new Date(Date.now() - 7 * 86_400_000 - 60_000).toISOString());
    expect(await createReviewDb(db).answer(WEEK, HOT, "correct", null)).toEqual({ ok: false, error: "closed" });
  });

  it("INV-VR5: 한 주의 집계는 한 번만 — 두 번째 닫기는 아무것도 안 바꾼다", async () => {
    const store = createReviewDb(db);
    await store.markClosing(WEEK);
    const s = { total: 2, answered: 0, correct: 0, wrong: 0, unsure: 0, accuracy: null, byDirection: {}, byQuestion: {}, bySource: {}, kinds: {}, answerMinutes: null };
    await store.closeWeek(WEEK, "unreviewed", s, new Date().toISOString());
    await store.closeWeek(WEEK, "reviewed", { ...s, accuracy: 1 }, new Date().toISOString());
    const w = (await weekRow())!;
    expect(w.status).toBe("unreviewed");
    expect(w.summary.accuracy).toBeNull();
  });

  it("INV-VR5: 닫힘 표지 없이 닫으려 하면 DB 가 거부한다", async () => {
    const { error } = await db.from("verdict_review_week").update({ status: "reviewed", closed_at: new Date().toISOString(), summary: {} }).eq("week", WEEK);
    expect(error).not.toBeNull();
  });
});

describe("표본은 바꿀 수 없다 (INV-VR2)", () => {
  it("INV-VR2: 표본 사본·판정을 고치는 update 는 트리거가 거부한다", async () => {
    const a = await db.from("verdict_review_item").update({ snapshot: { ...snapshot, title: "바꿈" } }).eq("item_id", HOT).eq("week", WEEK);
    expect(a.error).not.toBeNull();
    const b = await db.from("verdict_review_item").update({ hot: false }).eq("item_id", HOT).eq("week", WEEK);
    expect(b.error).not.toBeNull();
    const c = await db.from("verdict_review_week").update({ seed: 99 }).eq("week", WEEK);
    expect(c.error).not.toBeNull();
  });

  it("INV-VR2: 주와 표본은 한 번에 만들어진다 — 표본 하나가 잘못되면 주도 안 남는다(표본 0건 주 없음)", async () => {
    const store = createReviewDb(db);
    const bad = await db.rpc("create_verdict_week", {
      p_week: "2001-W02", p_extracted_at: new Date().toISOString(), p_seed: 1, p_pool_size: 1, p_shortfall: { hot: 0, not_hot: 0 },
      p_items: [{ item_id: HOT, position: 0, hot: true, snapshot }], // position 0 은 CHECK 위반
    });
    expect(bad.error).not.toBeNull();
    expect((await db.from("verdict_review_week").select("week").eq("week", "2001-W02")).data).toEqual([]);
    // 제대로 된 입력은 주와 표본이 같이 생긴다
    const ok = await store.createWeek({
      week: "2001-W03", extractedAt: new Date().toISOString(), seed: 2, poolSize: 1, shortfall: { hot: 9, notHot: 10 },
      items: [{ itemId: HOT, hot: true, snapshot: { title: "t", source: "s", sourceName: "S", url: null, judgedAt: "", trueQuestions: ["변화"], reasons: {}, oneLine: null, points: [] } }],
    });
    expect(ok).toBe(true);
    expect((await db.from("verdict_review_item").select("item_id").eq("week", "2001-W03")).data).toHaveLength(1);
  });

  it("INV-VR2: 같은 주차는 두 번 못 만든다 — 저장소는 false 를 돌려주고 아무것도 안 바꾼다", async () => {
    const created = await createReviewDb(db).createWeek({
      week: WEEK, extractedAt: new Date().toISOString(), seed: 5, poolSize: 9, shortfall: { hot: 0, notHot: 0 }, items: [],
    });
    expect(created).toBe(false);
    expect((await weekRow())!.seed).toBe(1);
  });
});
