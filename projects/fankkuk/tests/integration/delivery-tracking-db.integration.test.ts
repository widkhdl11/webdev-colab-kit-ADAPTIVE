import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { linkClient, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { FAN_X, giftBoxes } from "./gift-reply-helpers";
import { adminClient, anonClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { dropAddressCopies } from "./office-helpers";
import { deleteTestRevgifts, PROFILE } from "./revgift-helpers";

// 배송 조회 서비스 연결 — DB 가 지키는 것(docs/specs/delivery-status.md INV-DS8~DS12·DS14).
// 웹훅 서명(INV-DS7)은 앱이 DB 앞에서 본다 — 그 시험은 features/delivery-tracking·shared/api/delivery-api 의 유닛 시험.
// 설정값(delivery_settings.source)을 바꾸는 시험은 끝나면 estimate 로 되돌린다(통합 시험은 파일을 하나씩 돌린다).

const A = CV.haru;
const HARU_CREATOR = "00000000-0000-4000-b000-000000000001";
const RECEIVER = "홍길동수령";
const BRANCH = "가산대리점시험";

const setSource = (s: "estimate" | "webhook") => psql(`update public.delivery_settings set source = '${s}'`);
const settings = () => JSON.parse(psql("select row_to_json(s)::text from public.delivery_settings s")) as { copy_after_delivery_hours: number; no_signal_days: number; stale_hours: number; raw_keep_days: number };

function deleteBoxes(): void {
  psql(`delete from public.revgift_boxes where creator_id = '${HARU_CREATOR}' and name = '배송 조회 시험 선물함'`);
}

let seq = 0;
const waybill = () => `7720${String(Date.now()).slice(-6)}${String(++seq).padStart(2, "0")}`;

/** 출고된 팬 선물 상자 하나와 그 조회 줄(시험 준비는 트리거 없이 넣으므로 조회 줄을 직접 만든다). 보낸 팬은 기본 별빛 */
function shippedGift(fanId: string = FAN_X.id): { orderId: string; parcelId: string; waybillNo: string; trackingId: string } {
  const [box] = giftBoxes(fanId, A.creatorId, 1);
  const waybillNo = psql(`select outbound_waybill_no from public.office_parcels where id = '${box!.parcelId}'`);
  const trackingId = psql(
    `insert into public.delivery_trackings (courier_code, waybill_no, parcel_id, subscribe_state, subscribed_at) values ('cj', '${waybillNo}', '${box!.parcelId}', 'subscribed', now()) returning id`,
  ).split("\n")[0]!;
  return { orderId: box!.orderId, parcelId: box!.parcelId, waybillNo, trackingId };
}

/** 하루의 선물함 하나와 별빛의 출고된 신청 — 트리거가 조회 줄을 만든다 */
function shippedApplication(shippedHoursAgo = 1): { boxId: string; appId: string; waybillNo: string } {
  const boxId = psql(
    `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status) values ('${PROFILE.haru}', '${HARU_CREATOR}', '배송 조회 시험 선물함', 10, true, 'paid') returning id`,
  ).split("\n")[0]!;
  const waybillNo = waybill();
  const appId = psql(
    `insert into public.revgift_box_applications (box_id, fan_id, status, chosen_tier, printed_at, shipped_at, outbound_waybill_no)
     values ('${boxId}', '${PROFILE.byeolbit}', 'shipped', 'small', now() - interval '${shippedHoursAgo + 1} hours', now() - interval '${shippedHoursAgo} hours', '${waybillNo}') returning id`,
  ).split("\n")[0]!;
  return { boxId, appId, waybillNo };
}

const item = (waybillNo: string, status: string, progresses: { at: string; status: string }[] = [], courier = "cj") => ({
  courier_code: courier,
  tracking_number: waybillNo,
  status,
  progresses,
  raw: { courierCode: courier, trackingNumber: waybillNo, currentStatus: status, trackingData: { receiverName: RECEIVER, arrivalBranch: BRANCH, progresses } },
});

async function ingest(items: unknown[]): Promise<{ saved: number; ignored: number }> {
  const { data, error } = await adminClient().rpc("delivery_ingest", { p_items: items, p_origin: "webhook" });
  if (error) throw new Error(`delivery_ingest 실패: ${error.code} ${error.message}`);
  return data as { saved: number; ignored: number };
}

const tracking = (id: string) =>
  JSON.parse(psql(`select row_to_json(t)::text from public.delivery_trackings t where t.id = '${id}'`)) as {
    carrier_state: string | null;
    delivered_at: string | null;
    last_event_at: string | null;
  };
const count = (sql: string) => Number(psql(sql));

beforeAll(() => {
  createCvAccounts();
});
beforeEach(() => {
  setSource("estimate");
  deleteTestOrders();
  deleteTestRevgifts();
  deleteBoxes();
  resetCv();
  verifyCreator(A.creatorId, "cvt-delivery-track");
});
afterEach(() => {
  setSource("estimate");
});
afterAll(() => {
  setSource("estimate");
  deleteTestOrders();
  deleteBoxes();
  deleteTestRevgifts();
  dropCvAccounts();
});

describe("INV-DS12: 송장번호 저장 → 구독 대기 줄", () => {
  it("INV-DS12: 선물함 신청에 출고 송장번호가 저장되면 같은 처리에서 대기 줄이 생긴다 — 기본 경로 로지아이 → cj", () => {
    const { appId, waybillNo } = shippedApplication();
    const route = psql("select default_route from public.pricing_settings");
    const expected = route === "post_office" ? "post" : route === "agency" ? "" : "cj";
    expect(psql(`select coalesce(string_agg(courier_code || ':' || waybill_no || ':' || subscribe_state, ','), '') from public.delivery_trackings where application_id = '${appId}'`)).toBe(
      expected ? `${expected}:${waybillNo}:pending` : "",
    );
  });

  it("INV-DS12 (실패경로): 같은 송장번호가 이미 있어도 송장 저장은 실패하지 않는다(대기 줄만 하나)", () => {
    const a = shippedApplication();
    psql(`update public.revgift_box_applications set outbound_waybill_no = '${a.waybillNo}' where id = '${a.appId}'`);
    const b = shippedApplication();
    expect(psql(`update public.revgift_box_applications set outbound_waybill_no = '${a.waybillNo}' where id = '${b.appId}' returning outbound_waybill_no`).split("\n")[0]).toBe(a.waybillNo);
    expect(count(`select count(*) from public.delivery_trackings where waybill_no = '${a.waybillNo}'`)).toBe(1);
  });

  it("INV-DS9·DS12: 송장번호를 고쳐 넣으면 이전 번호의 조회 줄은 지워지고 새 번호의 줄이 생긴다 — 이전 번호로 온 웹훅은 무시된다", async () => {
    const a = shippedApplication();
    const next = waybill();
    psql(`update public.revgift_box_applications set outbound_waybill_no = '${next}' where id = '${a.appId}'`);
    expect(psql(`select string_agg(waybill_no, ',') from public.delivery_trackings where application_id = '${a.appId}'`)).toBe(next);
    expect(await ingest([item(a.waybillNo, "DELIVERED")])).toEqual({ saved: 0, ignored: 1 });
  });

  it("INV-DS12: 대기 줄 잡기는 겹쳐 불러도 같은 줄을 두 번 내주지 않고, 결과 null 이면 구독됨·오류면 대기 그대로", async () => {
    const { appId } = shippedApplication();
    const id = psql(`select id from public.delivery_trackings where application_id = '${appId}'`);
    psql(`update public.delivery_trackings set next_try_at = now() - interval '1 second' where id = '${id}'`);
    const admin = adminClient();
    const first = (await admin.rpc("delivery_subscribe_claim", { p_limit: 100 })).data as { id: string }[];
    expect(first.map((r) => r.id)).toContain(id);
    const second = (await admin.rpc("delivery_subscribe_claim", { p_limit: 100 })).data as { id: string }[];
    expect(second.map((r) => r.id)).not.toContain(id);
    await admin.rpc("delivery_subscribe_result", { p_ids: [id], p_error: "RATE_LIMITED" });
    expect(psql(`select subscribe_state || ':' || subscribe_error from public.delivery_trackings where id = '${id}'`)).toBe("pending:RATE_LIMITED");
    await admin.rpc("delivery_subscribe_result", { p_ids: [id], p_error: null });
    expect(psql(`select subscribe_state || ':' || (subscribed_at is not null) from public.delivery_trackings where id = '${id}'`)).toBe("subscribed:true");
  });

  it("INV-DS12 (실패경로): 대기 줄 함수는 로그인 사용자가 부를 수 없다", async () => {
    const fan = await linkClient(FAN_X.login);
    expect((await fan.rpc("delivery_subscribe_claim", { p_limit: 1 })).error).not.toBeNull();
    expect((await fan.rpc("delivery_ingest", { p_items: [], p_origin: "webhook" })).error).not.toBeNull();
  });
});

describe("INV-DS8·DS9: 수신 처리", () => {
  it("INV-DS9 (실패경로): 팬꾹이 등록하지 않은 송장은 아무것도 남기지 않는다", async () => {
    const before = count("select count(*) from public.delivery_tracking_raw");
    expect(await ingest([item("990000000001", "DELIVERED")])).toEqual({ saved: 0, ignored: 1 });
    expect(count("select count(*) from public.delivery_tracking_raw")).toBe(before);
  });

  it("INV-DS8: 같은 본문 두 번 → 이력·원본 줄 수 그대로, 단계 같음", async () => {
    const g = shippedGift();
    const body = [item(g.waybillNo, "IN_TRANSIT", [{ at: "2026-11-09T10:00:00+09:00", status: "PICKED_UP" }, { at: "2026-11-09T18:00:00+09:00", status: "IN_TRANSIT" }])];
    await ingest(body);
    const events = count(`select count(*) from public.delivery_tracking_events where tracking_id = '${g.trackingId}'`);
    const raws = count(`select count(*) from public.delivery_tracking_raw where tracking_id = '${g.trackingId}'`);
    expect([events, raws]).toEqual([2, 1]);
    await ingest(body);
    expect(count(`select count(*) from public.delivery_tracking_events where tracking_id = '${g.trackingId}'`)).toBe(events);
    expect(count(`select count(*) from public.delivery_tracking_raw where tracking_id = '${g.trackingId}'`)).toBe(raws);
    expect(tracking(g.trackingId).carrier_state).toBe("in_transit");
  });

  it("INV-DS8 (실패경로): 배달 완료 뒤 배송 중이 와도 배달 완료 그대로, 배달 완료 시각도 그대로", async () => {
    const g = shippedGift();
    await ingest([item(g.waybillNo, "DELIVERED")]);
    const first = tracking(g.trackingId);
    expect(first.carrier_state).toBe("delivered");
    await ingest([item(g.waybillNo, "IN_TRANSIT")]);
    await ingest([item(g.waybillNo, "DELIVERED")]);
    const after = tracking(g.trackingId);
    expect(after.carrier_state).toBe("delivered");
    expect(after.delivered_at).toBe(first.delivered_at);
  });

  it("INV-DS8: 단계가 없는 상태 코드(HOLD·FAILED)는 단계를 바꾸지 않는다", async () => {
    const g = shippedGift();
    await ingest([item(g.waybillNo, "PICKED_UP")]);
    await ingest([item(g.waybillNo, "HOLD")]);
    expect(tracking(g.trackingId).carrier_state).toBe("picked_up");
  });
});

describe("INV-DS10: 원본은 따로, 화면·응답에는 단계만", () => {
  it("INV-DS10: 원본에는 수령인·대리점이 있지만 팬·크리에이터·운영자 읽기 응답 어디에도 없다 — 단계는 있다", async () => {
    setSource("webhook");
    const g = shippedGift();
    const app = shippedApplication();
    await ingest([item(g.waybillNo, "IN_TRANSIT"), item(app.waybillNo, "IN_TRANSIT")]);
    expect(psql(`select body::text from public.delivery_tracking_raw where tracking_id = '${g.trackingId}'`)).toContain(RECEIVER);

    const creator = await linkClient(A.login);
    const fanX = await linkClient(FAN_X.login);
    const byeolbit = await signedInClient("byeolbit_fan");
    const haru = await signedInClient("haru_creator");
    const reads = {
      my_received_boxes: (await creator.rpc("my_received_boxes")).data,
      my_gifts: (await fanX.rpc("my_gifts")).data,
      revgift_box_for_fan: (await byeolbit.rpc("revgift_box_for_fan", { p_box_id: app.boxId, p_token: null })).data,
      my_revgift_box: (await haru.rpc("my_revgift_box", { p_box_id: app.boxId })).data,
      admin_delivery_watch: (await (await signedInClient("fankkuk_staff")).rpc("admin_delivery_watch")).data,
    };
    for (const [name, data] of Object.entries(reads)) {
      expect(data, name).not.toBeNull();
      const text = JSON.stringify(data);
      expect(text, name).not.toContain(RECEIVER);
      expect(text, name).not.toContain(BRANCH);
      expect(text, name).not.toContain(g.waybillNo);
      expect(text, name).not.toContain(app.waybillNo);
    }
    // 단계는 찾힌다 — 찾는 방법이 동작한다
    const mine = (reads.my_received_boxes as { box_id: string; carrier: string | null }[]).map((r) => r.carrier);
    expect(mine).toContain("in_transit");
    expect((reads.revgift_box_for_fan as { delivery: { carrier: string } }).delivery.carrier).toBe("in_transit");
  });

  it("INV-DS10 (실패경로): 로그인 사용자·익명은 원본·이력·조회 줄 표를 읽지 못한다", async () => {
    const fan = await linkClient(FAN_X.login);
    for (const table of ["delivery_tracking_raw", "delivery_tracking_events", "delivery_trackings", "delivery_settings"]) {
      expect((await fan.from(table).select("*").limit(1)).error, table).not.toBeNull();
      expect((await anonClient().from(table).select("*").limit(1)).error, table).not.toBeNull();
    }
  });

  it("INV-DS10: 받은 때 + 90일이 지난 원본은 정리 처리에서 지워지고, 그 안쪽은 남는다", async () => {
    const g = shippedGift();
    await ingest([item(g.waybillNo, "PICKED_UP")]);
    await ingest([item(g.waybillNo, "IN_TRANSIT", [{ at: "2026-11-09T18:00:00+09:00", status: "IN_TRANSIT" }])]);
    const keep = settings().raw_keep_days;
    const ids = psql(`select string_agg(id::text, ',' order by id) from public.delivery_tracking_raw where tracking_id = '${g.trackingId}'`).split(",");
    expect(ids.length).toBe(2);
    psql(`update public.delivery_tracking_raw set received_at = now() - make_interval(days => ${keep}) - interval '1 minute' where id = ${ids[0]}`);
    psql(`update public.delivery_tracking_raw set received_at = now() - make_interval(days => ${keep}) + interval '1 hour' where id = ${ids[1]}`);
    psql("select public.delivery_raw_purge()");
    expect(psql(`select coalesce(string_agg(id::text, ','), '') from public.delivery_tracking_raw where tracking_id = '${g.trackingId}'`)).toBe(ids[1]);
  });
});

describe("INV-DS11: 설정값 하나로 넷이 함께", () => {
  it("INV-DS11 ② (실패경로): estimate 에서는 배달 완료를 받아도 선물함 신청 shipped·주문 배송 칸 그대로", async () => {
    const g = shippedGift();
    const app = shippedApplication();
    await ingest([item(g.waybillNo, "DELIVERED"), item(app.waybillNo, "DELIVERED")]);
    expect(psql(`select status from public.revgift_box_applications where id = '${app.appId}'`)).toBe("shipped");
    expect(psql(`select coalesce(delivery, '') from public.orders where id = '${g.orderId}'`)).toBe("");
  });

  it("INV-DS11 ②: webhook 이면 배달 완료 수신 때 선물함 신청 delivered, 주문은 배송 중 → 배달 완료", async () => {
    setSource("webhook");
    const g = shippedGift();
    const app = shippedApplication();
    await ingest([item(g.waybillNo, "IN_TRANSIT")]);
    expect(psql(`select delivery from public.orders where id = '${g.orderId}'`)).toBe("in_transit");
    await ingest([item(g.waybillNo, "DELIVERED"), item(app.waybillNo, "DELIVERED")]);
    expect(psql(`select delivery from public.orders where id = '${g.orderId}'`)).toBe("delivered");
    expect(psql(`select status from public.revgift_box_applications where id = '${app.appId}'`)).toBe("delivered");
  });

  it("INV-DS11 ③: 사본 지울 때 — estimate 출고 + 72시간 / webhook 배달 완료 + 24시간, 배달 완료가 없으면 출고 + 14일", () => {
    const app = shippedApplication(73);
    const due = () => psql(`select public.delivery_copy_drop_due(null, '${app.appId}', a.shipped_at, 72) from public.revgift_box_applications a where a.id = '${app.appId}'`);
    const s = settings();
    expect(due()).toBe("t");
    setSource("webhook");
    expect(due()).toBe("f");
    psql(`update public.delivery_trackings set carrier_state = 'delivered', delivered_at = now() - make_interval(hours => ${s.copy_after_delivery_hours}) + interval '1 minute' where application_id = '${app.appId}'`);
    expect(due()).toBe("f");
    psql(`update public.delivery_trackings set delivered_at = now() - make_interval(hours => ${s.copy_after_delivery_hours}) - interval '1 minute' where application_id = '${app.appId}'`);
    expect(due()).toBe("t");
    psql(`update public.delivery_trackings set carrier_state = null, delivered_at = null where application_id = '${app.appId}'`);
    psql(`update public.revgift_box_applications set shipped_at = now() - make_interval(days => ${s.no_signal_days}) - interval '1 minute' where id = '${app.appId}'`);
    expect(due()).toBe("t");
  });

  it("INV-DS11 ③: 선물함 자동 처리 — webhook 이면 출고 + 72시간이 지나도 배달 완료 전에는 사본을 지우지 않고, estimate 면 지운다", () => {
    const app = shippedApplication(73);
    setSource("webhook");
    psql("select public.revgift_box_tick()");
    expect(psql(`select copy_dropped_at is null from public.revgift_box_applications where id = '${app.appId}'`)).toBe("t");
    setSource("estimate");
    psql("select public.revgift_box_tick()");
    expect(psql(`select copy_dropped_at is null from public.revgift_box_applications where id = '${app.appId}'`)).toBe("f");
  });

  // 다른 진행 중인 일이 없는 시드 팬(솜사탕) — 별빛은 시드 주문이 있어 늘 진행 중이다
  const open = () => psql(`select public.account_has_open_work('${PROFILE.somsatang}', null)`);

  it("INV-DS11 ④: 탈퇴 — estimate 면 출고로 끝, webhook 이면 배달 완료 전에는 진행 중, 배달 완료 뒤 끝", async () => {
    expect(open()).toBe("f");
    const g = shippedGift(PROFILE.somsatang);
    expect(open()).toBe("f");
    setSource("webhook");
    expect(open()).toBe("t");
    await ingest([item(g.waybillNo, "DELIVERED")]);
    expect(open()).toBe("f");
  });

  it("INV-DS11 ④ (실패경로): webhook 이어도 배달 완료가 오지 않은 채 출고 + 14일이면 끝으로 본다, 조회 줄이 없는 출고는 출고로 끝", () => {
    const g = shippedGift(PROFILE.somsatang);
    setSource("webhook");
    expect(open()).toBe("t");
    psql(`update public.office_parcels set shipped_at = now() - make_interval(days => ${settings().no_signal_days}) - interval '1 minute' where id = '${g.parcelId}'`);
    expect(open()).toBe("f");
    psql(`update public.office_parcels set shipped_at = now() where id = '${g.parcelId}'`);
    psql(`delete from public.delivery_trackings where id = '${g.trackingId}'`);
    expect(open()).toBe("f");
  });

  it("INV-DS11 ③ (manual/0035 뒤): 역조공 몫 사본 — webhook 이면 출고 + 72시간이 지나도 배달 완료 전에는 남고, 배달 완료 + 24시간 뒤 지워진다", async () => {
    // 결제·받기·검수·출고를 거친 몫을 바로 넣는다(그 경로는 reverse-gift 시험이 본다). 정리는 deleteTestRevgifts(toss_order_id 앞머리)
    const no = waybill();
    const tag = no.slice(-8);
    const shareId = psql(
      `begin; set local session_replication_role = replica;
       with d as (insert into public.revgift_sends (sender_id, creator_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, payment_key, settled_at)
                  values ('${PROFILE.haru}', '${HARU_CREATOR}', 'pay_test_rg_dt${tag}', 5000, 0, 1000, 0, 4000, 'done', 'pk_dt${tag}', now() - interval '100 hours') returning id)
       insert into public.revgift_shares (send_id, seq, order_no, fan_id, tier, amount_krw, shipping_fee_krw, reply, replied_at, received_at, inspected_at, shipped_at)
       select d.id, 1, 'RG-DT${tag}', '${PROFILE.byeolbit}', 'small', 5000, 4000, 'accepted', now() - interval '90 hours', now() - interval '88 hours', now() - interval '85 hours', now() - interval '73 hours' from d
       returning id; commit;`,
    ).split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l))!;
    psql(
      `begin; set local session_replication_role = replica;
       insert into pii.revgift_addresses (share_id, envelope) values ('${shareId}', '{}'::jsonb) on conflict do nothing;
       insert into public.office_parcels (share_id, state, received_at, inspected_at, printed_at, shipped_at, outbound_waybill_no)
       values ('${shareId}', 'shipped', now() - interval '90 hours', now() - interval '85 hours', now() - interval '74 hours', now() - interval '73 hours', '${no}');
       commit;`,
    );
    psql(`insert into public.delivery_trackings (courier_code, waybill_no, parcel_id, subscribe_state, subscribed_at) select 'cj', '${no}', id, 'subscribed', now() from public.office_parcels where share_id = '${shareId}'`);
    const copies = () => count(`select count(*) from pii.revgift_addresses where share_id = '${shareId}'`);
    try {
      setSource("webhook");
      dropAddressCopies();
      expect(copies()).toBe(1);
      psql(`update public.delivery_trackings set carrier_state = 'delivered', delivered_at = now() - interval '25 hours' where waybill_no = '${no}'`);
      dropAddressCopies();
      expect(copies()).toBe(0);
    } finally {
      // 몫을 지우는 다른 정리(replica)가 상자를 남기지 않게 이 시험이 넣은 상자·조회 줄·사본을 직접 지운다
      psql(
        `begin; set local session_replication_role = replica;
         delete from public.delivery_trackings where waybill_no = '${no}';
         delete from pii.revgift_addresses where share_id = '${shareId}';
         delete from public.revgift_address_events where share_id = '${shareId}';
         delete from public.office_parcels where share_id = '${shareId}';
         commit;`,
      );
    }
  });
});

describe("INV-DS14: 운영자 — 24시간 경고·수동 조회 대상", () => {
  it("INV-DS14: 마지막 수신이 24시간 넘은 송장은 경고(끝 네 자리만), 23시간이면 목록에 없다", async () => {
    const g1 = shippedGift();
    const g2 = shippedGift();
    const h = settings().stale_hours;
    psql(`update public.delivery_trackings set last_event_at = now() - make_interval(hours => ${h}) - interval '1 hour' where id = '${g1.trackingId}'`);
    psql(`update public.delivery_trackings set last_event_at = now() - make_interval(hours => ${h}) + interval '1 hour' where id = '${g2.trackingId}'`);
    const staff = await signedInClient("fankkuk_staff");
    const rows = (await staff.rpc("admin_delivery_watch")).data as { tracking_id: string; stale: boolean; waybill_last4: string }[];
    const r1 = rows.find((r) => r.tracking_id === g1.trackingId);
    expect(r1).toMatchObject({ stale: true, waybill_last4: g1.waybillNo.slice(-4) });
    expect(rows.some((r) => r.tracking_id === g2.trackingId)).toBe(false);
  });

  it("INV-DS14 (실패경로): 배달 완료는 경고하지 않는다 · 운영자가 아니면 빈 목록 · 조회 대상은 운영자만", async () => {
    const g = shippedGift();
    psql(`update public.delivery_trackings set last_event_at = now() - interval '30 hours', carrier_state = 'delivered', delivered_at = now() - interval '30 hours' where id = '${g.trackingId}'`);
    const staff = await signedInClient("fankkuk_staff");
    expect(((await staff.rpc("admin_delivery_watch")).data as { tracking_id: string }[]).some((r) => r.tracking_id === g.trackingId)).toBe(false);
    psql(`update public.delivery_trackings set carrier_state = null, delivered_at = null where id = '${g.trackingId}'`);
    const fan = await linkClient(FAN_X.login);
    expect((await fan.rpc("admin_delivery_watch")).data).toEqual([]);
    expect((await fan.rpc("admin_delivery_trace_targets", { p_ids: [g.trackingId] })).error?.code).toBe("42501");
    const targets = (await staff.rpc("admin_delivery_trace_targets", { p_ids: [g.trackingId] })).data as { waybill_no: string }[];
    expect(targets.map((t) => t.waybill_no)).toEqual([g.waybillNo]);
  });
});
