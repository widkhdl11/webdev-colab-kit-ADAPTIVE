import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  deleteTestBlocks,
  deleteTestOrders,
  holdRowLock,
  payTestOrder,
  psql,
  psqlError,
  registerTestOrder,
  SEED,
  signedInClient,
} from "./helpers";
import { isMustDeliver, NOTIFICATION_KINDS } from "@/entities/notification/model/delivery-policy";
import {
  approve,
  deleteTestUnmatched,
  FAN_PASS,
  fanSetsWaybill,
  inspect,
  orderStatus,
  paidGift,
  receiveAndLabel,
  scanInbound,
  waybill,
  type Unit,
  finishPrint,
} from "./office-helpers";

// 알림 — DB 층 (docs/specs/notifications.md INV-N2~N13 중 DB 가 지키는 것).
// 발송 대기 줄은 사건(결제 완료·주문 상태 전환·보관)과 같은 처리에서 생기고, 보내는 일꾼 함수(앱 서버 키 전용)로만 움직인다.
// 「(manual/0011 뒤)」가 붙은 시험은 연락처를 읽는 함수(pii 를 읽는다 — 사람이 적용)가 있어야 통과한다.
// supabase/manual/0011_notification_contact.sql 이 적용되기 전에는 빨간불이 맞다.
// 「(manual/0016 뒤)」는 꼭 가는 알림을 넓힌 연락처 함수(2026-10-12 문제집 D7, 사람이 적용)가 있어야 통과한다.

const OUTBOX = "public.notification_outbox";
const TEMPLATES = "public.notification_kakao_templates";
const HANEUL_FAN_ID = "00000000-0000-4000-a000-000000000005"; // 하늘 — 차단 시험용 보낸 사람
const SAEBYEOKDAL_CREATOR_ID = "00000000-0000-4000-b000-000000000003"; // 계정이 없는 예시 크리에이터

afterEach(() => {
  deleteTestOrders();
  // 차단 시험이 남긴 줄(하루 → 하늘). 시드에는 차단이 없다.
  deleteTestBlocks();
  deleteTestUnmatched();
  // 3차 재알림 함수는 오래된 시드 대기 요청에도 줄을 만든다 — 시드 주문은 지우지 않으므로 발송 줄을 통째로 비운다(로컬 DB, 시드에는 발송 줄이 없다).
  psql(`do $$ begin if to_regclass('${OUTBOX}') is not null then delete from ${OUTBOX}; end if; end $$;`);
  // 템플릿 설정은 시험마다 비운다. 표가 아직 없을 때(구현 전 빨간불 확인)도 정리 단계가 멈추지 않게 표가 있을 때만.
  psql(`do $$ begin if to_regclass('${TEMPLATES}') is not null then delete from ${TEMPLATES}; end if; end $$;`);
});

/** 주문의 발송 대기 줄을 「종류|차례|받는 계정 아이디|통로|상태」로. */
/** 주문 단위 알림 줄(상자마다 가는 「상자 도착」은 inbound-code-db 시험이 따로 본다 — INV-N14). */
function outboxRows(orderId: string): string[] {
  const out = psql(
    `select o.kind || '|' || o.round || '|' || p.login_id || '|' || o.channel || '|' || o.status from ${OUTBOX} o join public.profiles p on p.id = o.account_id where o.order_id = '${orderId}' and o.kind <> 'box_arrived' order by o.kind, o.round, p.login_id, o.channel`,
  );
  return out === "" ? [] : out.split("\n");
}

function rowId(orderId: string, kind: string, login: string, channel = "email", round = 1): string {
  const id = psql(
    `select o.id from ${OUTBOX} o join public.profiles p on p.id = o.account_id where o.order_id = '${orderId}' and o.kind = '${kind}' and p.login_id = '${login}' and o.channel = '${channel}' and o.round = ${round}`,
  );
  if (!id) throw new Error(`발송 대기 줄이 없다: ${kind} ${login} ${channel} ${round}`);
  return id;
}

/** psql 이 여러 문장을 돌리면 BEGIN·SET·ROLLBACK 같은 명령 꼬리표도 찍는다 — 값 줄만 남긴다. */
function values(out: string): string[] {
  return out.split("\n").filter((l) => !/^(BEGIN|SET|ROLLBACK|COMMIT)$/.test(l));
}

function rowField(id: string, column: string): string {
  return psql(`select ${column} from ${OUTBOX} where id = '${id}'`);
}

/** 트리거를 끈 채 줄의 칸을 바꾼다 — 시간이 흐른 상태(멈춘 줄·오래된 사건)를 만들 때만. 로컬 컨테이너에만 붙는다. */
function forceRow(id: string, set: string): void {
  psql(`begin; set local session_replication_role = replica; update ${OUTBOX} set ${set} where id = '${id}'; commit;`);
}

function setTemplate(kind: string, code: string): void {
  psql(`insert into ${TEMPLATES} (kind, template_code) values ('${kind}', '${code}')`);
}

type Claimed = {
  id: string;
  kind: string;
  channel: string;
  round: number;
  order_no: string;
  nickname: string;
  auto_reject_at: string | null;
  must_deliver: boolean;
  attempts: number;
  claimed_at: string;
};

/** 이 줄만 꺼낼 수 있게 다른 대기 줄을 뒤로 미룬 뒤 하나를 꺼낸다. */
function onlyThisDue(id: string): void {
  psql(
    `update ${OUTBOX} set next_attempt_at = case when id = '${id}' then now() - interval '1 minute' else now() + interval '1 day' end where status = 'pending'`,
  );
}

async function claimOne(id: string): Promise<Claimed> {
  onlyThisDue(id);
  const r = await adminClient().rpc("notification_claim", { p_limit: 1 });
  if (r.error) throw new Error(`notification_claim 실패: ${r.error.code} ${r.error.message}`);
  const rows = r.data as Claimed[];
  if (rows.length !== 1 || rows[0]!.id !== id) throw new Error(`꺼낸 줄이 다르다: ${JSON.stringify(rows)}`);
  return rows[0]!;
}

/** 끝내기. 꺼낸 시각(표)은 기본으로 줄의 지금 값을 쓴다 — 늦게 온 끝내기를 흉내 낼 때만 claimedAt 을 준다. */
function finish(id: string, outcome: string, extra: { provider?: string; error?: string; fake?: boolean; claimedAt?: string } = {}) {
  return adminClient().rpc("notification_finish", {
    p_id: id,
    p_claimed_at: extra.claimedAt ?? (psql(`select claimed_at::text from ${OUTBOX} where id = '${id}'`) || null),
    p_outcome: outcome,
    p_provider_message_id: extra.provider ?? null,
    p_error_code: extra.error ?? null,
    p_fake: extra.fake ?? false,
  });
}

function staffClaims(): string {
  const id = psql(`select id from public.profiles where login_id = 'fankkuk_staff'`);
  return `set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';`;
}

async function arrivedGift(boxCount = 1): Promise<{ g: Unit; staff: SupabaseClient; qrs: string[] }> {
  const g = await paidGift(boxCount);
  const staff = await signedInClient("fankkuk_staff");
  const qrs: string[] = [];
  for (const boxId of g.boxIds) {
    const no = waybill();
    await fanSetsWaybill(boxId, no);
    qrs.push(await receiveAndLabel(staff, no));
  }
  return { g, staff, qrs };
}

// ── 사건 자리에서 줄이 생긴다 ─────────────────────────────

describe("받는 계정과 줄 만들기 (INV-N3·N4·N7)", () => {
  it("INV-N3 (S3): 결제 완료 → 하루 계정의 승인 요청 줄 하나(이메일), 팬 몫 줄은 없다", async () => {
    const g = await paidGift();
    expect(outboxRows(g.orderId)).toEqual(["approval_request|1|haru_creator|email|pending"]);
    // 사건 시각 = 결제 완료 시각(승인 요청 시각)
    expect(rowField(rowId(g.orderId, "approval_request", "haru_creator"), "event_at = (select created_at from public.approval_requests where request_id = '" + g.requestId + "')")).toBe("t");
  });

  it("INV-N10 (S3): 발송 대기 줄에는 정해진 칸뿐 — 번호·이메일·본문 칸이 없다", () => {
    const cols = psql(
      `select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'notification_outbox'`,
    );
    expect(cols.split(",")).toEqual(
      [
        "account_id",
        "approval_request_id",
        "attempts",
        "channel",
        "claimed_at",
        "created_at",
        "error_code",
        "event_at",
        "fake",
        "finished_at",
        "id",
        "kind",
        "next_attempt_at",
        "order_id",
        "parcel_id", // 상자 도착 줄이 가리키는 상자(INV-N14) — 연락처·본문 칸이 아니다
        "provider_message_id",
        "round",
        "status",
      ].sort(),
    );
  });

  it("INV-N7 (S7): 그 종류의 승인된 템플릿 코드가 있을 때만 카카오 줄도 생긴다", async () => {
    setTemplate("approval_request", "TPL_APPROVAL_1");
    const withCode = await paidGift();
    expect(outboxRows(withCode.orderId)).toEqual([
      "approval_request|1|haru_creator|email|pending",
      "approval_request|1|haru_creator|kakao|pending",
    ]);
    psql(`delete from ${TEMPLATES}`);
    const without = await paidGift();
    expect(outboxRows(without.orderId)).toEqual(["approval_request|1|haru_creator|email|pending"]);
  });

  it("INV-N7 (S7): 입고만 코드가 있으면 입고는 카카오·이메일, 검수는 이메일 줄만", async () => {
    setTemplate("arrived", "TPL_ARRIVED_1");
    const { g, staff, qrs } = await arrivedGift();
    await inspect(staff, qrs[0]!, FAN_PASS);
    const fan = outboxRows(g.orderId).filter((r) => r.includes("|byeolbit_fan|"));
    expect(fan).toEqual(["arrived|1|byeolbit_fan|email|pending", "arrived|1|byeolbit_fan|kakao|pending", "inspected|1|byeolbit_fan|email|pending"]);
  });

  it("INV-N3 (S3d): 계정이 없는 예시 크리에이터에게 간 주문은 결제가 끝나도 승인 요청 줄이 없다", async () => {
    const o = await registerTestOrder(1, { creatorId: SAEBYEOKDAL_CREATOR_ID });
    await payTestOrder(o);
    expect(psql(`select status from public.orders where id = '${o.orderId}'`)).toBe("registered");
    expect(outboxRows(o.orderId)).toEqual([]);
  });

  it("INV-N3 (S3e): 상자 둘 — 첫 상자 입고에 하루 몫 승인 요청 2차, 팬 입고 줄은 둘째 상자로 주문이 입고될 때 한 번", async () => {
    const g = await paidGift(2);
    const staff = await signedInClient("fankkuk_staff");
    const [a, b] = [waybill(), waybill()];
    await fanSetsWaybill(g.boxIds[0]!, a);
    await fanSetsWaybill(g.boxIds[1]!, b);
    await receiveAndLabel(staff, a);
    expect(orderStatus(g.orderId)).toBe("registered");
    expect(outboxRows(g.orderId)).toEqual(["approval_request|1|haru_creator|email|pending", "approval_request|2|haru_creator|email|pending"]);
    await receiveAndLabel(staff, b);
    expect(orderStatus(g.orderId)).toBe("labeled");
    expect(outboxRows(g.orderId)).toEqual([
      "approval_request|1|haru_creator|email|pending",
      "approval_request|2|haru_creator|email|pending",
      "arrived|1|byeolbit_fan|email|pending",
    ]);
  });

  it("INV-N8 (실패경로): 승인이 끝난 뒤 처음 입고되면 2차 승인 요청 줄은 없다", async () => {
    const g = await paidGift();
    await approve(g);
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0]!, no);
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, no);
    expect(outboxRows(g.orderId)).toEqual(["approval_request|1|haru_creator|email|pending", "arrived|1|byeolbit_fan|email|pending"]);
  });

  it("INV-N3 (S3f): 끝까지 간 주문 — 입고·검수·출고는 팬에게 한 번씩, 크리에이터 몫은 승인 요청뿐", async () => {
    const { g, staff, qrs } = await arrivedGift();
    await inspect(staff, qrs[0]!, FAN_PASS);
    await approve(g);
    const out = waybill();
    expect(finishPrint(qrs[0], out)).toBeNull();
    expect((await staff.rpc("office_confirm_shipment", { p_qr: qrs[0], p_waybill: out })).error).toBeNull();
    expect(orderStatus(g.orderId)).toBe("shipped");
    expect(outboxRows(g.orderId)).toEqual([
      "approval_request|1|haru_creator|email|pending",
      "approval_request|2|haru_creator|email|pending",
      "arrived|1|byeolbit_fan|email|pending",
      "inspected|1|byeolbit_fan|email|pending",
      "shipped|1|byeolbit_fan|email|pending",
    ]);
  });

  it("INV-N4 (S4c): 같은 사건 처리를 다시 돌려도 줄은 그대로", async () => {
    const { g } = await arrivedGift();
    const before = outboxRows(g.orderId);
    expect(before).toContain("arrived|1|byeolbit_fan|email|pending");
    psql(`select public.office_sync_order('${g.orderId}'); select public.office_sync_order('${g.orderId}');`);
    expect(outboxRows(g.orderId)).toEqual(before);
  });

  it("INV-N4 (실패경로): 같은 이름(종류·대상·차례·계정·통로)의 줄을 하나 더 넣으면 DB 가 거부한다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    const err = psqlError(
      `insert into ${OUTBOX} (kind, order_id, approval_request_id, round, account_id, channel, event_at) select kind, order_id, approval_request_id, round, account_id, channel, event_at from ${OUTBOX} where id = '${id}'`,
    );
    expect(err).toMatch(/duplicate key|unique/);
    expect(outboxRows(g.orderId)).toHaveLength(1);
  });

  it("INV-N4 (S4b, 실패경로): 입고 처리가 취소되면 입고 줄도 없다 — 같은 처리 안에서는 있었다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0]!, no);
    const inside = psql(
      `begin; ${staffClaims()} select public.office_scan_inbound('${no}', (select code from public.inbound_codes where box_id = '${g.boxIds[0]}')) is not null; select count(*) from ${OUTBOX} where order_id = '${g.orderId}' and kind = 'arrived'; rollback;`,
    );
    expect(values(inside)).toEqual(["t", "1"]);
    expect(orderStatus(g.orderId)).toBe("registered");
    expect(outboxRows(g.orderId)).toEqual(["approval_request|1|haru_creator|email|pending"]);
  });

  it("INV-N4 (S4b, 실패경로): 결제 완료 처리가 취소되면 승인 요청 줄도 없다", async () => {
    const o = await registerTestOrder();
    const at = new Date().toISOString();
    const req = `apr_${o.orderNo.replaceAll("-", "")}`;
    const inside = psql(
      `begin; select public.settle_payment('${o.tossOrderId}', 'done', 'pk_${o.tossOrderId}', '${req}', 'x', '${at}'); select count(*) from ${OUTBOX} where order_id = '${o.orderId}'; rollback;`,
    );
    expect(values(inside)).toEqual(["t", "1"]);
    expect(outboxRows(o.orderId)).toEqual([]);
  });

  it("INV-N4 (S4, 동시): 출고 확정 스캔 둘이 동시에 와도 출고 줄은 하나", async () => {
    const { g, staff, qrs } = await arrivedGift();
    await inspect(staff, qrs[0]!, FAN_PASS);
    await approve(g);
    const owner = await signedInClient("fankkuk_admin");
    const out = waybill();
    expect(finishPrint(qrs[0], out)).toBeNull();
    const { released } = await holdRowLock(`select 1 from public.office_parcels where qr_code = '${qrs[0]}' for update`, 2);
    const sentAt = Date.now();
    const rs = await Promise.all([
      staff.rpc("office_confirm_shipment", { p_qr: qrs[0], p_waybill: out }),
      owner.rpc("office_confirm_shipment", { p_qr: qrs[0], p_waybill: out }),
    ]);
    await released;
    expect(Date.now() - sentAt).toBeGreaterThanOrEqual(1000);
    expect(rs.filter((r) => r.error === null)).toHaveLength(1);
    expect(outboxRows(g.orderId).filter((r) => r.startsWith("shipped|"))).toEqual(["shipped|1|byeolbit_fan|email|pending"]);
  });
});

// ── 거절은 팬 알림으로 구분되지 않는다 ─────────────────────

describe("팬에게 승인·거절 종류 줄은 없다 (INV-N2)", () => {
  // 팬 몫 = 크리에이터(하루)가 아닌 계정의 줄. 차단 거절은 하늘이 보낸 주문으로 본다 — 차단은 같은 보낸 사람의 대기 요청을
  // 모두 거절하므로, 별빛으로 하면 시드의 별빛 → 하루 대기 요청까지 거절된다.
  const fanRows = (orderId: string) => outboxRows(orderId).filter((r) => !r.includes("|haru_creator|"));

  it("INV-N2·N17 ② (S2): 상자가 하나도 안 온 주문의 크리에이터 거절·7일 반려·차단 거절 — 세 주문의 팬 몫 줄이 같다(거절 알림 하나씩)", async () => {
    const haru = await signedInClient("haru_creator");
    const declined = await paidGift();
    expect((await haru.rpc("decline_gift", { p_request_id: declined.requestId, p_block: false })).error).toBeNull();
    const expired = await paidGift();
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${expired.orderId}'`);
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_run_expiry", { p_order_no: expired.orderNo })).error).toBeNull();
    expect(orderStatus(expired.orderId)).toBe("expired");
    const blockedOrder = await registerTestOrder(1, { senderId: HANEUL_FAN_ID });
    const blocked = { ...blockedOrder, requestId: await payTestOrder(blockedOrder) };
    expect((await haru.rpc("decline_gift", { p_request_id: blocked.requestId, p_block: true })).error).toBeNull();
    // 받는 팬이 다르다(별빛·하늘) — 받는 사람 칸을 지우고 종류·차례·통로·상태를 비교한다
    const all = [declined, expired, blocked].map((g) => fanRows(g.orderId).map((r) => r.replace(/\|[a-z]+_fan\|/, "|팬|")));
    expect(all).toEqual([0, 1, 2].map(() => ["gift_undelivered|1|팬|email|pending"]));
    expect(fanRows(declined.orderId)).toEqual(["gift_undelivered|1|byeolbit_fan|email|pending"]);
    expect(fanRows(blocked.orderId)).toEqual(["gift_undelivered|1|haneul_fan|email|pending"]);
    // 거절 사건이 크리에이터 몫 줄은 더 만들지 않는다 — 결제 완료 때의 승인 요청 줄 하나뿐
    for (const g of [declined, expired, blocked]) {
      expect(outboxRows(g.orderId).filter((r) => r.includes("|haru_creator|"))).toEqual(["approval_request|1|haru_creator|email|pending"]);
    }
    // 7일 자동 처리를 다시 돌려도 거절 알림은 그대로 하나(INV-N4)
    expect((await owner.rpc("office_run_expiry", { p_order_no: expired.orderNo })).error).toBeNull();
    expect(fanRows(expired.orderId)).toEqual(["gift_undelivered|1|byeolbit_fan|email|pending"]);
  });

  it("INV-N2 (S2b, 실패경로): 크리에이터가 승인해도 팬에게 승인 사실을 알리는 줄이 없다", async () => {
    const g = await paidGift();
    await approve(g);
    expect(fanRows(g.orderId)).toEqual([]);
    expect(outboxRows(g.orderId)).toEqual(["approval_request|1|haru_creator|email|pending"]);
  });
});

// ── 꼭 가는 알림 판정 (INV-N6 S6f, 2026-10-12) ─────────────────

describe("꼭 가는 알림 판정 — DB 와 앱 목록이 같다 (INV-N6)", () => {
  it("INV-N6 (S6f): 종류마다 DB 판정 함수가 앱의 표와 같다 — 표에 없는 종류는 꼭 가는 알림이 아니다", () => {
    const out = psql(
      `select string_agg(k || '=' || public.notification_kind_must_deliver(k)::text, ',' order by k) from unnest(array[${NOTIFICATION_KINDS.map((k) => `'${k}'`).join(",")}, 'no_such_kind']) as k`,
    );
    const db = new Map(out.split(",").map((pair) => pair.split("=") as [string, string]));
    for (const kind of NOTIFICATION_KINDS) expect([kind, db.get(kind)]).toEqual([kind, isMustDeliver(kind) ? "true" : "false"]);
    expect(db.get("no_such_kind")).toBe("false");
  });

  it("INV-N6 (S6f): 판정 함수는 화면 쪽 키로 부를 수 없다", async () => {
    const r = await anonClient().rpc("notification_kind_must_deliver", { p_kind: "approval_request" });
    expect(r.error).not.toBeNull();
    expect(psql(`select public.notification_kind_must_deliver('approval_request')`)).toBe("t");
  });

  it("INV-N6 (S6f): 꺼낸 줄의 꼭 가는 알림 표시도 같은 판정이다 — 거절 알림은 참, 입고는 거짓", async () => {
    const declined = await paidGift();
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: declined.requestId, p_block: false })).error).toBeNull();
    const c = await claimOne(rowId(declined.orderId, "gift_undelivered", "byeolbit_fan"));
    expect(c).toMatchObject({ kind: "gift_undelivered", must_deliver: true, nickname: "별빛", order_no: declined.orderNo });
    const { g } = await arrivedGift();
    expect((await claimOne(rowId(g.orderId, "arrived", "byeolbit_fan"))).must_deliver).toBe(false);
  });
});

// ── 보관(추적 장치) 알림 ───────────────────────────────────

describe("보관 알림 — 크리에이터에게 보관, 팬에게 돌려보낼 상자 (INV-N13)", () => {
  it("INV-N13 (S13): 추적 장치가 나와 보관 → 보관 기록 1줄, 하루 몫 보관 줄 1개, 별빛 몫 「돌려보낼 상자」 줄 1개 — 나머지 팬 줄은 통과 주문과 같다", async () => {
    const held = await arrivedGift();
    expect(await inspect(held.staff, held.qrs[0]!, { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" })).toBe("held");
    expect(psql(`select count(*) from public.office_hold_alerts a join public.office_parcels p on p.id = a.parcel_id where p.qr_code = '${held.qrs[0]}'`)).toBe("1");
    const rows = outboxRows(held.g.orderId);
    expect(rows.filter((r) => r.startsWith("hold|"))).toEqual(["hold|1|haru_creator|email|pending"]);
    expect(rows.filter((r) => r.startsWith("hold_fan|"))).toEqual(["hold_fan|1|byeolbit_fan|email|pending"]);
    const passed = await arrivedGift();
    await inspect(passed.staff, passed.qrs[0]!, FAN_PASS);
    const fanKinds = (orderId: string) => outboxRows(orderId).filter((r) => r.includes("|byeolbit_fan|") && !r.startsWith("hold_fan|"));
    expect(fanKinds(held.g.orderId)).toEqual(fanKinds(passed.g.orderId));
  });

  it("INV-N13 (실패경로): 상자 둘이 모두 보관돼도 주문 단위로 한 번", async () => {
    const { g, staff, qrs } = await arrivedGift(2);
    const hold = { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" };
    await inspect(staff, qrs[0]!, hold);
    await inspect(staff, qrs[1]!, hold);
    expect(outboxRows(g.orderId).filter((r) => r.startsWith("hold|"))).toEqual(["hold|1|haru_creator|email|pending"]);
    expect(outboxRows(g.orderId).filter((r) => r.startsWith("hold_fan|"))).toEqual(["hold_fan|1|byeolbit_fan|email|pending"]);
  });

  it("INV-N13 (S13b, 실패경로): 보관 기록 처리가 취소되면 보관 줄도 없다 — 같은 처리 안에서는 있었다", async () => {
    const { g, staff, qrs } = await arrivedGift();
    expect((await staff.rpc("office_record_inspection", { p_qr: qrs[0], p_result: { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" } })).error).toBeNull();
    const inside = psql(
      `begin; ${staffClaims()} select public.office_scan_inspect('${qrs[0]}'); select count(*) from ${OUTBOX} where order_id = '${g.orderId}' and kind = 'hold'; rollback;`,
    );
    expect(values(inside)).toEqual(["held", "1"]);
    expect(outboxRows(g.orderId).filter((r) => r.startsWith("hold|"))).toEqual([]);
    expect(psql(`select count(*) from public.office_hold_alerts a join public.office_parcels p on p.id = a.parcel_id where p.qr_code = '${qrs[0]}'`)).toBe("0");
  });
});

// ── 3차 재알림 ─────────────────────────────────────────────

describe("승인 요청 3차 재알림 (INV-N8)", () => {
  const age = (orderId: string, interval: string) => psql(`update public.orders set registered_at = now() - interval '${interval}' where id = '${orderId}'`);
  const third = (orderId: string) => outboxRows(orderId).filter((r) => r.startsWith("approval_request|3|"));

  it("INV-N8 (S8): 결제 완료 + 72시간이 지난 대기 요청 → 3차 줄 1개, 두 번 돌려도 1개", async () => {
    const g = await paidGift();
    age(g.orderId, "72 hours 1 minute");
    const first = await adminClient().rpc("notification_enqueue_due");
    expect(first.error).toBeNull();
    expect(third(g.orderId)).toEqual(["approval_request|3|haru_creator|email|pending"]);
    const second = await adminClient().rpc("notification_enqueue_due");
    expect(second.error).toBeNull();
    expect(third(g.orderId)).toEqual(["approval_request|3|haru_creator|email|pending"]);
  });

  it("INV-N8 (S8c, 실패경로): 71시간 59분이면 3차 줄이 없다", async () => {
    const g = await paidGift();
    age(g.orderId, "71 hours 59 minutes");
    expect((await adminClient().rpc("notification_enqueue_due")).error).toBeNull();
    expect(third(g.orderId)).toEqual([]);
  });

  it("INV-N8 (실패경로): 이미 승인된 요청에는 72시간이 지나도 3차 줄이 없다", async () => {
    const g = await paidGift();
    await approve(g);
    age(g.orderId, "73 hours");
    expect((await adminClient().rpc("notification_enqueue_due")).error).toBeNull();
    expect(third(g.orderId)).toEqual([]);
  });

  it("INV-N8 (실패경로): 3차 재알림은 앱 서버 키 전용 — 로그인 사용자·익명은 거부", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("notification_enqueue_due")).error?.code).toBe("42501");
    expect((await anonClient().rpc("notification_enqueue_due")).error?.code).toBe("42501");
  });

  it("INV-N8 (S8b, 실패경로): 3차 줄이 대기인 사이에 하루가 승인 → 꺼낼 때 건너뜀으로 끝나고 돌려주지 않는다", async () => {
    const g = await paidGift();
    age(g.orderId, "73 hours");
    await adminClient().rpc("notification_enqueue_due");
    const id = rowId(g.orderId, "approval_request", "haru_creator", "email", 3);
    await approve(g);
    onlyThisDue(id);
    const r = await adminClient().rpc("notification_claim", { p_limit: 5 });
    expect(r.error).toBeNull();
    expect((r.data as Claimed[]).map((c) => c.id)).not.toContain(id);
    expect(rowField(id, "status")).toBe("skipped");
  });
});

// ── 보내는 일꾼 ────────────────────────────────────────────

describe("꺼내기·끝내기 (INV-N5·N1)", () => {
  it("INV-N1: 꺼낸 줄은 본문에 쓸 값만 돌려준다 — 승인 요청은 자동 반려 예정 시각과 꼭 가는 알림 표시, 연락처는 없다", async () => {
    const g = await paidGift();
    const c = await claimOne(rowId(g.orderId, "approval_request", "haru_creator"));
    expect(Object.keys(c).sort()).toEqual(["attempts", "auto_reject_at", "channel", "claimed_at", "id", "kind", "must_deliver", "nickname", "order_no", "round"]);
    expect(c).toMatchObject({ kind: "approval_request", channel: "email", round: 1, order_no: g.orderNo, nickname: "하루", must_deliver: true, attempts: 0 });
    const expected = psql(`select extract(epoch from registered_at + interval '168 hours') from public.orders where id = '${g.orderId}'`);
    expect(new Date(c.auto_reject_at!).getTime() / 1000).toBeCloseTo(Number(expected), 3);
    expect(rowField(c.id, "status")).toBe("sending");
  });

  it("INV-N1: 팬 몫 입고 줄은 별빛 닉네임, 반려 시각 없음, 꼭 가는 알림 아님", async () => {
    const { g } = await arrivedGift();
    const c = await claimOne(rowId(g.orderId, "arrived", "byeolbit_fan"));
    expect(c).toMatchObject({ kind: "arrived", nickname: "별빛", order_no: g.orderNo, must_deliver: false, auto_reject_at: null });
  });

  it("INV-N5 (실패경로): 다음 시도 시각이 안 된 줄은 꺼내지 않는다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    psql(`update ${OUTBOX} set next_attempt_at = now() + interval '1 day' where status = 'pending'`);
    const r = await adminClient().rpc("notification_claim", { p_limit: 5 });
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
    expect(rowField(id, "status")).toBe("pending");
  });

  it("INV-N5 (S5, 동시): 일꾼 둘이 같은 줄을 동시에 꺼내도 한쪽만 가져간다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    onlyThisDue(id);
    // 다른 처리가 줄을 잠그고 있는 동안: 꺼내기는 기다리지 않고 그 줄을 건너뛴다 — 줄은 대기 그대로
    const { released } = await holdRowLock(`select 1 from ${OUTBOX} where id = '${id}' for update`, 2);
    const sentAt = Date.now();
    const locked = await Promise.all([adminClient().rpc("notification_claim", { p_limit: 1 }), adminClient().rpc("notification_claim", { p_limit: 1 })]);
    expect(Date.now() - sentAt).toBeLessThan(1500);
    expect(locked.map((r) => [r.error, r.data])).toEqual([
      [null, []],
      [null, []],
    ]);
    expect(rowField(id, "status")).toBe("pending");
    await released;
    // 잠금이 풀린 뒤 둘이 동시에 꺼내면 한쪽만 가져간다
    const rs = await Promise.all([adminClient().rpc("notification_claim", { p_limit: 1 }), adminClient().rpc("notification_claim", { p_limit: 1 })]);
    expect(rs.map((r) => r.error)).toEqual([null, null]);
    const got = rs.map((r) => (r.data as Claimed[]).map((c) => c.id));
    expect(got.flat()).toEqual([id]);
    expect(rowField(id, "status")).toBe("sending");
  });

  it("INV-N5: 보냄으로 끝내면 대행사 발송 번호가 남고 끝 시각이 찍힌다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    await claimOne(id);
    const r = await finish(id, "sent", { provider: "msg_0001" });
    expect(r.error).toBeNull();
    expect(r.data).toBe("sent");
    expect(rowField(id, "status || '|' || provider_message_id || '|' || (finished_at is not null) || '|' || fake")).toBe("sent|msg_0001|true|false");
  });

  it("INV-N5 (실패경로): 꺼내지 않은(대기) 줄은 끝낼 수 없다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    expect((await finish(id, "sent", { provider: "msg_0002" })).error?.code).toBe("55000");
    expect(rowField(id, "status")).toBe("pending");
  });

  it.each(["sent", "skipped", "failed"])("INV-N5 (S5c, 실패경로): 끝난 줄(%s)은 대기로 되돌리거나 다시 끝낼 수 없다", async (end) => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    await claimOne(id);
    if (end === "sent") await finish(id, "sent", { provider: "msg_0003" });
    if (end === "skipped") await finish(id, "skipped", { error: "channel_off" });
    if (end === "failed") forceRow(id, "attempts = 4");
    if (end === "failed") expect((await finish(id, "error", { error: "provider_5xx" })).data).toBe("failed");
    expect(rowField(id, "status")).toBe(end);
    expect(psqlError(`update ${OUTBOX} set status = 'pending' where id = '${id}'`)).toMatch(/끝난 발송 줄/);
    expect(psqlError(`update ${OUTBOX} set attempts = 0 where id = '${id}'`)).toMatch(/끝난 발송 줄/);
    expect((await finish(id, "sent", { provider: "msg_0004" })).error?.code).toBe("55000");
    expect(rowField(id, "status")).toBe(end);
  });

  it("INV-N5 (실패경로): 줄의 이름(받는 계정·종류·통로)은 대기 중에도 바꿀 수 없다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    expect(psqlError(`update ${OUTBOX} set account_id = '${SEED.fanId}' where id = '${id}'`)).toMatch(/바꿀 수 없다/);
    expect(psqlError(`update ${OUTBOX} set channel = 'kakao' where id = '${id}'`)).toMatch(/바꿀 수 없다/);
    expect(rowField(id, "account_id")).toBe(SEED.creatorProfileId);
  });

  it("INV-N5 (실패경로): 대기에서 바로 보냄으로 건너뛸 수 없다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    expect(psqlError(`update ${OUTBOX} set status = 'sent' where id = '${id}'`)).toMatch(/바꿀 수 없다/);
  });

  it("INV-N5: 보내기 실패 → 대기로 돌아가 간격을 늘려 다시 꺼낸다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    await claimOne(id);
    expect((await finish(id, "error", { error: "provider_timeout" })).data).toBe("pending");
    const gap1 = Number(rowField(id, "extract(epoch from next_attempt_at - now())"));
    expect(rowField(id, "attempts || '|' || error_code || '|' || (claimed_at is null)")).toBe("1|provider_timeout|true");
    expect(gap1).toBeGreaterThan(30);
    await claimOne(id);
    expect((await finish(id, "error", { error: "provider_timeout" })).data).toBe("pending");
    const gap2 = Number(rowField(id, "extract(epoch from next_attempt_at - now())"));
    expect(gap2).toBeGreaterThan(gap1 * 2);
  });

  it("INV-N5 (S5b, 실패경로): 다섯 번 실패하면 실패로 끝나고 더 꺼내지 않는다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    const results: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      await claimOne(id);
      results.push((await finish(id, "error", { error: "provider_5xx" })).data);
    }
    expect(results).toEqual(["pending", "pending", "pending", "pending", "failed"]);
    expect(rowField(id, "status || '|' || attempts || '|' || (finished_at is not null)")).toBe("failed|5|true");
    psql(`update ${OUTBOX} set next_attempt_at = now() + interval '1 day' where status = 'pending'`);
    expect((await adminClient().rpc("notification_claim", { p_limit: 5 })).data).toEqual([]);
  });

  it("INV-N5 (실패경로): 보내는 중에 사건 뒤 24시간이 지났으면 첫 실패에서 실패로 끝난다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    await claimOne(id);
    forceRow(id, "event_at = now() - interval '24 hours 1 minute'");
    expect((await finish(id, "error", { error: "provider_5xx" })).data).toBe("failed");
  });

  it("INV-N10 (실패경로): 오류 칸에는 코드만 — 문장·번호 꼴은 거부", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    await claimOne(id);
    expect((await finish(id, "error", { error: "invalid phone 01012345678" })).error).not.toBeNull();
    expect((await finish(id, "error", { error: "01012345678" })).error).not.toBeNull();
    expect(rowField(id, "status || '|' || attempts")).toBe("sending|0");
  });
});

describe("멈춘 줄 정리 (INV-N5 S5d·S5e)", () => {
  it("INV-N5 (S5d): 꺼낸 지 10분이 지난 메일 줄은 대기로 돌아가고 시도 횟수가 하나 는다 — 10분 안 된 줄은 그대로", async () => {
    const stale = await paidGift();
    const fresh = await paidGift();
    const a = rowId(stale.orderId, "approval_request", "haru_creator");
    const b = rowId(fresh.orderId, "approval_request", "haru_creator");
    await claimOne(a);
    await claimOne(b);
    forceRow(a, "claimed_at = now() - interval '10 minutes 1 second'");
    forceRow(b, "claimed_at = now() - interval '9 minutes'");
    const r = await adminClient().rpc("notification_requeue_stale");
    expect(r.error).toBeNull();
    expect(r.data).toBe(1); // 되돌린 줄 수
    expect(rowField(a, "status || '|' || attempts || '|' || (claimed_at is null)")).toBe("pending|1|true");
    expect(rowField(b, "status || '|' || attempts")).toBe("sending|0");
  });

  it("INV-N5 (S5e): 발송 조회가 되는 통로(카카오)의 멈춘 줄은 다시 보내지 않고 조회 목록으로 — 조회 결과 보냄이면 보냄으로 끝난다", async () => {
    setTemplate("approval_request", "TPL_APPROVAL_1");
    const g = await paidGift();
    const k = rowId(g.orderId, "approval_request", "haru_creator", "kakao");
    await claimOne(k);
    forceRow(k, "claimed_at = now() - interval '11 minutes'");
    expect((await adminClient().rpc("notification_requeue_stale")).error).toBeNull();
    expect(rowField(k, "status")).toBe("sending");
    const look = await adminClient().rpc("notification_stale_lookups");
    expect(look.error).toBeNull();
    expect((look.data as { id: string; channel: string }[]).filter((x) => x.id === k)).toEqual([{ id: k, channel: "kakao", provider_message_id: null }]);
    const done = await adminClient().rpc("notification_resolve_stale", { p_id: k, p_delivered: true, p_provider_message_id: "msg_k1" });
    expect(done.error).toBeNull();
    expect(done.data).toBe("sent");
    expect(rowField(k, "status || '|' || provider_message_id || '|' || attempts")).toBe("sent|msg_k1|0");
  });

  it("INV-N5 (S5e, 실패경로): 조회 결과 안 갔으면 대기로 — 메일 줄이나 멈추지 않은 줄은 조회 결과로 끝낼 수 없다", async () => {
    setTemplate("approval_request", "TPL_APPROVAL_1");
    const g = await paidGift();
    const k = rowId(g.orderId, "approval_request", "haru_creator", "kakao");
    const e = rowId(g.orderId, "approval_request", "haru_creator", "email");
    await claimOne(k);
    expect((await adminClient().rpc("notification_resolve_stale", { p_id: k, p_delivered: true })).error?.code).toBe("55000");
    forceRow(k, "claimed_at = now() - interval '11 minutes'");
    expect((await adminClient().rpc("notification_resolve_stale", { p_id: k, p_delivered: false })).data).toBe("pending");
    expect(rowField(k, "status || '|' || attempts")).toBe("pending|1");
    await claimOne(e);
    forceRow(e, "claimed_at = now() - interval '11 minutes'");
    expect((await adminClient().rpc("notification_resolve_stale", { p_id: e, p_delivered: true })).error?.code).toBe("55000");
    expect(rowField(e, "status")).toBe("sending");
  });
});

// ── 가짜 발송 표시 ─────────────────────────────────────────

describe("가짜 발송 표시는 허용 줄이 있는 DB 에서만 (INV-N11)", () => {
  it("INV-N11: 로컬(허용 줄 있음)에서는 가짜로 보냄 표시가 남는다", async () => {
    expect(psql(`select count(*) from public.local_dev_flags where flag = 'allow_fake_notifications'`)).toBe("1");
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    await claimOne(id);
    expect((await finish(id, "sent", { fake: true })).data).toBe("sent");
    expect(rowField(id, "status || '|' || fake")).toBe("sent|true");
  });

  it("INV-N11 (S11b, 실패경로): 허용 줄이 없는 DB(운영과 같은 상태)에서 가짜 통로의 「보냄」은 받지 않는다 — 줄은 대기로 돌아가 다시 보낼 차례", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    const c = await claimOne(id);
    // 허용 줄을 지운 같은 처리 안에서 끝내 보고 되돌린다(로컬 seed 의 허용 줄은 그대로 남는다)
    const out = values(
      psql(
        `begin; delete from public.local_dev_flags where flag = 'allow_fake_notifications'; select public.notification_finish('${id}', '${c.claimed_at}', 'sent', null, null, true); select status || '|' || fake || '|' || attempts || '|' || error_code from ${OUTBOX} where id = '${id}'; rollback;`,
      ),
    );
    expect(out.slice(-2)).toEqual(["pending", "pending|false|1|fake_rejected"]);
    expect(rowField(id, "status || '|' || fake")).toBe("sending|false");
    expect(psql(`select count(*) from public.local_dev_flags where flag = 'allow_fake_notifications'`)).toBe("1");
    // 가짜 서명 허용 줄만으로는 가짜 알림을 받지 않는다(허용 줄이 따로다)
    const out2 = values(
      psql(
        `begin; delete from public.local_dev_flags where flag = 'allow_fake_notifications'; select public.notification_finish('${id}', '${c.claimed_at}', 'sent', null, null, true); rollback;`,
      ),
    );
    expect(out2.slice(-1)).toEqual(["pending"]);
    // 가짜 표시를 직접 쓰는 갱신은 지킴이가 거부한다
    const pending = rowId((await paidGift()).orderId, "approval_request", "haru_creator");
    expect(
      psqlError(`begin; delete from public.local_dev_flags where flag = 'allow_fake_notifications'; update ${OUTBOX} set fake = true where id = '${pending}'; rollback;`),
    ).toMatch(/가짜/);
  });
});

// ── 화면 쪽 키 ─────────────────────────────────────────────

describe("화면 쪽 키로는 발송 기록·설정·일꾼 함수에 닿지 않는다 (INV-N10·N3·N7)", () => {
  it("INV-N10 (S10b, 실패경로): 익명·로그인 사용자는 발송 대기 줄을 읽지도 쓰지도 못한다", async () => {
    const g = await paidGift();
    const haru = await signedInClient("haru_creator");
    for (const c of [anonClient(), haru]) {
      expect((await c.from("notification_outbox").select("id")).error?.code).toBe("42501");
      expect(
        (await c.from("notification_outbox").insert({ kind: "arrived", order_id: g.orderId, round: 1, account_id: SEED.fanId, channel: "email", event_at: new Date().toISOString() }))
          .error?.code,
      ).toBe("42501");
      expect((await c.from("notification_outbox").update({ status: "pending" }).eq("order_id", g.orderId)).error?.code).toBe("42501");
    }
    expect(outboxRows(g.orderId)).toEqual(["approval_request|1|haru_creator|email|pending"]);
  });

  it("INV-N3 (실패경로): 앱 서버 키도 줄을 직접 넣거나 받는 계정을 바꾸지 못한다 — 줄은 사건 처리만 만든다", async () => {
    const g = await paidGift();
    const admin = adminClient();
    expect(
      (await admin.from("notification_outbox").insert({ kind: "arrived", order_id: g.orderId, round: 1, account_id: SEED.otherFanId, channel: "email", event_at: new Date().toISOString() }))
        .error?.code,
    ).toBe("42501");
    expect((await admin.from("notification_outbox").update({ account_id: SEED.otherFanId }).eq("order_id", g.orderId)).error?.code).toBe("42501");
    expect(outboxRows(g.orderId)).toEqual(["approval_request|1|haru_creator|email|pending"]);
  });

  it.each(["notification_claim", "notification_requeue_stale", "notification_stale_lookups"])(
    "INV-N5 (실패경로): 일꾼 함수 %s 는 익명·로그인 사용자에게 거부",
    async (fn) => {
      const fan = await signedInClient("byeolbit_fan");
      expect((await fan.rpc(fn)).error?.code).toBe("42501");
      expect((await anonClient().rpc(fn)).error?.code).toBe("42501");
    },
  );

  it("INV-N5 (실패경로): 끝내기·조회 결과 함수도 익명·로그인 사용자에게 거부", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    const fan = await signedInClient("byeolbit_fan");
    for (const c of [fan, anonClient()]) {
      expect((await c.rpc("notification_finish", { p_id: id, p_claimed_at: null, p_outcome: "sent", p_provider_message_id: null, p_error_code: null, p_fake: false })).error?.code).toBe("42501");
      expect((await c.rpc("notification_resolve_stale", { p_id: id, p_delivered: true })).error?.code).toBe("42501");
    }
    expect(rowField(id, "status")).toBe("pending");
  });

  it("INV-N7 (실패경로): 템플릿 설정은 앱 서버 키만 쓴다 — 로그인 사용자·익명은 읽지도 쓰지도 못한다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const c of [anonClient(), fan]) {
      expect((await c.from("notification_kakao_templates").insert({ kind: "arrived", template_code: "TPL_EVIL" })).error?.code).toBe("42501");
      expect((await c.from("notification_kakao_templates").select("kind")).error?.code).toBe("42501");
    }
    expect((await adminClient().from("notification_kakao_templates").insert({ kind: "arrived", template_code: "TPL_ARRIVED_1" })).error).toBeNull();
    expect(psql(`select template_code from ${TEMPLATES} where kind = 'arrived'`)).toBe("TPL_ARRIVED_1");
  });

  it("INV-N12 (S12, 실패경로): 로그인 사용자·운영자는 배송 칸을 바꾸지 못하고 배송중·수령 줄은 생기지 않는다", async () => {
    const { g } = await arrivedGift();
    for (const login of ["byeolbit_fan", "haru_creator", "fankkuk_admin"]) {
      const c = await signedInClient(login);
      const r = await c.from("orders").update({ delivery: "delivered" }).eq("id", g.orderId);
      expect(r.error?.code).toBe("42501");
    }
    expect(psql(`select coalesce(delivery, '-') from public.orders where id = '${g.orderId}'`)).toBe("-");
    expect(outboxRows(g.orderId).filter((r) => r.startsWith("in_transit|") || r.startsWith("delivered|"))).toEqual([]);
  });
});

// ── 연락처 (manual/0011) ───────────────────────────────────

describe("연락처는 보내는 순간 앱 서버 키 전용 함수로 (INV-N3·N6) — manual/0011 뒤", () => {
  type Contact = { email: string | null; pending_email: string | null; notify_kakao: boolean; notify_email: boolean };
  const readContact = (login: string): Contact => {
    const [email, pending, kakao, mail] = psql(
      `select coalesce(c.email, ''), coalesce(c.pending_email, ''), c.notify_kakao, c.notify_email from pii.account_contacts c join public.profiles p on p.id = c.account_id where p.login_id = '${login}'`,
    ).split("|");
    return { email: email || null, pending_email: pending || null, notify_kakao: kakao === "t", notify_email: mail === "t" };
  };
  const q = (v: string | null) => (v === null ? "null" : `'${v}'`);
  const writeContact = (login: string, c: Contact) =>
    psql(
      `update pii.account_contacts set email = ${q(c.email)}, pending_email = ${q(c.pending_email)}, notify_kakao = ${c.notify_kakao}, notify_email = ${c.notify_email} where account_id = (select id from public.profiles where login_id = '${login}')`,
    );
  async function withContact(login: string, patch: Partial<Contact>, body: () => Promise<void>): Promise<void> {
    const saved = readContact(login);
    writeContact(login, { ...saved, ...patch });
    try {
      await body();
    } finally {
      writeContact(login, saved);
    }
  }
  const contactOf = (id: string) => adminClient().rpc("notification_contact", { p_outbox_id: id });
  /** 함수가 오류 없이 돌려준 값. 함수가 없을 때(PGRST202)의 빈 값을 「건너뜀」으로 읽지 않게 오류를 먼저 본다. */
  const contactValue = async (id: string): Promise<unknown> => {
    const r = await contactOf(id);
    if (r.error) throw new Error(`notification_contact 실패: ${r.error.code} ${r.error.message}`);
    return r.data;
  };

  it("INV-N3 (S3c, manual/0011 뒤): 확인된 이메일로만 — 확인 대기 이메일은 쓰지 않고, 확인된 이메일이 없으면 빈 값", async () => {
    const { g } = await arrivedGift();
    const id = rowId(g.orderId, "arrived", "byeolbit_fan");
    await withContact("byeolbit_fan", { pending_email: "other.addr@example.com" }, async () => {
      await claimOne(id);
      const r = await contactOf(id);
      expect(r.error).toBeNull();
      expect(r.data).toBe("byeolbit.fan@example.com");
    });
    await withContact("byeolbit_fan", { email: null, pending_email: "other.addr@example.com" }, async () => {
      expect((await contactValue(id))).toBeNull();
    });
  });

  it("INV-N6 (S6, manual/0011 뒤): 카카오 칸 꺼짐·이메일 칸 켜짐 → 카카오 줄은 빈 값(건너뜀), 이메일 줄은 확인된 이메일", async () => {
    setTemplate("arrived", "TPL_ARRIVED_1");
    await withContact("byeolbit_fan", { notify_kakao: false, notify_email: true }, async () => {
      const { g } = await arrivedGift();
      const k = rowId(g.orderId, "arrived", "byeolbit_fan", "kakao");
      const e = rowId(g.orderId, "arrived", "byeolbit_fan", "email");
      await claimOne(k);
      await claimOne(e);
      expect((await contactValue(k))).toBeNull();
      expect((await contactValue(e))).toBe("byeolbit.fan@example.com");
    });
  });

  it("INV-N6 (S6 반대편, manual/0011 뒤): 카카오 칸이 켜져 있으면 카카오 줄에 휴대폰 번호", async () => {
    setTemplate("arrived", "TPL_ARRIVED_1");
    const { g } = await arrivedGift();
    const k = rowId(g.orderId, "arrived", "byeolbit_fan", "kakao");
    await claimOne(k);
    expect((await contactValue(k))).toBe("01012345678");
  });

  it("INV-N6 (S6b, manual/0011 뒤): 두 칸 모두 꺼진 팬의 검수 줄 → 어느 통로도 빈 값", async () => {
    setTemplate("inspected", "TPL_INSPECTED_1");
    await withContact("byeolbit_fan", { notify_kakao: false, notify_email: false }, async () => {
      const { g, staff, qrs } = await arrivedGift();
      await inspect(staff, qrs[0]!, FAN_PASS);
      for (const ch of ["kakao", "email"]) {
        const id = rowId(g.orderId, "inspected", "byeolbit_fan", ch);
        await claimOne(id);
        expect((await contactValue(id))).toBeNull();
      }
    });
  });

  it("INV-N6 (S6c, manual/0011 뒤): 두 칸 모두 꺼진 하루에게도 승인 요청은 간다(꼭 가는 알림)", async () => {
    setTemplate("approval_request", "TPL_APPROVAL_1");
    await withContact("haru_creator", { notify_kakao: false, notify_email: false }, async () => {
      const g = await paidGift();
      const e = rowId(g.orderId, "approval_request", "haru_creator", "email");
      const k = rowId(g.orderId, "approval_request", "haru_creator", "kakao");
      await claimOne(e);
      await claimOne(k);
      expect((await contactValue(e))).toBe("haru.creator@example.com");
      expect((await contactValue(k))).toBe("01088889999");
    });
  });

  it("INV-N6 (S6d, manual/0016 뒤): 두 칸 모두 꺼진 하루에게도 보관(확인할 선물)은 간다 — 꼭 가는 알림(2026-10-12)", async () => {
    await withContact("haru_creator", { notify_kakao: false, notify_email: false }, async () => {
      const { g, staff, qrs } = await arrivedGift();
      await inspect(staff, qrs[0]!, { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" });
      const id = rowId(g.orderId, "hold", "haru_creator");
      await claimOne(id);
      expect((await contactValue(id))).toBe("haru.creator@example.com");
    });
  });

  it("INV-N6 (S6e, manual/0016 뒤): 두 칸 모두 꺼진 별빛 — 거절 알림은 확인된 이메일로 가고, 같은 별빛의 입고 줄은 빈 값", async () => {
    await withContact("byeolbit_fan", { notify_kakao: false, notify_email: false }, async () => {
      const declined = await paidGift();
      expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: declined.requestId, p_block: false })).error).toBeNull();
      const must = rowId(declined.orderId, "gift_undelivered", "byeolbit_fan");
      await claimOne(must);
      expect((await contactValue(must))).toBe("byeolbit.fan@example.com");
      const { g } = await arrivedGift();
      const optional = rowId(g.orderId, "arrived", "byeolbit_fan");
      await claimOne(optional);
      expect((await contactValue(optional))).toBeNull();
    });
  });

  it("INV-N3 (manual/0011 뒤, 실패경로): 꺼내지 않은(대기) 줄의 연락처는 돌려주지 않는다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    const r = await contactOf(id);
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
  });

  it("INV-N3 (S3b, manual/0011 뒤, 실패경로): 로그인한 별빛이 연락처 함수를 직접 부르면 자기 줄·남의 줄 모두 거부", async () => {
    const { g } = await arrivedGift();
    const mine = rowId(g.orderId, "arrived", "byeolbit_fan");
    const others = rowId(g.orderId, "approval_request", "haru_creator");
    await claimOne(mine);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("notification_contact", { p_outbox_id: mine })).error?.code).toBe("42501");
    expect((await fan.rpc("notification_contact", { p_outbox_id: others })).error?.code).toBe("42501");
    expect((await anonClient().rpc("notification_contact", { p_outbox_id: mine })).error?.code).toBe("42501");
    // 함수가 있다는 것부터 확인 — 없어서 난 오류(PGRST202)를 거부로 읽지 않는다
    expect((await contactOf(mine)).error).toBeNull();
  });
});


// ── 리뷰 반영 (20261006000011): 꺼낸 표·24시간·잠금 건너뛰기·빈 갈래 ─────────

describe("일꾼 함수 고침 (INV-N5·N8) — 20261006000011", () => {
  it("INV-N5 (실패경로): 다른 일꾼이 다시 꺼낸 줄에 늦게 온 끝내기는 받지 않는다 — 새로 꺼낸 쪽의 줄이 그대로", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    const first = await claimOne(id);
    // 일꾼 A 가 멈춰 10분이 지나고, 정리가 대기로 되돌린 뒤 일꾼 B 가 다시 꺼낸다
    forceRow(id, "claimed_at = now() - interval '11 minutes'");
    const stale = rowField(id, "claimed_at::text");
    expect((await adminClient().rpc("notification_requeue_stale")).error).toBeNull();
    onlyThisDue(id);
    forceRow(id, "next_attempt_at = now() - interval '1 second'");
    const second = await claimOne(id);
    expect(second.claimed_at).not.toBe(first.claimed_at);
    // A 의 늦은 오류 끝내기
    const late = await finish(id, "error", { error: "provider_timeout", claimedAt: stale });
    expect(late.error?.code).toBe("55000");
    expect(rowField(id, "status || '|' || attempts")).toBe("sending|1");
    // 꺼낸 시각 없이도 받지 않는다
    expect((await adminClient().rpc("notification_finish", { p_id: id, p_claimed_at: null, p_outcome: "sent" })).error?.code).toBe("55000");
    // B 의 끝내기는 받는다
    expect((await finish(id, "sent", { provider: "msg_b" })).data).toBe("sent");
    expect(rowField(id, "status || '|' || provider_message_id")).toBe("sent|msg_b");
  });

  it("INV-N5: 사건 뒤 24시간이 지난 대기 줄은 꺼낼 때 보내지 않고 실패로 끝낸다 — 24시간 안 된 줄은 꺼낸다", async () => {
    const old = await paidGift();
    const fresh = await paidGift();
    const a = rowId(old.orderId, "approval_request", "haru_creator");
    const b = rowId(fresh.orderId, "approval_request", "haru_creator");
    psql(`update ${OUTBOX} set next_attempt_at = now() + interval '1 day' where status = 'pending'`);
    forceRow(a, "event_at = now() - interval '24 hours 1 second', next_attempt_at = now() - interval '1 minute'");
    forceRow(b, "event_at = now() - interval '23 hours 59 minutes', next_attempt_at = now() - interval '1 minute'");
    const r = await adminClient().rpc("notification_claim", { p_limit: 5 });
    expect(r.error).toBeNull();
    expect((r.data as Claimed[]).map((c) => c.id)).toEqual([b]);
    expect(rowField(a, "status || '|' || error_code || '|' || (finished_at is not null)")).toBe("failed|expired|true");
  });

  it("INV-N8: 3차 재알림 함수는 실제로 넣은 줄 수를 돌려준다 — 두 번째 부르면 0", async () => {
    setTemplate("approval_request", "TPL_APPROVAL_1");
    const g = await paidGift();
    psql(`update public.orders set registered_at = now() - interval '73 hours' where id = '${g.orderId}'`);
    // 시드의 오래된 대기 요청 몫을 먼저 만들어 두고, 이 주문 몫만 지운 뒤 센다
    psql(`select public.notification_enqueue_due()`);
    psql(`delete from ${OUTBOX} where order_id = '${g.orderId}' and round = 3`);
    expect((await adminClient().rpc("notification_enqueue_due")).data).toBe(2); // 이메일 + 카카오
    expect((await adminClient().rpc("notification_enqueue_due")).data).toBe(0);
  });

  it("INV-N5: 건너뛴 승인 요청 줄에는 이유 코드 request_not_waiting 이 남는다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    await approve(g);
    onlyThisDue(id);
    expect((await adminClient().rpc("notification_claim", { p_limit: 5 })).data).toEqual([]);
    expect(rowField(id, "status || '|' || error_code")).toBe("skipped|request_not_waiting");
  });

  it("INV-N5: 다시 보낼 간격은 1분·4분·16분 — 꺼낼 때 시도 횟수를 돌려준다", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    const gaps: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const c = await claimOne(id);
      expect(c.attempts).toBe(i);
      await finish(id, "error", { error: "provider_timeout" });
      gaps.push(Number(rowField(id, "round(extract(epoch from next_attempt_at - now()))")));
      forceRow(id, "next_attempt_at = now() - interval '1 second'");
    }
    expect(gaps.map((s) => Math.round(s / 60))).toEqual([1, 4, 16]);
  });

  it("INV-N5 (S5e): 조회 목록에는 10분 지난 카카오 줄만 — 10분 안 된 카카오 줄과 메일 줄은 없다", async () => {
    setTemplate("approval_request", "TPL_APPROVAL_1");
    const g = await paidGift();
    const k = rowId(g.orderId, "approval_request", "haru_creator", "kakao");
    const e = rowId(g.orderId, "approval_request", "haru_creator", "email");
    await claimOne(k);
    await claimOne(e);
    forceRow(e, "claimed_at = now() - interval '11 minutes'");
    const ids = async () => ((await adminClient().rpc("notification_stale_lookups")).data as { id: string }[]).map((r) => r.id);
    expect(await ids()).not.toContain(k); // 아직 10분 안 됨
    expect(await ids()).not.toContain(e); // 메일은 조회가 없다
    forceRow(k, "claimed_at = now() - interval '10 minutes 1 second'");
    expect(await ids()).toContain(k);
  });

  it("INV-N3: 송장만 출력된 주문(출고 전)에는 출고 알림이 없다 — 출고돼야 생긴다", async () => {
    const { g, staff, qrs } = await arrivedGift();
    await inspect(staff, qrs[0]!, FAN_PASS);
    const parcel = psql(`select id from public.office_parcels where qr_code = '${qrs[0]}'`);
    psql(`begin; set local session_replication_role = replica; update public.office_parcels set state = 'label_printed', printed_at = now(), outbound_waybill_no = '${waybill()}' where id = '${parcel}'; commit;`);
    psql(`select public.office_sync_order('${g.orderId}')`);
    expect(orderStatus(g.orderId)).toBe("label_printed");
    expect(outboxRows(g.orderId).filter((r) => r.startsWith("shipped|"))).toEqual([]);
    psql(`begin; set local session_replication_role = replica; update public.office_parcels set state = 'shipped', shipped_at = now() where id = '${parcel}'; commit;`);
    psql(`select public.office_sync_order('${g.orderId}')`);
    expect(outboxRows(g.orderId).filter((r) => r.startsWith("shipped|"))).toEqual(["shipped|1|byeolbit_fan|email|pending"]);
  });

  it("INV-N4 (동시): 같은 주문의 상자 둘이 동시에 입고돼도 팬 입고 줄은 정확히 하나", async () => {
    const g = await paidGift(2);
    // 한 사람은 라벨 대기 하나만 가질 수 있다 — 직원과 대표가 한 상자씩 동시에 받는다
    const people = [await signedInClient("fankkuk_staff"), await signedInClient("fankkuk_admin")];
    const nos = [waybill(), waybill()];
    await fanSetsWaybill(g.boxIds[0]!, nos[0]!);
    await fanSetsWaybill(g.boxIds[1]!, nos[1]!);
    await Promise.all(nos.map((no, i) => receiveAndLabel(people[i]!, no)));
    expect(orderStatus(g.orderId)).toBe("labeled");
    expect(outboxRows(g.orderId).filter((r) => r.startsWith("arrived|"))).toEqual(["arrived|1|byeolbit_fan|email|pending"]);
  });

  it("INV-N3 (실패경로): 줄 넣기·재시도 함수는 누구에게도 실행 권한이 없다 — 사건 처리 안에서만 불린다", () => {
    for (const fn of ["public.notification_enqueue(text, uuid, uuid, smallint, uuid, timestamptz)", "public.notification_retry_or_fail(public.notification_outbox, text)"]) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        expect(psql(`select has_function_privilege('${role}', '${fn}', 'execute')`)).toBe("f");
      }
    }
    // 앱 서버 키는 발송 기록을 지우지도 못한다
    expect(psql(`select has_table_privilege('service_role', '${OUTBOX}', 'delete')`)).toBe("f");
  });

  it("INV-N5 (실패경로): 지킴이 — 대기 아닌 상태로 넣기, 사건 시각 바꾸기는 거부", async () => {
    const g = await paidGift();
    const id = rowId(g.orderId, "approval_request", "haru_creator");
    expect(
      psqlError(
        `insert into ${OUTBOX} (kind, order_id, round, account_id, channel, event_at, status) values ('arrived', '${g.orderId}', 1, '${SEED.fanId}', 'email', now(), 'sent')`,
      ),
    ).toMatch(/대기로만/);
    expect(psqlError(`update ${OUTBOX} set event_at = event_at + interval '1 day' where id = '${id}'`)).toMatch(/이름은 바꿀 수 없다/);
  });
});
