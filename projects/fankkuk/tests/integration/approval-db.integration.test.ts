import { describe, expect, it } from "vitest";
import { adminClient, approveArgs, approveRpc, payTestOrder, psql, psqlError, registerTestOrder, SEED, signedInClient } from "./helpers";

// 승인 서명 스펙(docs/specs/approval-signature.md) 중 DB 가 지키는 것.
// 서명 검증(INV-S2~S4)은 앱 서버가 approve_request 를 부르기 전에 한다. DB 는 승인하는 사람·원문 일치를 한 번 더 보고(INV-S11),
// 서명을 승인과 한 처리에서 저장한다(INV-S12).

async function paidOrder() {
  const o = await registerTestOrder();
  const requestId = await payTestOrder(o);
  return { ...o, requestId };
}

describe("INV-S5: 한 요청 ID 는 한 번만 승인 처리된다", () => {
  it("INV-S5 S5: 같은 요청을 다시 승인하면 아무것도 바꾸지 않고 already 를 돌려준다", async () => {
    const o = await paidOrder();
    const first = await approveRpc(o.requestId);
    expect(first.data).toBe("approved");
    const { data: before } = await adminClient().from("orders").select("approved_at").eq("id", o.orderId).single();

    const second = await approveRpc(o.requestId);
    expect(second.data).toBe("already");
    const { data: after } = await adminClient().from("orders").select("approved_at").eq("id", o.orderId).single();
    expect(after?.approved_at).toBe(before?.approved_at);
    const { data: approved } = await adminClient().from("approval_requests").select("id").eq("order_id", o.orderId).eq("status", "approved");
    expect(approved).toHaveLength(1);
  });

  it("INV-S5 S5b: 같은 요청이 동시에 두 번 와도 승인은 한 번이다", async () => {
    const o = await paidOrder();
    const results = await Promise.all([
      approveRpc(o.requestId),
      approveRpc(o.requestId),
    ]);
    expect(results.map((r) => r.data).sort()).toEqual(["already", "approved"]);
  });

  it("INV-S5: 한 주문에 승인된 요청은 DB 제약으로도 하나다 — 막음을 켠 채로 두 번째 승인 요청을 넣어도 거부", async () => {
    const o = await paidOrder();
    await approveRpc(o.requestId);
    // 승인 입구 막음(INV-S7)을 켠 상태로 넣어 유일 제약만 남긴다
    const err = psqlError(
      `begin; select set_config('fankkuk.approving','on',true); insert into public.approval_requests (request_id, order_id, payload, created_at, status, decided_at) values ('${o.requestId}x', '${o.orderId}', 'x', now(), 'approved', now()); commit;`,
    );
    expect(err).toMatch(/approval_requests_one_approved|duplicate key/);
  });
});

describe("INV-S6: 승인할 수 없는 주문은 승인하지 않는다", () => {
  it("INV-S6 S6: 거절된 주문의 요청은 승인되지 않는다", async () => {
    const o = await paidOrder();
    expect((await adminClient().from("orders").update({ status: "rejected" }).eq("id", o.orderId)).error).toBeNull();
    const r = await approveRpc(o.requestId);
    expect(r.data).toBe("not_approvable");
    const { data } = await adminClient().from("orders").select("approved_at").eq("id", o.orderId).single();
    expect(data?.approved_at).toBeNull();
  });

  it("INV-S6 S6: 7일 자동 반려·취소·검수 반송된 주문은 승인되지 않는다", async () => {
    for (const change of [{ status: "expired" }, { status: "canceled" }, { inspection_result: "returned", inspected_at: new Date().toISOString() }]) {
      const o = await paidOrder();
      expect((await adminClient().from("orders").update(change).eq("id", o.orderId)).error).toBeNull();
      const r = await approveRpc(o.requestId);
      expect(r.data, JSON.stringify(change)).toBe("not_approvable");
    }
  });

  it("INV-S6: 이미 받지 않음으로 처리된 요청은 승인되지 않는다", async () => {
    const o = await paidOrder();
    await adminClient().from("approval_requests").update({ status: "declined", decided_at: new Date().toISOString() }).eq("request_id", o.requestId);
    expect((await approveRpc(o.requestId)).data).toBe("not_approvable");
  });

  it("INV-S6: 없는 요청 ID 는 not_found", async () => {
    const r = await approveRpc("apr_NOSUCHREQUEST");
    expect(r.data).toBe("not_found");
  });
});

describe("INV-S7: 승인 상태를 바꾸는 입구는 approve_request 하나다", () => {
  it("INV-S7 S7: 앱 서버 키로 주문의 승인 시각을 직접 고치면 DB 가 거부한다", async () => {
    const o = await paidOrder();
    const { error } = await adminClient().from("orders").update({ approved_at: new Date().toISOString() }).eq("id", o.orderId);
    expect(error?.code).toBe("42501");
    const { data } = await adminClient().from("orders").select("approved_at").eq("id", o.orderId).single();
    expect(data?.approved_at).toBeNull();
  });

  it("INV-S7: 앱 서버 키로 요청 상태를 approved 로 직접 고치면 DB 가 거부한다", async () => {
    const o = await paidOrder();
    const { error } = await adminClient()
      .from("approval_requests")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("request_id", o.requestId);
    expect(error?.code).toBe("42501");
  });

  it("INV-S7: 승인된 채로 주문을 새로 넣는 것도 거부한다", async () => {
    const { error } = await adminClient().from("orders").insert({
      order_no: "FC-TAPPRIN",
      fan_id: "00000000-0000-4000-a000-000000000001",
      creator_id: "00000000-0000-4000-b000-000000000001",
      item_kind: "시험 선물",
      has_electronics_or_metal: false,
      status: "registered",
      registered_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
    });
    expect(error?.code).toBe("42501");
  });

  it("INV-S7: 승인된 채로 승인 요청을 새로 넣는 것도 거부한다", async () => {
    const o = await paidOrder();
    const { error } = await adminClient()
      .from("approval_requests")
      .insert({ request_id: `${o.requestId}b`, order_id: o.orderId, payload: "x", created_at: new Date().toISOString(), status: "approved", decided_at: new Date().toISOString() });
    expect(error?.code).toBe("42501");
  });

  it("INV-S7: 승인된 요청을 다른 상태로 되돌리는 것도 거부한다", async () => {
    const o = await paidOrder();
    await approveRpc(o.requestId);
    const { error } = await adminClient().from("approval_requests").update({ status: "declined" }).eq("request_id", o.requestId);
    expect(error?.code).toBe("42501");
  });

  it("INV-S7: 승인이 아닌 상태 변경(거절)은 막지 않는다 — 막음이 승인에만 걸려 있는지", async () => {
    const o = await paidOrder();
    const { error } = await adminClient()
      .from("approval_requests")
      .update({ status: "declined", decided_at: new Date().toISOString() })
      .eq("request_id", o.requestId);
    expect(error).toBeNull();
  });
});

const MOMO_PROFILE_ID = "00000000-0000-4000-a000-000000000012";

function signatureRow(requestId: string): string {
  return psql(`select signed_content || '|' || signer_id || '|' || method from public.approval_signatures where request_id = '${requestId}'`);
}

describe("INV-S11: 승인은 그 주문의 크리에이터만, 저장한 원문 그대로의 서명으로", () => {
  it("INV-S11 S11b: 다른 크리에이터·팬·빈 계정으로 승인하면 없는 요청과 같은 답이고 아무것도 안 바뀐다", async () => {
    const o = await paidOrder();
    const good = approveArgs(o.requestId);
    const missing = (await adminClient().rpc("approve_request", { ...approveArgs("apr_NOSUCHREQUEST"), p_actor_id: MOMO_PROFILE_ID })).data;
    expect(missing).toBe("not_found");
    for (const actor of [MOMO_PROFILE_ID, SEED.fanId, null]) {
      const r = await adminClient().rpc("approve_request", { ...good, p_actor_id: actor, p_signer_id: `fake:${actor}` });
      expect(r.data, String(actor)).toBe(missing);
    }
    expect(psql(`select status from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting");
    expect(signatureRow(o.requestId)).toBe("");
  });

  it("INV-S11·S2: 원문이 다르거나, fake 서명자가 그 크리에이터가 아니거나, 방식이 목록 밖이면 signature_mismatch", async () => {
    const o = await paidOrder();
    const good = approveArgs(o.requestId);
    for (const bad of [
      { p_signed_content: `${good.p_signed_content} ` },
      { p_signer_id: `fake:${MOMO_PROFILE_ID}` },
      { p_signer_id: "" },
      { p_method: "password" },
    ]) {
      const r = await adminClient().rpc("approve_request", { ...good, ...bad });
      expect(r.data, JSON.stringify(bad)).toBe("signature_mismatch");
    }
    expect(psql(`select status from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting");
    expect((await approveRpc(o.requestId)).data).toBe("approved");
  });
});

describe("INV-S12: 승인과 서명 저장은 한 처리, 서명은 추가만", () => {
  it("INV-S12 S12: 승인하면 저장한 원문·서명자·방식 fake 가 한 줄 남고, 고치기·지우기는 서비스 키로도 거부된다", async () => {
    const o = await paidOrder();
    const a = approveArgs(o.requestId);
    expect((await approveRpc(o.requestId)).data).toBe("approved");
    expect(signatureRow(o.requestId)).toBe(`${a.p_signed_content}|fake:${SEED.creatorProfileId}|fake`);
    expect((await adminClient().from("approval_signatures").select("id").eq("request_id", o.requestId)).error?.code).toBe("42501");
    expect(psqlError(`update public.approval_signatures set signer_id = 'x' where request_id = '${o.requestId}'`)).toMatch(/추가만/);
    expect(psqlError(`delete from public.approval_signatures where request_id = '${o.requestId}'`)).toMatch(/추가만/);
    // 다시 승인해도 서명 줄은 하나
    expect((await approveRpc(o.requestId)).data).toBe("already");
    expect(psql(`select count(*) from public.approval_signatures where request_id = '${o.requestId}'`)).toBe("1");
  });

  it("INV-S12 S12b: 서명 저장이 실패하면 승인도 남지 않는다", async () => {
    const o = await paidOrder();
    // 같은 요청의 서명 줄을 먼저 넣어 두면 승인 함수의 서명 저장이 유일 제약에 걸린다
    psql(`insert into public.approval_signatures (request_id, signed_content, signer_id, method) values ('${o.requestId}', 'x', 'fake:x', 'fake')`);
    const r = await approveRpc(o.requestId);
    expect(r.error).not.toBeNull();
    expect(psql(`select status || '|' || coalesce((select approved_at::text from public.orders where id = '${o.orderId}'), '-') from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting|-");
  });
});

describe("INV-S11: 승인할 원문은 그 주문의 크리에이터에게만", () => {
  it("INV-S11 S11b: 하루에게는 원문이, 모모·팬·없는 요청에는 빈 결과가 온다. 로그인 토큰으로는 부르지 못한다", async () => {
    const o = await paidOrder();
    const payload = psql(`select payload from public.approval_requests where request_id = '${o.requestId}'`);
    const read = (actor: string, requestId = o.requestId) =>
      adminClient().rpc("approval_payload_of", { p_request_id: requestId, p_actor_id: actor });
    expect((await read(SEED.creatorProfileId)).data).toBe(payload);
    expect((await read(MOMO_PROFILE_ID)).data).toBeNull();
    expect((await read(SEED.fanId)).data).toBeNull();
    expect((await read(SEED.creatorProfileId, "apr_NOSUCHREQUEST")).data).toBeNull();
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("approval_payload_of", { p_request_id: o.requestId, p_actor_id: SEED.creatorProfileId })).error?.code).toBe("42501");
  });
});
