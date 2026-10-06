import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { differenceRow, differenceToss, labeled, measure, paidOrder, prepare } from "./difference-helpers";
import { adminClient, anonClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { FAN_PASS, inspect } from "./office-helpers";

// 차액 결제 성공 주소 라우트 (payment INV-M2·M3·M5·M13, session-login INV-L3).
// 바꾸는 것은 두 자리뿐이다 — 요청 쿠키로 세션 클라이언트를 만드는 자리(시험 계정으로 로그인한 클라이언트를 넣는다)와
// 관리자 키 클라이언트를 만드는 자리(로컬 DB 의 앱 서버 키). 누구인지 확인·대조·승인 권리·기록은 로컬 DB 에 실제로 묻는다.
// 토스 승인 API 만 가짜다 — 전역 fetch 에서 토스 주소만 가로채고 나머지(Supabase)는 그대로 보낸다.

const request = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => {
    if (!request.client) throw new Error("시험이 요청 클라이언트를 정하지 않았다");
    return request.client;
  },
}));
vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => adminClient() }));

const { GET } = await import("@/app/api/checkout/difference/success/route");

const realFetch = globalThis.fetch;
const tossCalls: string[] = [];

beforeAll(() => {
  deleteTestOrders();
  process.env.TOSS_SECRET_KEY = "test_gsk_route";
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.tosspayments.com/")) return realFetch(input, init);
    const body = JSON.parse(String(init?.body)) as { orderId: string; amount: number };
    tossCalls.push(body.orderId);
    return new Response(JSON.stringify({ status: "DONE", orderId: body.orderId, totalAmount: body.amount }), { status: 200 });
  }) as typeof fetch);
});
afterEach(() => {
  tossCalls.length = 0;
});
afterAll(() => {
  vi.unstubAllGlobals();
  deleteTestOrders();
});

async function withDifference() {
  const g = await paidOrder(["small"]);
  const qr = await labeled(g.boxIds[0]!);
  await measure(qr, "medium");
  const row = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string; amount_krw: number }[])[0]!;
  return { g, qr, row };
}

async function callSuccess(row: { toss_order_id: string; amount_krw: number }): Promise<string | null> {
  const q = new URLSearchParams({ orderId: row.toss_order_id, amount: String(row.amount_krw), paymentKey: `pk_${row.toss_order_id}` });
  const res = await GET(new NextRequest(`http://127.0.0.1:3311/api/checkout/difference/success?${q}`));
  expect(res.status).toBe(303);
  return res.headers.get("location");
}

describe("차액 결제 성공 주소 — 그 주문을 보낸 팬만 (INV-L3)", () => {
  it("INV-L3 (실패경로): 로그인하지 않은 채 성공 주소를 부르면 승인 API 를 부르지 않고 선물 내역으로 보낸다", async () => {
    const { g, row } = await withDifference();
    request.client = anonClient();
    expect(await callSuccess(row)).toBe("/gifts");
    expect(tossCalls).toHaveLength(0);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
  });

  it("INV-L3 (실패경로): 다른 팬(달토끼)이 별빛의 차액 성공 주소를 부르면 거부 — 결제 번호도 그대로다", async () => {
    const { g, row } = await withDifference();
    request.client = await signedInClient("daltokki_fan");
    expect(await callSuccess(row)).toBe("/gifts");
    expect(tossCalls).toHaveLength(0);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
  });

  it("INV-M3: 주인(별빛)이 부르면 승인 API 한 번, 완료로 기록하고 선물 상세로 「낸 차액」 안내와 함께 보낸다", async () => {
    const { g, row } = await withDifference();
    request.client = await signedInClient("byeolbit_fan");
    expect(await callSuccess(row)).toBe(`/gifts/${g.orderNo}?difference=paid`);
    expect(tossCalls).toEqual([differenceToss(g.orderId)]);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/done");
  });
});

describe("기한이 지나 승인 권리를 못 얻으면 「기한 지남」으로 안내한다 (INV-M13)", () => {
  it("INV-M13 (실패경로): 결제창에 있는 사이 기한(요청 + 168시간)이 지나면 승인 API 를 부르지 않고 closed 안내로 보낸다", async () => {
    const { g, qr, row } = await withDifference();
    await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS);
    psql(`update public.payments set created_at = now() - interval '168 hours' where toss_order_id = '${row.toss_order_id}'`);
    request.client = await signedInClient("byeolbit_fan");
    expect(await callSuccess(row)).toBe(`/gifts/${g.orderNo}?difference=closed`);
    expect(tossCalls).toHaveLength(0);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
  });

  it("INV-M5 (실패경로): 다른 요청이 이미 승인 중이면 「확인 중」 안내 — 기한 지남이 아니다", async () => {
    const { g, row } = await withDifference();
    expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: row.toss_order_id })).data).toBe(true);
    request.client = await signedInClient("byeolbit_fan");
    expect(await callSuccess(row)).toBe(`/gifts/${g.orderNo}?difference=in_progress`);
    expect(tossCalls).toHaveLength(0);
  });
});
