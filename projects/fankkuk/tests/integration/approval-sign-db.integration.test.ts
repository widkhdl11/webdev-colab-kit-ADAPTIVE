import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { buildApprovalPlaintext, parseApprovalPlaintext } from "@/entities/order/model/approval-plaintext";
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
  unlinkTestSignature,
  linkTestSignature,
} from "./helpers";

// 승인 서명 요청 — 「승인」 누를 때 서명 요청 → 기다림 → 승인됨/다시 요청 (approval-signature INV-S1·S12·S16·S17, 2026-10-29 (2)).
// 표·원문 함수·결과 읽기는 마이그레이션 20261029000010, 서명 요청 만들기·승인 함수는 manual/0028(사람이 적용).
// 0028 이 적용되지 않은 DB 에서는 start_approval_sign·settle_approval_sign 을 찾지 못해 이 파일의 해당 시험이 실패한다 — 그대로 실패로 둔다.

const MOMO_PROFILE_ID = "00000000-0000-4000-a000-000000000012";

afterAll(() => {
  deleteTestOrders();
});

async function paidOrder(boxCount = 1) {
  const o = await registerTestOrder(boxCount);
  const requestId = await payTestOrder(o);
  ensureApprovalAddress(requestId);
  return { ...o, requestId };
}

const signRows = (requestId: string) => Number(psql(`select count(*) from public.approval_sign_requests where approval_request_id = '${requestId}'`));
const sql = (v: string) => `'${v.replace(/'/g, "''")}'`;

describe("INV-S1: 원문은 주문번호·보낸 팬 닉네임·선물 종류·개수 네 값뿐 — 서버가 주문에서 만든다", () => {
  it("INV-S1 S1: 별빛이 하루에게 상자 2개를 결제한 주문 → 원문은 주문번호·「별빛」·선물 종류·2 네 줄이고, 팬이 쓴 물품 이름·주소·실명이 없다. 앱의 원문 꼴과 같은 글이다", async () => {
    const o = await paidOrder(2);
    // 이 주문의 종류는 「꽃」 — 시험 주문은 기타 + 팬의 글 「시험 선물」로 등록되므로 종류 칸만 바꾼다(트리거를 끄고, 준비 한 줄)
    psql(`begin; set local session_replication_role = replica; update public.orders set item_category = 'flower' where id = '${o.orderId}'; commit;`);
    const started = await startSignRpc(o.requestId);
    expect(started.result).toBe("started");
    const nickname = psql(`select nickname from public.profiles where id = '${SEED.fanId}'`);
    expect(started.plaintext).toBe(buildApprovalPlaintext({ orderNo: o.orderNo, fanNickname: nickname, giftKind: "꽃", boxCount: 2 }));
    expect(parseApprovalPlaintext(started.plaintext!)).toEqual({ orderNo: o.orderNo, fanNickname: nickname, giftKind: "꽃", boxCount: 2 });
    expect(started.plaintext).not.toContain("시험 선물");
    // 원문은 요청마다 저장한다 — 저장된 원문이 돌려준 원문과 같다
    expect(psql(`select plaintext from public.approval_sign_requests where id = '${started.sign_request_id}'`)).toBe(started.plaintext);
  });

  it("INV-S1: 선물 종류가 기타면 「기타」 — 팬이 직접 쓴 글(물품 이름)은 원문에 들어가지 않는다", async () => {
    const o = await paidOrder(1);
    const started = await startSignRpc(o.requestId);
    expect(parseApprovalPlaintext(started.plaintext!)?.giftKind).toBe("기타");
    expect(started.plaintext).not.toContain("시험 선물");
  });

  it("INV-S1 S1b (실패경로): 원문 함수에 주소·메모 칸을 섞어 부르면 그런 함수가 없다 — 원문이 만들어지지 않는다", () => {
    expect(psql(`select public.approval_sign_plaintext('FC-ABC123', '별빛', '꽃', 2)`)).toBe("주문번호: FC-ABC123\n보낸 팬: 별빛\n선물 종류: 꽃\n개수: 2");
    expect(psqlError(`select public.approval_sign_plaintext('FC-ABC123', '별빛', '꽃', 2, '서울시 강남구 테헤란로 1')`)).toMatch(/does not exist/);
    expect(psqlError(`select public.approval_sign_plaintext(p_order_no => 'FC-ABC123', p_fan_nickname => '별빛', p_gift_kind => '꽃', p_box_count => 2, p_memo => '사랑해요')`)).toMatch(/does not exist/);
  });

  it("INV-S1 (실패경로): 목록 밖의 선물 종류(팬이 쓴 글)·칸 안의 줄바꿈·꼴이 틀린 주문번호·개수 0 은 거부", () => {
    for (const call of [
      `'FC-ABC123', '별빛', '손편지와 사진', 2`,
      `'FC-ABC123', E'별빛\\n주소: 서울', '꽃', 2`,
      `'fc-1', '별빛', '꽃', 2`,
      `'FC-ABC123', '별빛', '꽃', 0`,
    ]) {
      expect(psqlError(`select public.approval_sign_plaintext(${call})`), call).toMatch(/22023|꼴|목록/);
    }
  });
});

describe("INV-S17: 서명 요청은 「승인」을 누를 때만, 주문당 기다리는 요청 하나", () => {
  it("INV-S17 S17: 결제 직후에는 서명 요청 줄이 없다. 「승인」 → 서명 요청 하나(5분 기한), 서명 완료 뒤 확인 → 승인됨", async () => {
    const o = await paidOrder();
    expect(signRows(o.requestId)).toBe(0);
    const started = await startSignRpc(o.requestId);
    expect(started.result).toBe("started");
    expect(signRows(o.requestId)).toBe(1);
    expect(psql(`select state || '|' || (expires_at - created_at)::text from public.approval_sign_requests where id = '${started.sign_request_id}'`)).toBe("pending|00:05:00");
    // 결과 확인 함수는 그 요청을 기다림으로 보인다
    const cur = await adminClient().rpc("approval_sign_current", { p_actor_id: SEED.creatorProfileId, p_request_id: o.requestId });
    expect((cur.data as { result: string; state: string }[])[0]).toMatchObject({ result: "found", state: "pending", sign_request_id: started.sign_request_id });
    await recordSignTx(started.sign_request_id!, SEED.creatorProfileId);
    expect((await adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, SEED.creatorProfileId, started.plaintext!))).data).toBe("approved");
    const after = await adminClient().rpc("approval_sign_current", { p_actor_id: SEED.creatorProfileId, p_request_id: o.requestId });
    expect((after.data as { result: string }[])[0]?.result).toBe("approved");
    expect(psql(`select state from public.approval_sign_requests where id = '${started.sign_request_id}'`)).toBe("signed");
  });

  it("INV-S17 S17b: 기다리는 요청이 있으면 「승인」을 다시 눌러도 새 요청을 만들지 않고 그 요청을 돌려준다(봉투 없음 — 카카오톡을 다시 보내지 않는다)", async () => {
    const o = await paidOrder();
    const first = await startSignRpc(o.requestId);
    const again = await startSignRpc(o.requestId);
    expect(again).toMatchObject({ result: "pending", sign_request_id: first.sign_request_id, plaintext: first.plaintext, envelope: null });
    expect(first.envelope).not.toBeNull();
    expect(signRows(o.requestId)).toBe(1);
  });

  it("INV-S17 S17b (동시): 두 탭에서 동시에 「승인」 → 요청은 하나", async () => {
    const o = await paidOrder();
    const results = await Promise.all([startSignRpc(o.requestId), startSignRpc(o.requestId), startSignRpc(o.requestId)]);
    expect(results.map((r) => r.result).sort()).toEqual(["pending", "pending", "started"]);
    expect(new Set(results.map((r) => r.sign_request_id)).size).toBe(1);
    expect(signRows(o.requestId)).toBe(1);
  });

  it("INV-S17: 주문당 기다리는 요청 하나는 DB 제약으로도 — 기다리는 줄을 하나 더 넣으면 거부", async () => {
    const o = await paidOrder();
    await startSignRpc(o.requestId);
    const err = psqlError(
      `insert into public.approval_sign_requests (approval_request_id, plaintext, method, created_at, expires_at) values ('${o.requestId}', 'x', 'fake', now(), now() + interval '5 minutes')`,
    );
    expect(err).toMatch(/approval_sign_requests_one_pending|duplicate key/);
    expect(psqlError(`insert into public.approval_sign_requests (approval_request_id, plaintext, method, created_at, expires_at, state, finished_at) values ('${o.requestId}', 'x', 'fake', now(), now() + interval '10 minutes', 'failed', now())`)).toMatch(
      /approval_sign_requests_five_minutes/,
    );
  });

  it("INV-S17 S17c (실패경로): 만든 지 5분 1초 지난 요청의 서명 결과는 받지 않는다 — sign_expired, 「다시 요청」 → 새 요청", async () => {
    const o = await paidOrder();
    const started = await startSignRpc(o.requestId);
    await recordSignTx(started.sign_request_id!, SEED.creatorProfileId);
    psql(`update public.approval_sign_requests set created_at = created_at - interval '5 minutes 1 second', expires_at = expires_at - interval '5 minutes 1 second' where id = '${started.sign_request_id}'`);
    expect((await adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, SEED.creatorProfileId, started.plaintext!))).data).toBe("sign_expired");
    expect(psql(`select status from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting");
    expect(psql(`select count(*) from public.approval_signatures where request_id = '${o.requestId}'`)).toBe("0");
    expect(psql(`select state from public.approval_sign_requests where id = '${started.sign_request_id}'`)).toBe("expired");
    const again = await startSignRpc(o.requestId);
    expect(again.result).toBe("started");
    expect(again.sign_request_id).not.toBe(started.sign_request_id);
  });

  it("INV-S17 S17c (경계): 4분 59초 지난 요청은 아직 받는다", async () => {
    const o = await paidOrder();
    const started = await startSignRpc(o.requestId);
    await recordSignTx(started.sign_request_id!, SEED.creatorProfileId);
    psql(`update public.approval_sign_requests set created_at = created_at - interval '4 minutes 59 seconds', expires_at = expires_at - interval '4 minutes 59 seconds' where id = '${started.sign_request_id}'`);
    expect((await adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, SEED.creatorProfileId, started.plaintext!))).data).toBe("approved");
  });

  it("INV-S17: 결과 확인 함수는 기한 지난 기다림을 expired 로 적고, 거래 ID 는 한 번만 적힌다", async () => {
    const o = await paidOrder();
    const started = await startSignRpc(o.requestId);
    expect(await recordSignTx(started.sign_request_id!, SEED.creatorProfileId, "tx_first")).toBe("recorded");
    expect(await recordSignTx(started.sign_request_id!, SEED.creatorProfileId, "tx_second")).toBe("not_pending");
    expect(await recordSignTx(started.sign_request_id!, MOMO_PROFILE_ID, "tx_other")).toBe("not_found");
    psql(`update public.approval_sign_requests set created_at = created_at - interval '6 minutes', expires_at = expires_at - interval '6 minutes' where id = '${started.sign_request_id}'`);
    const cur = await adminClient().rpc("approval_sign_current", { p_actor_id: SEED.creatorProfileId, p_request_id: o.requestId });
    expect((cur.data as { state: string; gateway_tx_id: string; plaintext: string | null }[])[0]).toMatchObject({ state: "expired", gateway_tx_id: "tx_first", plaintext: null });
    expect(psql(`select state from public.approval_sign_requests where id = '${started.sign_request_id}'`)).toBe("expired");
  });

  it("INV-S17 S17c (실패경로): 같은 주문의 새 요청은 하루 다섯 번까지 — 여섯 번째는 too_many_day, 줄이 생기지 않는다", async () => {
    const o = await paidOrder();
    for (let i = 0; i < 5; i += 1) {
      const r = await startSignRpc(o.requestId);
      expect(r.result, String(i)).toBe("started");
      expect(await adminClient().rpc("close_approval_sign", { p_actor_id: SEED.creatorProfileId, p_sign_request_id: r.sign_request_id, p_outcome: "failed" })).toMatchObject({ data: "closed" });
    }
    expect((await startSignRpc(o.requestId)).result).toBe("too_many_day");
    expect(signRows(o.requestId)).toBe(5);
  });

  it("INV-S17 S17d (실패경로): 다른 크리에이터가 그 요청의 결과를 묻거나 끝내거나 승인하면 없는 요청과 같은 답, 아무것도 안 바뀐다", async () => {
    const o = await paidOrder();
    const started = await startSignRpc(o.requestId);
    await recordSignTx(started.sign_request_id!, SEED.creatorProfileId);
    const missing = await adminClient().rpc("approval_sign_current", { p_actor_id: MOMO_PROFILE_ID, p_request_id: "apr_NOSUCHREQUEST" });
    const other = await adminClient().rpc("approval_sign_current", { p_actor_id: MOMO_PROFILE_ID, p_request_id: o.requestId });
    expect(other.data).toEqual(missing.data);
    expect((other.data as { result: string }[])[0]?.result).toBe("not_found");
    expect((await adminClient().rpc("close_approval_sign", { p_actor_id: MOMO_PROFILE_ID, p_sign_request_id: started.sign_request_id, p_outcome: "failed" })).data).toBe("not_found");
    expect((await adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, MOMO_PROFILE_ID, started.plaintext!))).data).toBe("not_found");
    expect(psql(`select state from public.approval_sign_requests where id = '${started.sign_request_id}'`)).toBe("pending");
    expect(psql(`select status from public.approval_requests where request_id = '${o.requestId}'`)).toBe("waiting");
  });

  it("INV-S17·S5 (동시): 같은 서명 결과가 동시에 두 번 와도 승인은 한 번, 서명 기록 하나", async () => {
    const o = await paidOrder();
    const started = await startSignRpc(o.requestId);
    await recordSignTx(started.sign_request_id!, SEED.creatorProfileId);
    const args = settleArgs(started.sign_request_id!, SEED.creatorProfileId, started.plaintext!);
    const results = await Promise.all([adminClient().rpc("settle_approval_sign", args), adminClient().rpc("settle_approval_sign", args)]);
    expect(results.map((r) => r.data).sort()).toEqual(["already", "approved"]);
    expect(psql(`select count(*) from public.approval_signatures where request_id = '${o.requestId}'`)).toBe("1");
  });

  it("INV-S17 (실패경로): 로그인 키로는 서명 요청을 만들거나 결과를 읽거나 거래 ID 를 적지 못한다", async () => {
    const o = await paidOrder();
    const { signedInClient } = await import("./helpers");
    const haru = await signedInClient("haru_creator");
    for (const [fn, args] of [
      ["start_approval_sign", { p_actor_id: SEED.creatorProfileId, p_request_id: o.requestId, p_method: "fake" }],
      ["approval_sign_current", { p_actor_id: SEED.creatorProfileId, p_request_id: o.requestId }],
      ["record_approval_sign_tx", { p_actor_id: SEED.creatorProfileId, p_sign_request_id: "00000000-0000-4000-8000-000000000000", p_tx_id: "x" }],
      ["close_approval_sign", { p_actor_id: SEED.creatorProfileId, p_sign_request_id: "00000000-0000-4000-8000-000000000000", p_outcome: "failed" }],
    ] as const) {
      expect((await haru.rpc(fn, args)).error?.code, fn).toBe("42501");
    }
    expect((await haru.from("approval_sign_requests").select("id")).error?.code).toBe("42501");
  });
});

describe("INV-S16·S6·S15: 서명 요청을 만들 수 없는 주문", () => {
  it("INV-S16 (실패경로): 승인 서명이 연결되지 않은 크리에이터의 주문은 not_linked — 서명 요청이 생기지 않는다", async () => {
    const o = await paidOrder();
    const creatorId = psql(`select creator_id from public.orders where id = '${o.orderId}'`);
    const saved = psql(`select envelope::text || '|' || method from pii.signature_links where creator_id = '${creatorId}'`);
    unlinkTestSignature(creatorId);
    try {
      expect((await startSignRpc(o.requestId)).result).toBe("not_linked");
      expect(signRows(o.requestId)).toBe(0);
    } finally {
      const cut = saved.lastIndexOf("|");
      if (saved) psql(`insert into pii.signature_links (creator_id, envelope, method) values ('${creatorId}', ${sql(saved.slice(0, cut))}::jsonb, ${sql(saved.slice(cut + 1))}) on conflict (creator_id) do nothing`);
      else linkTestSignature(creatorId);
    }
  });

  it("INV-S6 S6c (실패경로): 결제 뒤 168시간이 지난 주문은 expired, 거절된 주문은 not_approvable, 이미 승인된 주문은 already", async () => {
    const late = await paidOrder();
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${late.orderId}'`);
    expect((await startSignRpc(late.requestId)).result).toBe("expired");
    const no = await paidOrder();
    expect((await adminClient().from("orders").update({ status: "rejected" }).eq("id", no.orderId)).error).toBeNull();
    expect((await startSignRpc(no.requestId)).result).toBe("not_approvable");
    const done = await paidOrder();
    expect((await approveRpc(done.requestId)).data).toBe("approved");
    expect((await startSignRpc(done.requestId)).result).toBe("already");
  });

  it("INV-S6 (실패경로): 서명 요청을 만든 뒤 168시간이 지나면 승인 함수가 expired — 그 요청은 끝난다", async () => {
    const o = await paidOrder();
    const started = await startSignRpc(o.requestId);
    await recordSignTx(started.sign_request_id!, creatorActorOf(o.requestId));
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${o.orderId}'`);
    expect((await adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, SEED.creatorProfileId, started.plaintext!))).data).toBe("expired");
    expect(psql(`select state from public.approval_sign_requests where id = '${started.sign_request_id}'`)).toBe("failed");
  });
});

describe("INV-S12·INV-P4 (a): 송장 출력 재검증 재료 — 서명자 식별값 없이", () => {
  it("INV-S12: 승인한 주문의 판정 재료는 서명값이 있음·방식 fake·기록된 원문 해시·그 원문이고, 해시는 원문의 SHA-256 이다", async () => {
    const o = await paidOrder();
    expect((await approveRpc(o.requestId)).data).toBe("approved");
    const boxId = psql(`select id from public.boxes where order_id = '${o.orderId}' limit 1`);
    // 판정 재료 함수는 QR 로 부른다 — 시험 상자 줄을 사무실 상자에 잇지 않고, 같은 조인을 직접 본다
    const row = psql(
      `select (s.signature is not null) || '|' || s.method || '|' || s.content_hash || '|' || sr.plaintext from public.boxes b join public.approval_requests q on q.order_id = b.order_id and q.status = 'approved' join public.approval_signatures s on s.request_id = q.request_id join public.approval_sign_requests sr on sr.id = s.sign_request_id and sr.state = 'signed' where b.id = '${boxId}'`,
    );
    const [present, method, hash, ...rest] = row.split("|");
    const plaintext = rest.join("|");
    expect([present, method]).toEqual(["true", "fake"]);
    expect(hash).toBe(createHash("sha256").update(plaintext, "utf8").digest("hex"));
    expect(parseApprovalPlaintext(plaintext)?.orderNo).toBe(o.orderNo);
    // 판정 재료 함수 본문이 서명자 식별값을 내보내지 않는다
    expect(psql(`select pg_get_functiondef('public.invoice_print_context'::regproc) like '%signer_id%'`)).toBe("f");
  });
});

describe("INV-S14: 탈퇴 처리 — 카카오 서명값이 남은 크리에이터는 멈춘다", () => {
  it("INV-S14 (실패경로): 카카오 서명값이 있는 크리에이터를 탈퇴로 표시하면 0A000 으로 멈추고 아무것도 바뀌지 않는다", async () => {
    const o = await paidOrder();
    const started = await startSignRpc(o.requestId);
    const creatorId = psql(`select creator_id from public.orders where id = '${o.orderId}'`);
    // 카카오 서명 줄을 시험으로 하나 만든다(승인 함수는 로컬에서 kakao 를 받지 않으므로 소유자로 직접 — 트리거는 그대로)
    const err = psqlError(
      `begin; insert into public.approval_signatures (request_id, content_hash, signature, method, sign_request_id) values ('${o.requestId}', '${"a".repeat(64)}', 'MIIB', 'kakao', '${started.sign_request_id}'); update public.creators set withdrawn_at = now() where id = '${creatorId}'; commit;`,
    );
    expect(err).toMatch(/카카오 서명 기록의 가명 처리는 아직 없다|0A000/);
    expect(psql(`select withdrawn_at is null from public.creators where id = '${creatorId}'`)).toBe("t");
    expect(psql(`select count(*) from public.approval_signatures where request_id = '${o.requestId}'`)).toBe("0");
  });
});
