import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  adminClient,
  approveRpc,
  creatorActorOf,
  deleteTestOrders,
  ensureApprovalAddress,
  payTestOrder,
  psql,
  psqlError,
  recordSignTx,
  registerTestOrder,
  SEED,
  settleArgs,
  startSignRpc,
} from "./helpers";
import { createTestCreator, removeTestCreator, TEST_CREATOR } from "./test-creator";

// 승인 서명 스펙(docs/specs/approval-signature.md) 중 DB 가 지키는 것.
// 서명자 대조(INV-S4)는 게이트웨이가, 원문 대조(INV-S2)는 앱 서버가 승인 함수를 부르기 전에 한다. DB 는 승인하는 사람·원문 일치·방식·기한을
// 한 번 더 보고(INV-S11·S17), 서명을 승인과 한 처리에서 저장한다(INV-S12). 승인 함수는 manual/0028 의 settle_approval_sign.

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

  it("INV-S6 S6c (실패경로): 결제 뒤 168시간이 지났으면 자동 처리 전이라도 expired, 승인되지 않는다", async () => {
    const o = await paidOrder();
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${o.orderId}'`);
    expect((await approveRpc(o.requestId)).data).toBe("expired");
    const { data } = await adminClient().from("orders").select("approved_at, status").eq("id", o.orderId).single();
    expect(data?.approved_at).toBeNull();
    expect(data?.status).not.toBe("expired"); // 반려는 자동 처리가 한다
  });

  it("INV-S6 S6c (경계): 결제 뒤 167시간이면 아직 기한 안 — 승인된다", async () => {
    const o = await paidOrder();
    psql(`update public.orders set registered_at = now() - interval '167 hours' where id = '${o.orderId}'`);
    expect((await approveRpc(o.requestId)).data).toBe("approved");
    const { data } = await adminClient().from("orders").select("approved_at").eq("id", o.orderId).single();
    expect(data?.approved_at).not.toBeNull();
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

describe("INV-S7: 승인 상태를 바꾸는 입구는 승인 함수(settle_approval_sign) 하나다", () => {
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
  return psql(
    `select coalesce(signed_content, '-') || '|' || coalesce(signer_id, '-') || '|' || content_hash || '|' || signature || '|' || method from public.approval_signatures where request_id = '${requestId}'`,
  );
}

/** 하루로 서명 요청을 만들고 거래 ID 까지 적는다 — 승인 함수 앞까지 */
async function signRequestOf(requestId: string) {
  ensureApprovalAddress(requestId);
  const actor = SEED.creatorProfileId;
  const started = await startSignRpc(requestId, actor);
  expect(started.result).toBe("started");
  await recordSignTx(started.sign_request_id!, actor);
  return { signId: started.sign_request_id!, plaintext: started.plaintext! };
}

describe("INV-S11: 승인은 그 주문의 크리에이터만, 저장한 원문 그대로의 서명으로", () => {
  it("INV-S11 S11b: 다른 크리에이터·팬·빈 계정으로 서명 요청을 만들거나 승인하면 없는 요청과 같은 답이고 아무것도 안 바뀐다", async () => {
    const o = await paidOrder();
    ensureApprovalAddress(o.requestId);
    const missing = (await startSignRpc("apr_NOSUCHREQUEST", MOMO_PROFILE_ID)).result;
    expect(missing).toBe("not_found");
    for (const actor of [MOMO_PROFILE_ID, SEED.fanId, null]) {
      expect((await startSignRpc(o.requestId, actor)).result, String(actor)).toBe(missing);
    }
    expect(psql(`select count(*) from public.approval_sign_requests where approval_request_id = '${o.requestId}'`)).toBe("0");
    const { signId, plaintext } = await signRequestOf(o.requestId);
    const noSuch = (await adminClient().rpc("settle_approval_sign", settleArgs("00000000-0000-4000-8000-000000000000", MOMO_PROFILE_ID, plaintext))).data;
    expect(noSuch).toBe("not_found");
    for (const actor of [MOMO_PROFILE_ID, SEED.fanId, null]) {
      const r = await adminClient().rpc("settle_approval_sign", settleArgs(signId, actor, plaintext));
      expect(r.data, String(actor)).toBe(noSuch);
    }
    expect(psql(`select status from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting");
    expect(psql(`select state from public.approval_sign_requests where id = '${signId}'`)).toBe("pending");
    expect(signatureRow(o.requestId)).toBe("");
  });

  it("INV-S11·S2: 서명된 원문이 한 글자라도 다르거나, 방식이 요청과 다르거나 목록 밖이거나, 서명값이 비면 signature_mismatch — 그 요청은 끝난다", async () => {
    for (const bad of [
      { p_signed_plaintext: "__TAIL__" },
      { p_method: "kakao" },
      { p_method: "password" },
      { p_signature: "" },
      { p_signature: null },
      { p_signed_at: null },
    ]) {
      const o = await paidOrder();
      const { signId, plaintext } = await signRequestOf(o.requestId);
      const over = bad.p_signed_plaintext === "__TAIL__" ? { p_signed_plaintext: `${plaintext} ` } : bad;
      const r = await adminClient().rpc("settle_approval_sign", settleArgs(signId, SEED.creatorProfileId, plaintext, over));
      expect(r.data, JSON.stringify(bad)).toBe("signature_mismatch");
      expect(psql(`select status from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting");
      expect(psql(`select state from public.approval_sign_requests where id = '${signId}'`)).toBe("failed");
      // 끝난 요청의 결과는 다시 받지 않는다 — 「다시 요청」으로 새 요청을 만들어야 한다
      expect((await adminClient().rpc("settle_approval_sign", settleArgs(signId, SEED.creatorProfileId, plaintext))).data).toBe("sign_failed");
    }
  });

  it("INV-S11 (실패경로): 게이트웨이 거래 ID 가 적히지 않은 서명 요청의 결과는 받지 않는다", async () => {
    const o = await paidOrder();
    ensureApprovalAddress(o.requestId);
    const started = await startSignRpc(o.requestId, SEED.creatorProfileId);
    const r = await adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, SEED.creatorProfileId, started.plaintext!));
    expect(r.data).toBe("signature_mismatch");
    expect(psql(`select status from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting");
  });
});

describe("INV-S12: 승인과 서명 저장은 한 처리, 서명은 추가만", () => {
  it("INV-S12 S12: 승인하면 서명값·원문 해시(그 요청 원문의 SHA-256)·서명 시각·방식 fake 가 한 줄 남고, 서명자 식별값·원문 칸은 비어 있다. 고치기·지우기는 서비스 키로도 거부된다", async () => {
    const o = await paidOrder();
    expect((await approveRpc(o.requestId)).data).toBe("approved");
    const plaintext = psql(`select plaintext from public.approval_sign_requests where approval_request_id = '${o.requestId}' and state = 'signed'`);
    const hash = createHash("sha256").update(plaintext, "utf8").digest("hex");
    expect(signatureRow(o.requestId)).toBe(`-|-|${hash}|fake-signature|fake`);
    expect(psql(`select (signed_at is not null) || '|' || (sign_request_id is not null) from public.approval_signatures where request_id = '${o.requestId}'`)).toBe("true|true");
    expect((await adminClient().from("approval_signatures").select("id").eq("request_id", o.requestId)).error?.code).toBe("42501");
    expect(psqlError(`update public.approval_signatures set signature = 'x' where request_id = '${o.requestId}'`)).toMatch(/추가만/);
    expect(psqlError(`delete from public.approval_signatures where request_id = '${o.requestId}'`)).toMatch(/추가만/);
    // 다시 승인해도 서명 줄은 하나
    expect((await approveRpc(o.requestId)).data).toBe("already");
    expect(psql(`select count(*) from public.approval_signatures where request_id = '${o.requestId}'`)).toBe("1");
  });

  it("INV-S12 (실패경로): 새 줄에 서명자 식별값이나 원문을 넣으려 하면 표 제약이 거부한다", async () => {
    const o = await paidOrder();
    expect((await approveRpc(o.requestId)).data).toBe("approved");
    const signId = psql(`select id from public.approval_sign_requests where approval_request_id = '${o.requestId}' and state = 'signed'`);
    // 같은 요청 줄이 이미 있어 유일 제약에도 걸리므로 다른 승인 요청 ID 를 빌린다 — 제약 이름으로 무엇이 막았는지 본다
    const other = await paidOrder();
    const err = psqlError(
      `insert into public.approval_signatures (request_id, signed_content, signer_id, content_hash, signature, method, sign_request_id) values ('${other.requestId}', 'x', 'fake:x', '${"a".repeat(64)}', 's', 'fake', '${signId}')`,
    );
    expect(err).toMatch(/approval_signatures_new_shape/);
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

describe("INV-S7: 옛 승인 입구는 없다", () => {
  it("INV-S7: 서명자 식별값을 받던 승인 함수·옛 원문 읽기 함수는 지워졌다 — 승인 입구는 settle_approval_sign 하나", () => {
    expect(psql(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('approve_request', 'approval_payload_of')`)).toBe("0");
    expect(psql(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'settle_approval_sign'`)).toBe("1");
  });
});

describe("INV-S11: 가짜 서명은 허용 줄이 있는 DB(로컬)에서만 받는다", () => {
  it("INV-S11 S11c: 허용 줄이 없는 DB(운영 DB 와 같은 상태)에서는 가짜 서명 요청도 승인도 거부되고 아무것도 안 바뀐다", async () => {
    const o = await paidOrder();
    const { signId, plaintext } = await signRequestOf(o.requestId);
    const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
    const out = psql(
      `begin; delete from public.local_dev_flags; select public.settle_approval_sign(${q(SEED.creatorProfileId)}::uuid, ${q(signId)}::uuid, ${q(plaintext)}, 'fake-signature', now(), 'fake'); select (public.start_approval_sign(${q(SEED.creatorProfileId)}::uuid, ${q(o.requestId)}, 'fake')).result; rollback;`,
    );
    expect(out.split("\n")).toContain("signature_mismatch");
    expect(out.split("\n")).toContain("method_refused");
    expect(psql(`select status from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting");
    // 로컬 DB 에는 허용 줄이 있어(위 처리는 되돌렸다) 같은 승인이 된다. 서비스 키로는 표를 읽지도 못한다
    expect(psql(`select count(*) from public.local_dev_flags where flag = 'allow_fake_signatures'`)).toBe("1");
    expect((await adminClient().from("local_dev_flags").select("flag")).error?.code).toBe("42501");
    expect((await adminClient().rpc("settle_approval_sign", settleArgs(signId, SEED.creatorProfileId, plaintext))).data).toBe("approved");
  });

  it("INV-S12: 서명 표는 통째로 비우기도 막힌다", () => {
    expect(psqlError(`truncate public.approval_signatures`)).toMatch(/추가만/);
  });
});

describe("INV-S13: 받는 주소가 없는 크리에이터의 승인은 거부된다 (manual/0017 뒤)", () => {
  // 주소 칸을 마음대로 비울 수 있는 시험 전용 크리에이터를 쓴다 — 시드 크리에이터의 주소(하루의 진짜 봉투)는 건드리지 않는다.
  const creatorId = TEST_CREATOR.creatorId;
  beforeAll(() => {
    createTestCreator();
  });
  afterAll(() => {
    deleteTestOrders(); // 시험 크리에이터를 가리키는 주문이 남으면 다음 파일의 시험 크리에이터 정리가 멈춘다
    removeTestCreator();
  });

  async function orderWithoutAddress() {
    psql(`delete from pii.creator_addresses where creator_id = '${creatorId}'`);
    const o = await registerTestOrder(1, { creatorId });
    const requestId = await payTestOrder(o);
    return { ...o, requestId };
  }

  it("INV-S13 S13 (실패경로): 주소 칸이 없으면 유효한 서명이어도 no_address — 승인·서명 기록이 남지 않는다", async () => {
    const o = await orderWithoutAddress();
    // 서명 요청 만들기가 먼저 거부한다 — 카카오톡을 보내지 않는다
    expect((await startSignRpc(o.requestId)).result).toBe("no_address");
    expect(psql(`select count(*) from public.approval_sign_requests where approval_request_id = '${o.requestId}'`)).toBe("0");
    // 서명 요청을 만든 뒤 주소가 지워졌어도 승인 함수가 같은 답을 한다
    ensureApprovalAddress(o.requestId);
    const started = await startSignRpc(o.requestId);
    await recordSignTx(started.sign_request_id!, creatorActorOf(o.requestId));
    psql(`delete from pii.creator_addresses where creator_id = '${creatorId}'`);
    const r = await adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, creatorActorOf(o.requestId), started.plaintext!));
    expect(r.error).toBeNull();
    expect(r.data).toBe("no_address");
    // 서명 요청은 기한까지 그대로 기다린다 — 주소를 등록하고 다시 누르면 같은 요청을 이어 본다
    expect(psql(`select state from public.approval_sign_requests where id = '${started.sign_request_id}'`)).toBe("pending");
    expect(psql(`select status from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting");
    expect(psql(`select coalesce(approved_at::text, 'null') from public.orders where id = '${o.orderId}'`)).toBe("null");
    expect(psql(`select count(*) from public.approval_signatures where request_id = '${o.requestId}'`)).toBe("0");
  });

  it("INV-S13 S13b: 같은 주문도 주소를 등록한 뒤에는 승인된다", async () => {
    const o = await orderWithoutAddress();
    expect((await approveRpc(o.requestId, { ensureAddress: false })).data).toBe("no_address");
    ensureApprovalAddress(o.requestId);
    expect((await approveRpc(o.requestId, { ensureAddress: false })).data).toBe("approved");
  });
});
