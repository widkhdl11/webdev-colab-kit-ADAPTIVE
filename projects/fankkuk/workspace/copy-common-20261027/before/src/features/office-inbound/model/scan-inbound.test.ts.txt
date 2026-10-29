import { describe, expect, it } from "vitest";
import { spyConsole } from "@/shared/lib/testing/console-spy";
import { addressCodeCheckChar } from "@/entities/parcel/model/address-code";
import { MESSAGE_CODE_CHECK, MESSAGE_CODE_FORMAT, MESSAGE_LOOK, MESSAGE_PHONE_LAST4, MESSAGE_PHONE_LAST4_UNAVAILABLE, scanInbound } from "./scan-inbound";

const DETAIL = {
  qr: "Q-000123",
  kind: "gift",
  order_no: "FC-261003-0041",
  sender_nickname: "별빛",
  receiver_name: "하루",
  tier: "small",
  state: "received",
  next_step: "confirm_label",
  envelope_no: "Q-000123",
  outbound_waybill_no: null,
  return_waybill_no: null,
};

type Reply = { data?: unknown; error: { code: string } | null };

/** 로그인한 사람의 세션 클라이언트 대역. 판정 함수(is_operator·is_owner)는 who 로, 나머지는 replies[fn] 으로 답한다. */
function fakeClient(replies: Record<string, Reply>, who = { operator: true, owner: false }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      const r = replies[fn] ?? { error: { code: "XX000" } };
      return { data: r.data ?? null, error: r.error };
    },
  } as never;
  return { calls, client };
}

/** 확인 문자가 맞는 6자리 하나와, 한 글자를 바꿔 확인 문자가 틀린 값 */
const CODE = "K7M3X" + addressCodeCheckChar("K7M3X");
const TYPO = "K7M4X" + CODE[5];
const BARCODE = "123456789012";

function scan(extra: Record<string, unknown> = {}) {
  return { kind: "inbound", barcode: BARCODE, code: CODE, ...extra };
}

const RECEIVED = { data: { result: "received", qr: "Q-000123", order_no: "FC-261003-0041", reason: null }, error: null };
const LOG_OK = { office_log_code_input: { error: null } };

describe("입고 스캔 — 원 송장 바코드 + 받는 주소 6자리 (office-workflow INV-W1·W2·W5, inbound-address-code INV-C1·C4·C5)", () => {
  it("INV-C5 (S5): 바코드 + 유효 6자리 → 입고 완료와 라벨 QR, 그 상자 정보를 같이 돌려준다. 주문번호는 넘기지 않는다", async () => {
    const { calls, client } = fakeClient({ office_scan_inbound: RECEIVED, office_parcel_by_qr: { data: [DETAIL], error: null }, ...LOG_OK });
    const reply = await scanInbound(client, scan());
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ result: "received", qr: "Q-000123", orderNo: "FC-261003-0041", parcel: { senderNickname: "별빛", tier: "small" } });
    expect(calls[0]).toEqual({
      fn: "office_scan_inbound",
      args: { p_barcode: BARCODE, p_code: CODE, p_carrier: null, p_sender_name: null, p_shelf: null, p_look: null, p_tier: null, p_phone_last4: null },
    });
    // 측정: 받아들인 입력 한 건(값은 남기지 않는다)
    expect(calls).toContainEqual({ fn: "office_log_code_input", args: { p_outcome: "accepted" } });
  });

  it("INV-C1: 6자리는 대소문자를 가리지 않고 대문자로, 앞뒤 공백을 떼어 넘긴다", async () => {
    const { calls, client } = fakeClient({ office_scan_inbound: RECEIVED, office_parcel_by_qr: { data: [DETAIL], error: null }, ...LOG_OK });
    await scanInbound(client, scan({ code: " " + CODE.toLowerCase() + " " }));
    expect(calls[0].args).toMatchObject({ p_code: CODE });
  });

  it("INV-C5 (S5b 실패경로): 확인 문자가 틀리면 DB 입고 함수를 부르지 않고 400 + code_check — 거부 기록만 남는다", async () => {
    const { calls, client } = fakeClient(LOG_OK);
    expect(await scanInbound(client, scan({ code: TYPO }))).toEqual({ status: 400, body: { message: MESSAGE_CODE_CHECK, reason: "code_check" } });
    expect(calls).toEqual([{ fn: "office_log_code_input", args: { p_outcome: "check" } }]);
  });

  it("INV-C1 (S1b 실패경로): 20자 밖 글자(0·O·G·6·Q 등)가 있거나 길이가 다르면 확인 문자를 보기 전에 400 + code_format", async () => {
    for (const bad of ["K7M3X0", "K7M3XO", "G7M3XA", "K7M3X6", "K7M3XQ", "K7M3X", "K7M3XAA"]) {
      const { calls, client } = fakeClient(LOG_OK);
      expect(await scanInbound(client, scan({ code: bad }))).toEqual({ status: 400, body: { message: MESSAGE_CODE_FORMAT, reason: "code_format" } });
      expect(calls).toEqual([{ fn: "office_log_code_input", args: { p_outcome: "format" } }]);
    }
  });

  it("INV-C5: DB 도 확인 문자를 다시 본다 — P0046 이면 같은 400 + code_check", async () => {
    const { client } = fakeClient({ office_scan_inbound: { error: { code: "P0046" } }, ...LOG_OK });
    expect(await scanInbound(client, scan())).toEqual({ status: 400, body: { message: MESSAGE_CODE_CHECK, reason: "code_check" } });
  });

  it("INV-C5: 6자리 없는 상자는 빈칸으로 넘긴다 — 대조용 값이 없으면 DB 가 need_details(바뀐 것 없음), 입력 기록은 남기지 않는다", async () => {
    const { calls, client } = fakeClient({ office_scan_inbound: { data: { result: "need_details", qr: null, order_no: null, reason: "no_code" }, error: null } });
    expect(await scanInbound(client, scan({ code: "" }))).toEqual({ status: 200, body: { result: "need_details", reason: "no_code" } });
    expect(calls).toEqual([{ fn: "office_scan_inbound", args: { p_barcode: BARCODE, p_code: null, p_carrier: null, p_sender_name: null, p_shelf: null, p_look: null, p_tier: null, p_phone_last4: null } }]);
  });

  it("INV-C5·W7: 보류로 넣을 때 택배사·송장 「보내는 분」 이름·선반 번호만 넘긴다(앞뒤 공백 뗌) → hold + 사유 + 닉네임 일치면 그 닉네임", async () => {
    const { calls, client } = fakeClient({ office_scan_inbound: { data: { result: "hold", qr: null, order_no: null, reason: "no_code", nickname: "별빛" }, error: null } });
    const reply = await scanInbound(client, scan({ code: "", carrier: "cj", senderName: " 별빛 ", shelf: " A-03 " }));
    expect(reply).toEqual({ status: 200, body: { result: "hold", reason: "no_code", nickname: "별빛" } });
    expect(calls).toEqual([{ fn: "office_scan_inbound", args: { p_barcode: BARCODE, p_code: null, p_carrier: "cj", p_sender_name: "별빛", p_shelf: "A-03", p_look: null, p_tier: null, p_phone_last4: null } }]);
  });

  it("INV-C5: 닉네임과 맞지 않으면 hold 의 nickname 은 null — 「닉네임 없음」", async () => {
    const { client } = fakeClient({ office_scan_inbound: { data: { result: "hold", qr: null, order_no: null, reason: "no_code", nickname: null }, error: null } });
    expect(await scanInbound(client, scan({ code: "", carrier: "cj", senderName: "김민지", shelf: "A-03" }))).toEqual({ status: 200, body: { result: "hold", reason: "no_code", nickname: null } });
  });

  it("INV-C5 (S5c): 이미 쓰인 6자리로 온 상자는 보류(code_dispute) — 받아들인 입력으로 센다", async () => {
    const { calls, client } = fakeClient({ office_scan_inbound: { data: { result: "hold", qr: null, order_no: null, reason: "code_dispute" }, error: null }, ...LOG_OK });
    expect(await scanInbound(client, scan({ carrier: "cj", senderName: "별빛", shelf: "A-03" }))).toEqual({ status: 200, body: { result: "hold", reason: "code_dispute", nickname: null } });
    expect(calls).toContainEqual({ fn: "office_log_code_input", args: { p_outcome: "accepted" } });
  });

  it("INV-W5: 이미 보류로 기록한 바코드면 hold_recorded — 상자 조회는 하지 않는다", async () => {
    const { calls, client } = fakeClient({ office_scan_inbound: { data: { result: "hold_recorded", qr: null, order_no: null, reason: null }, error: null } });
    expect(await scanInbound(client, scan({ code: "" }))).toEqual({ status: 200, body: { result: "hold_recorded" } });
    expect(calls.map((c) => c.fn)).toEqual(["office_scan_inbound"]);
  });

  it("INV-W1: 라벨을 다시 낸 경우(reprinted)도 200 — 라벨 QR 과 상자 정보를 돌려준다", async () => {
    const { client } = fakeClient({
      office_scan_inbound: { data: { result: "reprinted", qr: "Q-000123", order_no: "FC-261003-0041", reason: null }, error: null },
      office_parcel_by_qr: { data: [DETAIL], error: null },
    });
    const reply = await scanInbound(client, scan({ code: "" }));
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ result: "reprinted", qr: "Q-000123", orderNo: "FC-261003-0041", parcel: { qr: "Q-000123" } });
  });

  it("INV-W1: 입고는 됐는데 상자 조회만 실패하면 parcel 만 null 로 200 — 측정 기록이 실패해도 결과는 그대로", async () => {
    const { client } = fakeClient({
      office_scan_inbound: { data: { result: "received", qr: "Q-000123", order_no: "FC-1", reason: null }, error: null },
      office_parcel_by_qr: { error: { code: "XX000" } },
    });
    expect(await scanInbound(client, scan())).toEqual({ status: 200, body: { result: "received", qr: "Q-000123", orderNo: "FC-1", parcel: null } });
  });

  it("INV-W1 (실패경로): DB 답의 꼴이 다르면 500 — 라벨이 나간 것처럼 보이지 않는다", async () => {
    for (const data of [{ result: "received", qr: "bad", order_no: "FC-1" }, { result: "unmatched" }, { result: "hold", reason: "guess" }]) {
      const { client } = fakeClient({ office_scan_inbound: { data, error: null }, ...LOG_OK });
      expect((await scanInbound(client, scan())).status).toBe(500);
    }
  });

  it("INV-W2 S2b (실패경로): 앞 상자 라벨 부착 전이면 409 + pending_label", async () => {
    const { client } = fakeClient({ office_scan_inbound: { error: { code: "P0042" } } });
    expect(await scanInbound(client, scan())).toEqual({ status: 409, body: { message: "앞 상자 라벨을 붙였는지 먼저 확인해 주세요.", reason: "pending_label" } });
  });

  it("INV-W2: 라벨 QR 스캔 → 부착 확인. 직전 라벨이 아니면 400(P0043), 이미 처리됐으면 409(55000)", async () => {
    const ok = fakeClient({ office_confirm_label: { error: null } });
    expect(await scanInbound(ok.client, { kind: "label", qr: "Q-000123" })).toEqual({ status: 200, body: { ok: true } });
    expect(ok.calls).toEqual([{ fn: "office_confirm_label", args: { p_qr: "Q-000123" } }]);
    const wrong = fakeClient({ office_confirm_label: { error: { code: "P0043" } } });
    expect((await scanInbound(wrong.client, { kind: "label", qr: "Q-000999" })).status).toBe(400);
    const twice = fakeClient({ office_confirm_label: { error: { code: "55000" } } });
    expect((await scanInbound(twice.client, { kind: "label", qr: "Q-000123" })).status).toBe(409);
  });

  it("INV-W7 (실패경로): 41자 넘는 보내는 분 이름·21자 선반·모르는 택배사·옛 이름 앞 글자 칸·모르는 칸은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      scan({ code: "", carrier: "cj", senderName: "가".repeat(41), shelf: "A-03" }),
      scan({ code: "", carrier: "cj", senderName: "별빛", shelf: "가".repeat(21) }),
      scan({ code: "", carrier: "fedex", senderName: "별빛", shelf: "A-03" }),
      scan({ code: "", carrier: "cj", senderInitial: "별", shelf: "A-03" }),
      scan({ code: "", carrier: "cj", senderName: "별빛", shelf: "A-03", phone: "010" }),
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient({});
      expect((await scanInbound(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-C4·W1 (실패경로): 꼴이 틀린 스캔 값·주문번호를 넣은 몸통·상태를 고르는 몸통은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      null,
      { kind: "inbound", barcode: "123", code: CODE },
      { kind: "inbound", barcode: "123456789012345", code: CODE },
      scan({ orderNo: "FC-1" }),
      { kind: "waybill", waybill: BARCODE },
      { kind: "label", qr: "Q-12" },
      { kind: "label", qr: "Q-000123", orderNo: "FC-1" },
      { kind: "set_state", qr: "Q-000123", state: "shipped" },
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient({});
      expect((await scanInbound(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-W1 (실패경로): 운영자가 아니면 404 — 쓰기 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({}, { operator: false, owner: false });
    expect(await scanInbound(client, scan())).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-W1: DB 권한 거부·없음·기타는 403·404·500", async () => {
    for (const [code, status] of [
      ["42501", 403],
      ["P0002", 404],
      ["22023", 400],
      ["XX000", 500],
    ] as const) {
      const { client } = fakeClient({ office_confirm_label: { error: { code } } });
      expect((await scanInbound(client, { kind: "label", qr: "Q-000123" })).status).toBe(status);
    }
  });
});

describe("입고 스캔 — 6자리는 서버 로그에 남지 않는다 (inbound-address-code INV-C2)", () => {
  it("INV-C2 (실패경로): 입고 완료·확인 문자 거부·DB 오류·모르는 답·측정 기록 실패 어느 길에서도 console 에 6자리가 나가지 않는다", async () => {
    const spy = spyConsole();
    try {
      const throwingLog = { office_log_code_input: { error: { code: "XX000" } } };
      const paths = [
        fakeClient({ office_scan_inbound: RECEIVED, office_parcel_by_qr: { data: [DETAIL], error: null }, ...LOG_OK }),
        fakeClient({ office_scan_inbound: { error: { code: "P0046" } }, ...throwingLog }),
        fakeClient({ office_scan_inbound: { error: { code: "XX000" } } }),
        fakeClient({ office_scan_inbound: { data: { result: "weird", code: CODE }, error: null } }),
      ];
      for (const { client, calls } of paths) {
        await scanInbound(client, scan());
        // 6자리는 DB 함수에만 넘어간다 — 실제로 그 값을 들고 처리했다
        expect(calls.find((c) => c.fn === "office_scan_inbound")?.args).toMatchObject({ p_code: CODE });
      }
      await scanInbound(fakeClient({ ...throwingLog }).client, scan({ code: TYPO }));
      expect(spy.leaked(CODE)).toBe(false);
      expect(spy.leaked(TYPO)).toBe(false);
    } finally {
      spy.restore();
    }
  });
});

describe("입고 스캔 — 물품 보관소 포장 모양·크기와 전화번호 뒤 4자리 (inbound-address-code INV-C5·C13)", () => {
  const HOLD = { office_scan_inbound: { data: { result: "hold", qr: null, order_no: null, reason: "no_code", nickname: null }, error: null } };

  it("INV-C13·C5: 포장 모양(앞뒤 공백 뗌)·크기·뒤 4자리를 그대로 넘긴다", async () => {
    const { calls, client } = fakeClient(HOLD);
    const reply = await scanInbound(client, scan({ code: "", carrier: "cj", senderName: "김보관", shelf: "A-03", look: " 하늘색 종이 상자, 리본 ", tier: "medium", phoneLast4: "5678" }));
    expect(reply.status).toBe(200);
    expect(calls).toEqual([
      {
        fn: "office_scan_inbound",
        args: { p_barcode: BARCODE, p_code: null, p_carrier: "cj", p_sender_name: "김보관", p_shelf: "A-03", p_look: "하늘색 종이 상자, 리본", p_tier: "medium", p_phone_last4: "5678" },
      },
    ]);
  });

  it("INV-C5 (S5f, 실패경로): 뒤 4자리가 숫자 넷이 아니면(전체 번호·글자 섞임·다섯 자리) DB 를 부르지 않고 400", async () => {
    for (const bad of ["010-1234-5678", "56a8", "56789", "567"]) {
      const { calls, client } = fakeClient(HOLD);
      expect([bad, await scanInbound(client, scan({ code: "", phoneLast4: bad }))]).toEqual([bad, { status: 400, body: { message: MESSAGE_PHONE_LAST4 } }]);
      expect(calls).toEqual([]);
    }
  });

  it("INV-C13 (실패경로): 포장 모양이 40자를 넘으면 400 · 크기가 구간 값이 아니면 400 — DB 를 부르지 않는다", async () => {
    const { calls, client } = fakeClient(HOLD);
    expect(await scanInbound(client, scan({ code: "", look: "가".repeat(41) }))).toEqual({ status: 400, body: { message: MESSAGE_LOOK } });
    expect((await scanInbound(client, scan({ code: "", tier: "huge" }))).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("INV-C5: 저장 칸이 아직 없는 DB(manual/0023 적용 전 — 0A000)면 409 와 「칸을 비우고 다시」 안내", async () => {
    const { client } = fakeClient({ office_scan_inbound: { error: { code: "0A000" } } });
    expect(await scanInbound(client, scan({ code: "", phoneLast4: "5678" }))).toEqual({ status: 409, body: { message: MESSAGE_PHONE_LAST4_UNAVAILABLE } });
  });
});
