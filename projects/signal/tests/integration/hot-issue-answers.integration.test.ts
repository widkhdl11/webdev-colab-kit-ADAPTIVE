import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHotIssueDbPorts } from "@/features/ingestion/api/hot-issue-db";

/**
 * 판정 근거가 **실제로 DB 에 남는지** — hot-issue.md INV-G2 · S31.
 *
 * ── 2026-09-21 에 다시 썼다 (테스트 감사 지적) ──────────────────────────────
 * 처음 판은 테스트가 **자기 손으로** `update({ hot_issue_answers })` 를 쐈다. 그러면
 * 검증 대상이 제품 코드가 아니라 DB 칸의 존재뿐이라, 저장 코드가 근거를 버려도 통과한다.
 * 감사가 그걸 "알리바이에 가깝다"로 판정했고 맞는 말이다 — 실제로 그 변이가 안 잡혔다.
 *
 * 지금은 **진짜 `saveHotIssue` 를 부른다.** DB 문이 `api/hot-issue-db.ts` 로 내려오면서
 * (`server-only` 없음) 테스트가 그 함수를 직접 부를 수 있게 됐다.
 *
 * 실행: `npm run test:integration` (SUPABASE_SECRET_KEY 필요).
 * 환경변수가 없으면 건너뛰지 않고 실패한다 — 조용히 건너뛰면 "통과했다"로 읽힌다.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

/** 0009 를 아직 안 돌렸을 때 PostgREST 가 주는 코드. 그냥 "실패"로 뭉뚱그리면 원인을 못 짚는다. */
const UNKNOWN_COLUMN = "PGRST204";

let db: SupabaseClient;
const created: string[] = [];

beforeAll(() => {
  if (!url || !secret) {
    throw new Error(
      "통합 테스트에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SECRET_KEY 가 필요하다.\n" +
        "값은 .env 가 아니라 셸/OS 환경변수로 넣는다 (protect-secrets 훅 참조).",
    );
  }
  db = createClient(url, secret, { auth: { persistSession: false } });
});

afterAll(async () => {
  if (created.length > 0) await db.from("item").delete().in("canonical_url", created);
});

async function insertItem(suffix: string): Promise<string> {
  const canonicalUrl = `https://example.test/hot-issue-answers/${suffix}-${Date.now()}`;
  created.push(canonicalUrl);
  const res = await db
    .from("item")
    .insert({
      canonical_url: canonicalUrl,
      original_url: canonicalUrl,
      title: "판정 근거 통합 테스트 항목",
      source_id: "test",
      source_name: "테스트",
      published_at: "2026-09-21T00:00:00.000Z",
    })
    .select("id")
    .single();
  if (res.error) throw new Error(`항목 적재 실패: ${res.error.message}`);
  return res.data.id as string;
}

describe("0009 — INV-G2 (S31) 어느 질문이 참이었는지 DB 에 남는다", () => {
  it("**진짜 `saveHotIssue`** 가 판정 근거를 남긴다 — 테스트가 손으로 쓰지 않는다", async () => {
    const id = await insertItem("write");
    const answers = { 변화: true, 방향: false, 기회: true };

    // 이 줄이 이 파일의 요점이다. 저장 코드에서 `hot_issue_answers` 를 빼면 여기가 깨진다.
    try {
      await createHotIssueDbPorts(db).saveHotIssue([
        { itemId: id, importance: 2, answers, kinds: ["news"] },
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(
        message.includes(UNKNOWN_COLUMN) || message.includes("hot_issue_answers")
          ? "0009 마이그레이션을 아직 안 돌렸다"
          : message,
      );
    }

    const read = await db
      .from("item")
      .select("importance, hot_issue_answers, hot_issue_at")
      .eq("id", id)
      .single();
    expect(read.error?.message ?? null).toBeNull();
    expect(read.data?.importance).toBe(2);
    // **개수만으로는 못 되짚는다.** 중요도 2 는 어느 두 질문이 참이었는지 말해 주지 않는다.
    expect(read.data?.hot_issue_answers).toEqual(answers);
    // 「물어봤다」 표시도 같이 찍혀야 다음 주기가 다시 안 묻는다.
    expect(read.data?.hot_issue_at).not.toBeNull();
  });

  it("**진짜 `assignGates`** 가 문을 찍는다 (INV-H1)", async () => {
    const id = await insertItem("gate");
    const ports = createHotIssueDbPorts(db);
    await ports.saveHotIssue([
      { itemId: id, importance: 1, answers: { 변화: true, 방향: false, 기회: false }, kinds: [] },
    ]);
    await ports.assignGates([id]);

    const read = await db.from("item").select("gate").eq("id", id).single();
    expect(read.data?.gate).toBe("gate1");
  });

  it("판정 전에는 비어 있다 — 「안 물어봤다」와 「셋 다 거짓」이 값으로 갈린다", async () => {
    const id = await insertItem("empty");
    const read = await db
      .from("item")
      .select("hot_issue_answers, hot_issue_at")
      .eq("id", id)
      .single();
    expect(read.error?.message ?? null).toBeNull();
    expect(read.data?.hot_issue_answers).toBeNull();
    expect(read.data?.hot_issue_at).toBeNull();
  });

  it("셋 다 거짓도 저장된다 — null 과 구별된다", async () => {
    const id = await insertItem("all-false");
    const answers = { 변화: false, 방향: false, 기회: false };
    const wrote = await db
      .from("item")
      .update({ importance: 0, hot_issue_answers: answers })
      .eq("id", id);
    expect(wrote.error?.message ?? null).toBeNull();

    const read = await db
      .from("item")
      .select("hot_issue_answers")
      .eq("id", id)
      .single();
    // `{}` 나 null 로 뭉개지면 "물어봤는데 셋 다 아니었다"가 사라진다.
    expect(read.data?.hot_issue_answers).toEqual(answers);
  });
});

// 소스를 정규식으로 훑던 검사는 지웠다 (2026-09-21 감사 지적).
// `rules/tdd.md` 가 이름 대고 금지한 형태였고, 정상 리팩터에 거짓 빨간불이 났다.
// 이제 위 검사들이 **진짜 함수를 불러** 같은 것을 더 강하게 붙든다.
