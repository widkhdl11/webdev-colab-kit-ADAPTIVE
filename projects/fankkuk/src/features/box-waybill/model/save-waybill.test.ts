import { describe, expect, it } from "vitest";
import { matchMyBox, saveBoxWaybill, saveShareWaybill } from "./save-waybill";

const BOX = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";
const FAN = { userId: "fan-byeolbit", role: "fan" } as const;
const CREATOR = { userId: "c-haru", role: "creator" } as const;
const OPERATOR = { userId: "op", role: "operator" } as const;

function fakeClient(error: { code: string } | null = null, data: unknown = null) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: error ? null : data, error };
    },
  } as never;
  return { calls, client };
}

describe("상자 송장번호 저장 (팬 선물 상자)", () => {
  it("상자 id 와 숫자만 남긴 송장번호를 DB 함수에 넘긴다 — 본문의 다른 칸은 거부한다", async () => {
    const f = fakeClient();
    expect(await saveBoxWaybill({ client: f.client, viewer: FAN }, { boxId: BOX, waybill: "6401-2345-7788" })).toEqual({
      status: 200,
      body: { waybill: "640123457788" },
    });
    expect(f.calls).toEqual([{ fn: "set_box_waybill", args: { p_box_id: BOX, p_waybill: "640123457788" } }]);
    const g = fakeClient();
    expect((await saveBoxWaybill({ client: g.client, viewer: FAN }, { boxId: BOX, waybill: "640123457788", fanId: "x" })).status).toBe(400);
    expect(g.calls).toEqual([]);
  });

  it("자릿수가 틀리면 DB 를 부르지 않고 400 「송장번호는 숫자 10~14자리예요」", async () => {
    const f = fakeClient();
    expect(await saveBoxWaybill({ client: f.client, viewer: FAN }, { boxId: BOX, waybill: "123" })).toEqual({
      status: 400,
      body: { message: "송장번호는 숫자 10~14자리예요" },
    });
    expect(f.calls).toEqual([]);
  });

  it("로그인하지 않았으면 401, 운영자는 403 — DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await saveBoxWaybill({ client: f.client, viewer: null }, { boxId: BOX, waybill: "640123457788" })).status).toBe(401);
    expect((await saveBoxWaybill({ client: f.client, viewer: OPERATOR }, { boxId: BOX, waybill: "640123457788" })).status).toBe(403);
    expect(f.calls).toEqual([]);
  });

  it("크리에이터가 보낸 팬 선물도 같은 길로 저장한다(보낸 사람 = 팬·크리에이터)", async () => {
    const f = fakeClient();
    expect(await saveBoxWaybill({ client: f.client, viewer: CREATOR }, { boxId: BOX, waybill: "640123457788" })).toEqual({
      status: 200,
      body: { waybill: "640123457788" },
    });
    expect(f.calls).toEqual([{ fn: "set_box_waybill", args: { p_box_id: BOX, p_waybill: "640123457788" } }]);
  });

  it("DB 오류를 화면 문구로 바꾼다 — 22023·P0002·55000·23505", async () => {
    const run = async (code: string) => saveBoxWaybill({ client: fakeClient({ code }).client, viewer: FAN }, { boxId: BOX, waybill: "640123457788" });
    expect(await run("22023")).toEqual({ status: 400, body: { message: "송장번호는 숫자 10~14자리예요" } });
    expect(await run("P0002")).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(await run("55000")).toEqual({ status: 409, body: { message: "이미 입고된 상자예요" } });
    expect(await run("23505")).toEqual({ status: 409, body: { message: "등록할 수 없는 송장번호예요. 번호를 다시 확인해 주세요" } });
    expect((await run("XX000")).status).toBe(500);
  });
});

describe("역조공 몫 송장번호 저장 (보낸 크리에이터)", () => {
  it("다른 몫이 쓴 번호(23505)면 이미 등록됐는지 알려 주지 않는 문구로 409", async () => {
    const r = await saveShareWaybill({ client: fakeClient({ code: "23505" }).client, viewer: CREATOR }, { shareId: BOX, waybill: "640199882271" });
    expect(r).toEqual({ status: 409, body: { message: "등록할 수 없는 송장번호예요. 번호를 다시 확인해 주세요" } });
  });

  it("몫 id 와 송장번호를 DB 함수에 넘긴다", async () => {
    const f = fakeClient();
    expect((await saveShareWaybill({ client: f.client, viewer: CREATOR }, { shareId: BOX, waybill: "6401 9988 2271" })).status).toBe(200);
    expect(f.calls).toEqual([{ fn: "set_share_waybill", args: { p_share_id: BOX, p_waybill: "640199882271" } }]);
  });

  it("크리에이터가 아니면 403 — DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await saveShareWaybill({ client: f.client, viewer: FAN }, { shareId: BOX, waybill: "640199882271" })).status).toBe(403);
    expect((await saveShareWaybill({ client: f.client, viewer: OPERATOR }, { shareId: BOX, waybill: "640199882271" })).status).toBe(403);
    expect(f.calls).toEqual([]);
  });

  it("이미 입고된 몫이면 409", async () => {
    const r = await saveShareWaybill({ client: fakeClient({ code: "55000" }).client, viewer: CREATOR }, { shareId: BOX, waybill: "640199882271" });
    expect(r).toEqual({ status: 409, body: { message: "이미 입고된 상자예요" } });
  });
});

describe("내 물건 찾기 (office-workflow INV-W5)", () => {
  it("INV-W5 S5b: 팬 본인이 고른 내 상자 + 송장번호만 DB 매칭 함수에 넘긴다", async () => {
    const f = fakeClient(null, "matched");
    expect(await matchMyBox({ client: f.client, viewer: FAN }, { boxId: BOX, waybill: "3057-8812-4096" })).toEqual({ status: 200, body: { matched: true } });
    expect(f.calls).toEqual([{ fn: "match_unmatched", args: { p_box_id: BOX, p_waybill: "305788124096" } }]);
  });

  it("INV-W5 (실패경로): 운영자는 손으로 이을 수 없다 — 403, DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await matchMyBox({ client: f.client, viewer: OPERATOR }, { boxId: BOX, waybill: "305788124096" })).status).toBe(403);
    expect(f.calls).toEqual([]);
  });

  it("INV-W5 (실패경로): 로그인하지 않았으면 401, 본문에 다른 사람·주문번호 칸이 있으면 400 — DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await matchMyBox({ client: f.client, viewer: null }, { boxId: BOX, waybill: "305788124096" })).status).toBe(401);
    expect((await matchMyBox({ client: f.client, viewer: FAN }, { boxId: BOX, waybill: "305788124096", orderNo: "FC-7K3M9" })).status).toBe(400);
    expect(f.calls).toEqual([]);
  });

  it("INV-W5: 크리에이터가 보낸 팬 선물 상자도 보낸 본인이 찾는다 — DB 매칭 함수에 그대로 넘긴다", async () => {
    const f = fakeClient(null, "matched");
    expect(await matchMyBox({ client: f.client, viewer: CREATOR }, { boxId: BOX, waybill: "305788124096" })).toEqual({ status: 200, body: { matched: true } });
    expect(f.calls).toEqual([{ fn: "match_unmatched", args: { p_box_id: BOX, p_waybill: "305788124096" } }]);
  });

  it("INV-W5 S5c (실패경로): DB 가 not_found 면(남의 상자·맞는 미확인 없음·기한 지남 모두) 이어지지 않고 7일 반송 안내", async () => {
    const r = await matchMyBox({ client: fakeClient(null, "not_found").client, viewer: FAN }, { boxId: BOX, waybill: "305788124096" });
    expect(r).toEqual({
      status: 200,
      body: { matched: false, message: "맞는 상자를 못 찾았어요. 사무실에 도착한 지 7일이 지나면 원 송장 주소로 돌려보내요" },
    });
  });

  it("INV-W5 (실패경로): 하루 실패 한도를 넘으면(P0045) 429 「오늘은 더 찾을 수 없어요」", async () => {
    const r = await matchMyBox({ client: fakeClient({ code: "P0045" }).client, viewer: FAN }, { boxId: BOX, waybill: "305788124096" });
    expect(r).toEqual({ status: 429, body: { message: "오늘은 더 찾을 수 없어요. 내일 다시 해 주세요" } });
  });

  it("INV-W5 (실패경로): 매칭 함수가 모르는 답을 주면 이어졌다고 보지 않고 삼키지 않는다", async () => {
    await expect(matchMyBox({ client: fakeClient(null, true).client, viewer: FAN }, { boxId: BOX, waybill: "305788124096" })).rejects.toThrow();
    await expect(matchMyBox({ client: fakeClient(null, null).client, viewer: FAN }, { boxId: BOX, waybill: "305788124096" })).rejects.toThrow();
  });

  it("INV-W5: 이미 입고된 상자면 409, 형식이 틀리면 400", async () => {
    expect((await matchMyBox({ client: fakeClient({ code: "55000" }).client, viewer: FAN }, { boxId: BOX, waybill: "305788124096" })).status).toBe(409);
    expect((await matchMyBox({ client: fakeClient({ code: "22023" }).client, viewer: FAN }, { boxId: BOX, waybill: "305788124096" })).status).toBe(400);
  });
});
