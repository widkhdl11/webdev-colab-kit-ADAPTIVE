import { describe, expect, it } from "vitest";
import { adminClient, anonClient, approveArgs, payTestOrder, registerTestOrder, signedInClient } from "./helpers";

// 카드 d9 완료 조건: 화면은 표를 직접 읽지 못하고, 읽기 함수는 로그인한 사람의 것만 돌려준다.

describe("읽기 함수는 로그인한 사람의 것만 돌려준다", () => {
  it("팬은 자기 선물만 본다 — 다른 팬의 주문번호로 물어도 빈 결과", async () => {
    const byeolbit = await signedInClient("byeolbit_fan");
    const daltokki = await signedInClient("daltokki_fan");

    const mine = await byeolbit.rpc("my_gifts");
    expect(mine.error).toBeNull();
    expect((mine.data as { order_no: string }[]).map((g) => g.order_no)).toContain("FC-7K3M9");
    expect((mine.data as { order_no: string }[]).map((g) => g.order_no)).not.toContain("FC-L5T6B");

    const other = await daltokki.rpc("my_gift", { p_order_no: "FC-7K3M9" });
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it("팬에게는 크리에이터행 송장번호 칸이 가지 않는다", async () => {
    const byeolbit = await signedInClient("byeolbit_fan");
    const r = await byeolbit.rpc("my_gift", { p_order_no: "FC-7K3M9" });
    const row = (r.data as Record<string, unknown>[])[0]!;
    expect(row.order_no).toBe("FC-7K3M9");
    expect(Object.keys(row)).not.toContain("outbound_waybill_no");
    expect(Object.values(row)).not.toContain("612345678901");
  });

  it("결제가 끝나지 않은 선물은 팬 목록에도, 크리에이터 승인 요청에도 없다", async () => {
    const o = await registerTestOrder();
    const byeolbit = await signedInClient("byeolbit_fan");
    const haru = await signedInClient("haru_creator");
    const gifts = (await byeolbit.rpc("my_gifts")).data as { order_no: string }[];
    const reqs = (await haru.rpc("my_creator_action_items")).data as { order_no: string }[];
    expect(gifts.map((g) => g.order_no)).not.toContain(o.orderNo);
    expect(reqs.map((g) => g.order_no)).not.toContain(o.orderNo);

    await payTestOrder(o);
    const gifts2 = (await byeolbit.rpc("my_gifts")).data as { order_no: string }[];
    const reqs2 = (await haru.rpc("my_creator_action_items")).data as { order_no: string }[];
    expect(gifts2.map((g) => g.order_no)).toContain(o.orderNo);
    expect(reqs2.map((g) => g.order_no)).toContain(o.orderNo);
  });

  it("크리에이터는 자기에게 온 요청만 본다 — 하루의 요청은 모모에게, 모모의 요청은 하루에게 안 보인다", async () => {
    const haru = await signedInClient("haru_creator");
    const momo = await signedInClient("momo_creator");
    const haruWaiting = ((await haru.rpc("my_creator_action_items")).data as { order_no: string }[]).map((r) => r.order_no);
    const momoWaiting = ((await momo.rpc("my_creator_action_items")).data as { order_no: string }[]).map((r) => r.order_no);
    expect(haruWaiting).toEqual(expect.arrayContaining(["FC-P4X7N", "FC-L5T6B", "FC-Z9C3V"]));
    expect(haruWaiting).not.toContain("FC-W5N3T");
    expect(momoWaiting).toContain("FC-W5N3T");
    expect(momoWaiting).not.toContain("FC-P4X7N");

    const haruDecided = ((await haru.rpc("my_decided_requests")).data as { order_no: string }[]).map((r) => r.order_no);
    const momoDecided = ((await momo.rpc("my_decided_requests")).data as { order_no: string }[]).map((r) => r.order_no);
    expect(haruDecided).toEqual(expect.arrayContaining(["FC-7K3M9", "FC-A1B2C"]));
    expect(haruDecided).not.toContain("FC-M3N4P");
    expect(momoDecided).toEqual(expect.arrayContaining(["FC-R2D8Q", "FC-M3N4P"]));
    expect(momoDecided).not.toContain("FC-7K3M9");
  });

  it("처리한 요청도 팬이 부르면 빈 결과, 로그인하지 않으면 거부", async () => {
    const byeolbit = await signedInClient("byeolbit_fan");
    expect((await byeolbit.rpc("my_decided_requests")).data).toEqual([]);
    expect((await anonClient().rpc("my_decided_requests")).error?.code).toBe("42501");
  });

  it("승인 요청은 그 크리에이터 계정에게만 — 팬이 부르면 빈 결과", async () => {
    const byeolbit = await signedInClient("byeolbit_fan");
    const r = await byeolbit.rpc("my_creator_action_items");
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
  });

  it("표를 직접 읽거나 쓰기 함수를 부르는 것은 로그인해도 막힌다", async () => {
    const byeolbit = await signedInClient("byeolbit_fan");
    for (const client of [byeolbit, anonClient()]) {
      for (const t of ["orders", "payments", "profiles", "approval_requests", "decrypt_log", "creators"]) {
        const r = await client.from(t).select("*").limit(1);
        expect(r.error?.code, t).toBe("42501");
      }
      const w = await client.rpc("approve_request", approveArgs("apr_FCP4X7N"));
      expect(w.error?.code).toBe("42501");
      const c = await client.rpc("claim_payment", { p_toss_order_id: "pay_seed_fcp4x7n" });
      expect(c.error?.code).toBe("42501");
    }
    // 시드의 대기 요청이 그대로인지
    const { data } = await adminClient().from("approval_requests").select("status").eq("request_id", "apr_FCP4X7N").single();
    expect(data?.status).toBe("waiting");
  });

  it("로그인하지 않으면 읽기 함수도 부를 수 없다", async () => {
    const r = await anonClient().rpc("my_gifts");
    expect(r.error?.code).toBe("42501");
  });
});
