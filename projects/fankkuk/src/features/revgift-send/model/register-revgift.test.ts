import { describe, expect, it } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";
import { registerRevgift, type RevgiftStore, type RevgiftCreateInput } from "./register-revgift";

const haru: Viewer = { userId: "creator-haru", role: "creator" };
const FAN_A = "11111111-1111-4111-8111-111111111111";
const FAN_B = "22222222-2222-4222-8222-222222222222";

function memoryStore(opts: { refuse?: "not_follower" } = {}) {
  const created: RevgiftCreateInput[] = [];
  let n = 0;
  const store: RevgiftStore = {
    async create(input) {
      if (opts.refuse === "not_follower") throw Object.assign(new Error("P0021"), { refusal: "not_follower" as const });
      created.push(input);
      n += 1;
      return { sendId: `send-${n}` };
    },
  };
  return { store, created };
}

describe("역조공 보내기 등록 — 앱 서버 쪽 판정 (INV-R1·R3)", () => {
  it("INV-R3 S3: 팬 셋(소형 둘·중형 하나)이면 결제 금액은 서버 요금표로 17,700원, 몫마다 주문번호가 따로다", async () => {
    const { store, created } = memoryStore();
    const FAN_C = "33333333-3333-4333-8333-333333333333";
    const r = await registerRevgift({ store, viewer: haru }, {
      shares: [
        { fanId: FAN_A, tier: "small" },
        { fanId: FAN_B, tier: "small" },
        { fanId: FAN_C, tier: "medium" },
      ],
    });
    expect(r).toMatchObject({ ok: true, amountKrw: 17700 });
    const input = created[0]!;
    expect(input.senderId).toBe("creator-haru");
    expect(input.charge.totalKrw).toBe(17700);
    expect(input.charge.inspectionFeeKrw).toBe(0);
    expect(new Set(input.shares.map((s) => s.orderNo)).size).toBe(3);
    expect(input.shares.map((s) => s.amountKrw)).toEqual([5400, 5400, 6900]);
    // INV-R11: 몫의 배송비 칸 — 입고 뒤 받지 않음 환불이 이 값을 뺀다
    expect(input.shares.map((s) => s.shippingFeeKrw)).toEqual([4000, 4000, 5000]);
  });

  it("INV-R3 S3d (실패경로): 본문의 금액·보내는 사람 칸은 읽지 않는다", async () => {
    const { store, created } = memoryStore();
    const r = await registerRevgift({ store, viewer: haru }, {
      senderId: "someone-else",
      amountKrw: 1,
      shares: [{ fanId: FAN_A, tier: "small", amountKrw: 1 }],
    });
    expect(r).toMatchObject({ ok: true, amountKrw: 5400 });
    expect(created[0]!.senderId).toBe("creator-haru");
  });

  it("INV-R3 S3b·S3c (실패경로): 받는 팬 0명·11명·같은 팬 두 번·중형 초과 상자는 400", async () => {
    const { store, created } = memoryStore();
    const call = (shares: unknown) => registerRevgift({ store, viewer: haru }, { shares });
    expect((await call([])).ok).toBe(false);
    expect((await call(Array.from({ length: 11 }, (_, i) => ({ fanId: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`, tier: "small" })))).ok).toBe(false);
    expect((await call([{ fanId: FAN_A, tier: "small" }, { fanId: FAN_A, tier: "medium" }])).ok).toBe(false);
    expect((await call([{ fanId: FAN_A, tier: "oversize" }])).ok).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("INV-R1 (실패경로): 크리에이터가 아니면 본문을 읽기 전에 거부된다", async () => {
    const { store, created } = memoryStore();
    for (const viewer of [null, { userId: "fan-1", role: "fan" as const }, { userId: "op-1", role: "operator" as const }]) {
      const r = await registerRevgift({ store, viewer }, { shares: [{ fanId: FAN_A, tier: "small" }] });
      expect(r.ok).toBe(false);
    }
    expect(created).toHaveLength(0);
  });

  it("INV-R1 S1b (실패경로): DB 가 「나를 팔로우하는 팬이 아니다」로 거부하면 403 과 한 가지 문구", async () => {
    const { store } = memoryStore({ refuse: "not_follower" });
    const r = await registerRevgift({ store, viewer: haru }, { shares: [{ fanId: FAN_A, tier: "small" }] });
    expect(r).toEqual({ ok: false, status: 403, message: "나를 팔로우한 팬에게만 보낼 수 있어요." });
  });
});
