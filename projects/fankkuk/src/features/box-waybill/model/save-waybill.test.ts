import { describe, expect, it } from "vitest";
import { addressCodeCheckChar } from "@/entities/parcel/model/address-code";
import { spyConsole } from "@/shared/lib/testing/console-spy";
import { findHeldParcel, reportNotMine, saveBoxWaybill, saveShareWaybill } from "./save-waybill";

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
    const f = fakeClient(null, "saved");
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
    const f = fakeClient(null, "saved");
    expect(await saveBoxWaybill({ client: f.client, viewer: CREATOR }, { boxId: BOX, waybill: "640123457788" })).toEqual({
      status: 200,
      body: { waybill: "640123457788" },
    });
    expect(f.calls).toEqual([{ fn: "set_box_waybill", args: { p_box_id: BOX, p_waybill: "640123457788" } }]);
  });

  it("DB 오류를 화면 문구로 바꾼다 — 22023·P0002·55000", async () => {
    const run = async (code: string) => saveBoxWaybill({ client: fakeClient({ code }).client, viewer: FAN }, { boxId: BOX, waybill: "640123457788" });
    expect(await run("22023")).toEqual({ status: 400, body: { message: "송장번호는 숫자 10~14자리예요" } });
    expect(await run("P0002")).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(await run("55000")).toEqual({ status: 409, body: { message: "이미 입고된 상자예요" } });
    expect((await run("XX000")).status).toBe(500);
  });

  it("INV-C7 (S7): 다른 상자에 이미 있는 번호여도 DB 는 거부하지 않는다 — 평소와 같은 「등록됐어요」(200)", async () => {
    const f = fakeClient(null, "saved");
    expect(await saveBoxWaybill({ client: f.client, viewer: FAN }, { boxId: BOX, waybill: "640123457788" })).toEqual({ status: 200, body: { waybill: "640123457788" } });
  });

  it("INV-C10 (실패경로): DB 가 값으로 준 실패(남의 상자 not_found · 입고 뒤 already_received)는 404·409, 하루 10번 초과(P0045)는 429", async () => {
    const run = async (data: unknown, error: { code: string } | null = null) =>
      saveBoxWaybill({ client: fakeClient(error, data).client, viewer: FAN }, { boxId: BOX, waybill: "640123457788" });
    expect(await run("not_found")).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(await run("already_received")).toEqual({ status: 409, body: { message: "이미 입고된 상자예요" } });
    expect(await run(null, { code: "P0045" })).toEqual({ status: 429, body: { message: "오늘은 송장번호를 더 넣을 수 없어요. 내일 다시 해 주세요" } });
  });

  it("(실패경로) 등록 함수가 모르는 답을 주면 저장됐다고 하지 않고 500", async () => {
    for (const data of [null, true, "matched"]) {
      const r = await saveBoxWaybill({ client: fakeClient(null, data).client, viewer: FAN }, { boxId: BOX, waybill: "640123457788" });
      expect(r.status).toBe(500);
    }
    expect((await saveShareWaybill({ client: fakeClient(null, null).client, viewer: CREATOR }, { shareId: BOX, waybill: "640199882271" })).status).toBe(500);
  });
});

describe("역조공 몫 송장번호 저장 (보낸 크리에이터)", () => {
  it("몫 id 와 송장번호를 DB 함수에 넘긴다", async () => {
    const f = fakeClient(null, "saved");
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

const FIND = { boxId: BOX, waybill: "3057-8812-4096", carrier: "cj" };
const FIND_ARGS = { p_box_id: BOX, p_share_id: null, p_waybill: "305788124096", p_carrier: "cj" };

describe("받는 주소 없이 보냈어요 (inbound-address-code INV-C4 ②·C10)", () => {
  it("INV-C4 ②-가 (S4): 주문 주인이 고른 내 상자 + 송장번호·택배사만 DB 찾기 함수에 넘긴다 — 닉네임은 DB 가 로그인 계정으로 본다", async () => {
    const f = fakeClient(null, "matched");
    expect(await findHeldParcel({ client: f.client, viewer: FAN }, FIND)).toEqual({ status: 200, body: { matched: true } });
    expect(f.calls).toEqual([{ fn: "find_held_parcel", args: FIND_ARGS }]);
  });

  it("INV-C4: 역조공 몫은 보낸 크리에이터가 몫 id 로 찾는다 — 팬은 403", async () => {
    const f = fakeClient(null, "matched");
    const body = { shareId: BOX, waybill: "305788124096", carrier: "post" };
    expect((await findHeldParcel({ client: f.client, viewer: CREATOR }, body)).status).toBe(200);
    expect(f.calls).toEqual([{ fn: "find_held_parcel", args: { p_box_id: null, p_share_id: BOX, p_waybill: "305788124096", p_carrier: "post" } }]);
    const g = fakeClient(null, "matched");
    expect((await findHeldParcel({ client: g.client, viewer: FAN }, body)).status).toBe(403);
    expect(g.calls).toEqual([]);
  });

  it("INV-C4·W5 (실패경로): 운영자는 손으로 이을 수 없다 — 403, DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await findHeldParcel({ client: f.client, viewer: OPERATOR }, FIND)).status).toBe(403);
    expect(f.calls).toEqual([]);
  });

  it("INV-C4 (실패경로): 로그인 안 함 401 · 주문번호 칸·택배사 없음·이름 칸(이제 받지 않음)·모르는 택배사·상자 둘은 400 — DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await findHeldParcel({ client: f.client, viewer: null }, FIND)).status).toBe(401);
    for (const body of [
      { ...FIND, orderNo: "FC-7K3M9" },
      { boxId: BOX, waybill: "305788124096" },
      { ...FIND, senderInitial: "별" },
      { ...FIND, nickname: "별빛" },
      { ...FIND, carrier: "fedex" },
      { ...FIND, shareId: BOX },
    ]) {
      expect((await findHeldParcel({ client: f.client, viewer: FAN }, body)).status).toBe(400);
    }
    expect(f.calls).toEqual([]);
  });

  it("INV-C4 (S4 실패경로): DB 가 not_found 면(셋 중 하나 다름·남의 상자·기한 지남 모두 같은 답) 이어지지 않고 다시 확인 안내", async () => {
    const r = await findHeldParcel({ client: fakeClient(null, "not_found").client, viewer: FAN }, FIND);
    expect(r).toMatchObject({ status: 200, body: { matched: false } });
  });

  it("INV-C10 (S10 실패경로): 하루 5번을 넘으면(P0045) 429 「오늘은 더 찾을 수 없어요」", async () => {
    const r = await findHeldParcel({ client: fakeClient({ code: "P0045" }).client, viewer: FAN }, FIND);
    expect(r).toEqual({ status: 429, body: { message: "오늘은 더 찾을 수 없어요. 내일 다시 해 주세요" } });
  });

  it("INV-C4 (실패경로): 찾기 함수가 모르는 답을 주면 이어졌다고 보지 않고 500(입고 화면과 같은 꼴)", async () => {
    for (const data of [true, null, "saved"]) {
      expect(await findHeldParcel({ client: fakeClient(null, data).client, viewer: FAN }, FIND)).toEqual({
        status: 500,
        body: { message: "찾지 못했어요. 잠시 뒤 다시 해 주세요." },
      });
    }
  });

  it("INV-C4: 송장번호 꼴이 틀리면 DB 를 부르지 않고 400, DB 입력 거부(22023)도 400", async () => {
    const f = fakeClient();
    expect((await findHeldParcel({ client: f.client, viewer: FAN }, { ...FIND, waybill: "123" })).status).toBe(400);
    expect(f.calls).toEqual([]);
    expect((await findHeldParcel({ client: fakeClient({ code: "22023" }).client, viewer: FAN }, FIND)).status).toBe(400);
  });
});

describe("제가 보낸 게 아니에요 (inbound-address-code INV-C8)", () => {
  it("INV-C8 (S8): 주문 주인이 고른 상자 하나만 DB 함수에 넘긴다", async () => {
    const f = fakeClient();
    expect(await reportNotMine({ client: f.client, viewer: FAN }, { boxId: BOX })).toEqual({ status: 200, body: { reported: true } });
    expect(f.calls).toEqual([{ fn: "report_not_mine", args: { p_box_id: BOX, p_share_id: null } }]);
    const g = fakeClient();
    expect((await reportNotMine({ client: g.client, viewer: CREATOR }, { shareId: BOX })).status).toBe(200);
    expect(g.calls).toEqual([{ fn: "report_not_mine", args: { p_box_id: null, p_share_id: BOX } }]);
  });

  it("INV-C8 (S8 실패경로): 다른 계정·입고 전(P0002)은 404, 출고 확정 뒤(55000)는 409", async () => {
    expect((await reportNotMine({ client: fakeClient({ code: "P0002" }).client, viewer: FAN }, { boxId: BOX })).status).toBe(404);
    expect(await reportNotMine({ client: fakeClient({ code: "55000" }).client, viewer: FAN }, { boxId: BOX })).toEqual({
      status: 409,
      body: { message: "출고가 끝난 상자는 여기서 알릴 수 없어요. 고객센터로 문의해 주세요." },
    });
  });

  it("INV-C8 (실패경로): 로그인 안 함 401 · 운영자 403 · 팬이 역조공 몫 403 · 다른 칸 400 — DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await reportNotMine({ client: f.client, viewer: null }, { boxId: BOX })).status).toBe(401);
    expect((await reportNotMine({ client: f.client, viewer: OPERATOR }, { boxId: BOX })).status).toBe(403);
    expect((await reportNotMine({ client: f.client, viewer: FAN }, { shareId: BOX })).status).toBe(403);
    expect((await reportNotMine({ client: f.client, viewer: FAN }, { boxId: BOX, orderNo: "FC-1" })).status).toBe(400);
    expect((await reportNotMine({ client: f.client, viewer: FAN }, { boxId: BOX, shareId: BOX })).status).toBe(400);
    expect(f.calls).toEqual([]);
  });
});

describe("상자 쓰기 — 6자리는 서버 로그에 남지 않는다 (inbound-address-code INV-C2)", () => {
  it("INV-C2 (실패경로): DB 가 6자리가 섞인 오류·모르는 답을 돌려줘도 송장 저장·찾기·「제가 보낸 게 아니에요」가 console 에 그 값을 남기지 않는다", async () => {
    const code = "K7M3X" + addressCodeCheckChar("K7M3X");
    const leakyError = { code: "XX000", message: `오류 ${code}`, details: code };
    const spy = spyConsole();
    try {
      for (const [error, data] of [
        [leakyError, null],
        [null, { address_code: code }],
        [null, code],
      ] as const) {
        const f = fakeClient(error as never, data);
        await saveBoxWaybill({ client: f.client, viewer: FAN }, { boxId: BOX, waybill: "640123457788" });
        await saveShareWaybill({ client: f.client, viewer: CREATOR }, { shareId: BOX, waybill: "640123457788" });
        await findHeldParcel({ client: f.client, viewer: FAN }, FIND);
        await reportNotMine({ client: f.client, viewer: FAN }, { boxId: BOX });
        // 네 함수 모두 DB 를 실제로 불렀다
        expect(f.calls.map((c) => c.fn)).toEqual(["set_box_waybill", "set_share_waybill", "find_held_parcel", "report_not_mine"]);
      }
      expect(spy.leaked(code)).toBe(false);
    } finally {
      spy.restore();
    }
  });
});
