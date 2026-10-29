import { describe, expect, it } from "vitest";
import { submitInquiry } from "./submit-inquiry";

function fakeClient(error: { code: string } | null) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: error ? null : "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f", error };
    },
  } as never;
  return { calls, client };
}

const OK = { kind: "gift", title: " 선물 문의 ", body: "본문", orderNo: "fc-7k3m9" };

describe("1:1 문의 등록 (INV-K11, 결정 d25)", () => {
  it("다듬은 값으로 DB 함수를 부르고 200 — 쓴 사람은 넘기지 않는다", async () => {
    const { calls, client } = fakeClient(null);
    expect(await submitInquiry(client, OK)).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "create_inquiry", args: { p_kind: "gift", p_title: "선물 문의", p_body: "본문", p_order_no: "FC-7K3M9" } }]);
  });

  it("(실패경로): 입력이 틀리면 DB 를 부르지 않고 400 + 걸린 칸", async () => {
    const { calls, client } = fakeClient(null);
    expect(await submitInquiry(client, { ...OK, orderNo: "AB-1234" })).toEqual({
      status: 400,
      body: { message: "주문번호는 FC-7K3M9 형식으로 입력해 주세요.", field: "orderNo" },
    });
    expect(calls).toEqual([]);
  });

  it("(실패경로): 로그인하지 않았으면(DB 42501) 401", async () => {
    const { client } = fakeClient({ code: "42501" });
    expect(await submitInquiry(client, OK)).toEqual({ status: 401, body: { message: "로그인하고 문의를 남겨 주세요." } });
  });

  it("(실패경로): DB 가 한도로 거부하면 400, 그 밖은 500", async () => {
    expect((await submitInquiry(fakeClient({ code: "22023" }).client, OK)).status).toBe(400);
    expect((await submitInquiry(fakeClient({ code: "XX000" }).client, OK)).status).toBe(500);
  });

  it("INV-K12 (실패경로): 문의가 제한된 계정(DB P0051)이면 403 「현재 1:1 문의 이용이 제한되어 있습니다.」", async () => {
    expect(await submitInquiry(fakeClient({ code: "P0051" }).client, OK)).toEqual({
      status: 403,
      body: { message: "현재 1:1 문의 이용이 제한되어 있습니다." },
    });
  });
});
