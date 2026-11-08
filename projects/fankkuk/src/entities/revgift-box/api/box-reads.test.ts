// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readBoxCards, readBoxForFan, readBoxLabels, readCreatorOpenBoxes, readMyBox, readMyBoxes, readPriceTable } from "./box-reads";

function fakeClient(data: unknown, error: { code: string } | null = null) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return { data, error };
      },
    } as never,
  };
}

const BOX = "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10";
const APP = "0d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";

describe("선물함 읽기 (revgift-box INV-GB7·GB9)", () => {
  it("INV-GB9 S9: 신청 관리 창 — 신청 줄은 번호·닉네임·신청 시각·상태만 받는다", async () => {
    const f = fakeClient({
      id: BOX,
      name: "겨울 선물",
      capacity: 30,
      is_public: false,
      status: "open",
      invite_token: "a".repeat(32),
      created_at: "2026-11-08T01:00:00+00:00",
      inbound_code: null,
      carton_count: null,
      cartons_received: 0,
      applications: [{ id: APP, nickname: "별빛", applied_at: "2026-11-08T02:00:00+00:00", status: "excluded", chosen_tier: null }],
      invoice: null,
    });
    expect(await readMyBox(f.client, BOX)).toEqual({
      id: BOX,
      name: "겨울 선물",
      capacity: 30,
      isPublic: false,
      status: "open",
      inviteToken: "a".repeat(32),
      createdAt: "2026-11-08T01:00:00+00:00",
      inboundCode: null,
      cartonCount: null,
      cartonsReceived: 0,
      applications: [{ id: APP, nickname: "별빛", appliedAt: "2026-11-08T02:00:00+00:00", status: "excluded", chosenTier: null }],
      invoice: null,
    });
    expect(f.calls).toEqual([{ fn: "my_revgift_box", args: { p_box_id: BOX } }]);
  });

  it("INV-GB9 S9b: 신청 줄에 다른 칸(로그인 아이디·주소 등)이 섞이면 받지 않는다", async () => {
    const row = { id: BOX, name: "a", capacity: 1, is_public: true, status: "open", invite_token: null, created_at: "2026-11-08T01:00:00+00:00", inbound_code: null, carton_count: null, cartons_received: 0, invoice: null };
    for (const extra of [{ login_id: "byeolbit_fan" }, { address: "서울" }, { fan_id: APP }]) {
      const f = fakeClient({ ...row, applications: [{ id: APP, nickname: "별빛", applied_at: "2026-11-08T02:00:00+00:00", status: "applied", chosen_tier: null, ...extra }] });
      await expect(readMyBox(f.client, BOX)).rejects.toThrow();
    }
    // 같은 꼴이면 받는다(위 거부가 꼴 때문인지 확인)
    const ok = fakeClient({ ...row, applications: [{ id: APP, nickname: "별빛", applied_at: "2026-11-08T02:00:00+00:00", status: "applied", chosen_tier: null }] });
    expect((await readMyBox(ok.client, BOX))?.applications).toHaveLength(1);
  });

  it("INV-GB7: 주인이 아니거나 없는 선물함은 null, 선물함 번호 꼴이 아니면 부르지도 않는다", async () => {
    expect(await readMyBox(fakeClient(null).client, BOX)).toBeNull();
    const f = fakeClient(null);
    expect(await readMyBox(f.client, "not-a-uuid")).toBeNull();
    expect(f.calls).toEqual([]);
  });

  it("내 선물함 목록은 이름·상태·인원·신청 수만", async () => {
    const f = fakeClient([{ id: BOX, name: "겨울 선물", capacity: 30, is_public: true, status: "closed", created_at: "2026-11-08T01:00:00+00:00", active_count: 3 }]);
    expect(await readMyBoxes(f.client)).toEqual([
      { id: BOX, name: "겨울 선물", capacity: 30, isPublic: true, status: "closed", createdAt: "2026-11-08T01:00:00+00:00", activeCount: 3 },
    ]);
  });

  it("INV-GB4 · GB9 S9c: 팬이 보는 선물함 — 다른 신청자 수 칸이 섞이면 받지 않는다, 비공개 토큰이 틀리면 null", async () => {
    const seen = {
      id: BOX,
      name: "겨울 선물",
      creator: { id: BOX, slug: "haru", name: "하루" },
      open: true,
      viewer: "follower",
      my_state: "none",
    };
    const f = fakeClient(seen);
    expect(await readBoxForFan(f.client, BOX, "t".repeat(32))).toEqual({
      id: BOX,
      name: "겨울 선물",
      creator: { id: BOX, slug: "haru", name: "하루" },
      open: true,
      viewer: "follower",
      myState: "none",
    });
    expect(f.calls).toEqual([{ fn: "revgift_box_for_fan", args: { p_box_id: BOX, p_token: "t".repeat(32) } }]);
    await expect(readBoxForFan(fakeClient({ ...seen, applicant_count: 3 }).client, BOX, null)).rejects.toThrow();
    expect(await readBoxForFan(fakeClient(null).client, BOX, "x")).toBeNull();
  });

  it("크리에이터 상세 입구 — 공개 선물함 이름만", async () => {
    const f = fakeClient([{ id: BOX, name: "겨울 선물" }]);
    expect(await readCreatorOpenBoxes(f.client, BOX)).toEqual([{ id: BOX, name: "겨울 선물" }]);
  });
});

describe("선물함 3부 읽기 (revgift-box INV-GB9·GB10·GB12·GB13·GB23)", () => {
  const base = { id: BOX, name: "a", capacity: 1, is_public: true, status: "invoiced", invite_token: null, created_at: "2026-11-08T01:00:00+00:00", applications: [] };
  const line = { nickname: "별빛", tier: "oversize", shipping_fee_krw: 13000, surcharge_region: "jeju", surcharge_krw: 4000, service_fee_krw: 700, amount_krw: 17700 };
  const invoice = { amount_krw: 17700, shipping_fee_krw: 17000, service_fee_krw: 700, carton_cod_krw: 0, created_at: "2026-11-09T01:00:00+00:00", lines: [line] };

  it("INV-GB10 · GB13 S10·S17: 6자리·보낸/받은 상자 수·명세서 줄(닉네임·구간·택배비·할증 구분·할증·서비스료·금액)을 받는다", async () => {
    const f = fakeClient({ ...base, inbound_code: "3479AC", carton_count: 2, cartons_received: 1, invoice });
    const b = await readMyBox(f.client, BOX);
    expect([b?.inboundCode, b?.cartonCount, b?.cartonsReceived]).toEqual(["3479AC", 2, 1]);
    expect(b?.invoice).toEqual({
      amountKrw: 17700,
      shippingFeeKrw: 17000,
      serviceFeeKrw: 700,
      cartonCodKrw: 0,
      createdAt: "2026-11-09T01:00:00+00:00",
      lines: [{ nickname: "별빛", tier: "oversize", shippingFeeKrw: 13000, surchargeRegion: "jeju", surchargeKrw: 4000, serviceFeeKrw: 700, amountKrw: 17700 }],
    });
  });

  it("INV-GB9 S9b: 명세서 줄에 다른 칸(주소·받는 분·전화·신청 계정)이 섞이면 받지 않는다", async () => {
    for (const extra of [{ address: "제주" }, { recipient: "김별빛" }, { phone: "01012345678" }, { fan_id: APP }]) {
      const f = fakeClient({ ...base, inbound_code: null, carton_count: 1, cartons_received: 1, invoice: { ...invoice, lines: [{ ...line, ...extra }] } });
      await expect(readMyBox(f.client, BOX)).rejects.toThrow();
    }
  });

  it("INV-GB9 S9: 번호 라벨은 닉네임 + 바코드(GB + 숫자)만, 다른 칸·다른 꼴의 바코드는 받지 않는다", async () => {
    const f = fakeClient([{ nickname: "별빛", barcode: "GB00000012" }]);
    expect(await readBoxLabels(f.client, BOX)).toEqual({ kind: "ok", labels: [{ nickname: "별빛", barcode: "GB00000012" }] });
    expect(f.calls).toEqual([{ fn: "my_revgift_box_labels", args: { p_box_id: BOX } }]);
    await expect(readBoxLabels(fakeClient([{ nickname: "별빛", barcode: "GB1", address: "서울" }]).client, BOX)).rejects.toThrow();
    await expect(readBoxLabels(fakeClient([{ nickname: "별빛", barcode: "서울 1" }]).client, BOX)).rejects.toThrow();
    expect(await readBoxLabels(fakeClient(null, { code: "P0002" }).client, BOX)).toEqual({ kind: "not_found" });
    expect(await readBoxLabels(fakeClient(null, { code: "P0022" }).client, BOX)).toEqual({ kind: "not_yet" });
  });

  it("INV-GB12 · GB23: 처리할 일 카드 — 확인 필요(작성한 닉네임·고를 팬)와 취소한 선물함 상자", async () => {
    const f = fakeClient([
      { kind: "hold", id: APP, box_id: BOX, box_name: "겨울", written_nickname: "별빛s", created_at: "2026-11-09T01:00:00+00:00", due_at: "2026-11-16T01:00:00+00:00", candidates: [{ application_id: APP, nickname: "별빛" }] },
      { kind: "cancelled_arrival", id: BOX, box_id: BOX, box_name: "겨울", created_at: "2026-11-09T01:00:00+00:00", due_at: "2026-11-16T01:00:00+00:00" },
    ]);
    const cards = await readBoxCards(f.client);
    expect(cards.map((c) => c.kind)).toEqual(["hold", "cancelled_arrival"]);
    expect(cards[0]).toMatchObject({ writtenNickname: "별빛s", candidates: [{ applicationId: APP, nickname: "별빛" }] });
    await expect(readBoxCards(fakeClient([{ kind: "hold", id: APP, box_id: BOX, box_name: "a", written_nickname: "b", created_at: "x", due_at: "y", candidates: [{ application_id: APP, nickname: "별빛", login_id: "byeolbit" }] }]).client)).rejects.toThrow();
  });

  it("INV-GB13: 예상 금액용 요금 — 구간 택배비·서비스료 정가·초기 크리에이터 값과 남은 건수", async () => {
    const f = fakeClient({ fees: { xsmall: 3000, small: 3500, medium: 4400, large: 5500 }, service_fee_krw: 700, early_fee_krw: 300, early_left: 0 });
    expect(await readPriceTable(f.client)).toEqual({ fees: { xsmall: 3000, small: 3500, medium: 4400, large: 5500 }, serviceFeeKrw: 700, earlyFeeKrw: 300, earlyLeft: 0 });
  });
});
