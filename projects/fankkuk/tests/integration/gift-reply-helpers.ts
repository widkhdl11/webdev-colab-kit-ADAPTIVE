import { insertOrder } from "./creator-link-helpers";
import { psql, SEED } from "./helpers";

// 받았어요 · 감사 답장(gift-reply) 시험 도구 — DB 시험(gift-reply-db)과 공유 카드 라우트 시험(gift-reply-card-route)이 같이 쓴다.
// 주문·상자·사무실 상자 줄은 psql 로 바로 넣는다(물품 이름 「시험 선물」 — deleteTestOrders 가 상자·답장·알림 줄까지 같이 지운다).

export const FAN_X = { id: SEED.fanId, login: "byeolbit_fan", nickname: "별빛" };
export const FAN_Y = { id: SEED.otherFanId, login: "daltokki_fan", nickname: "달토끼" };

let waybillSeq = 0;
function waybill(): string {
  waybillSeq += 1;
  return `9${String(Date.now()).slice(-8)}${String(waybillSeq).padStart(3, "0")}`;
}

/** psql 출력에서 RETURNING 으로 돌려받은 uuid 한 줄. */
export function uuidLine(out: string): string {
  const hit = out.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l));
  if (!hit) throw new Error(`uuid 를 돌려받지 못했다: ${out}`);
  return hit;
}

export type Box = { orderNo: string; orderId: string; boxId: string; parcelId: string };

/**
 * 결제가 끝난 주문 하나와 상자 n 개를 넣는다. state 는 사무실 상자 상태(shipped = 출고, inspected = 검수 완료).
 * 출고 상자는 사무실 상자 줄이 출고 상태이고 출고 운송장이 있다.
 */
export function giftBoxes(fanId: string, creatorId: string, n: number, state: "shipped" | "inspected" = "shipped"): Box[] {
  const orderNo = insertOrder(fanId, creatorId, state === "shipped" ? "shipped" : "inspected", "now() - interval '5 days'");
  const orderId = psql(`select id from public.orders where order_no = '${orderNo}'`);
  const boxes: Box[] = [];
  for (let seq = 1; seq <= n; seq++) {
    const boxId = uuidLine(psql(
      `begin; set local session_replication_role = replica;
       insert into public.boxes (order_id, seq, declared_tier, price_krw, shipping_fee_krw, inspection_fee_krw)
       values ('${orderId}', ${seq}, 'small', 6900, 4000, 2900) returning id; commit;`,
    ));
    const shipped = state === "shipped";
    const parcelId = uuidLine(psql(
      `begin; set local session_replication_role = replica;
       insert into public.office_parcels (box_id, state, received_at, inspected_at, printed_at, shipped_at, outbound_waybill_no)
       values ('${boxId}', '${state}', now() - interval '4 days', now() - interval '3 days',
               ${shipped ? "now() - interval '2 days'" : "null"}, ${shipped ? "now() - interval '2 days'" : "null"}, ${shipped ? `'${waybill()}'` : "null"})
       returning id; commit;`,
    ));
    boxes.push({ orderNo, orderId, boxId, parcelId });
  }
  return boxes;
}

/** 답장 모음·X 설정을 끈다 — 칸이 없을 때(구현 전 빨간불)도 멈추지 않게. ids 는 따옴표 친 크리에이터 ID 목록. */
export function resetReplySettings(ids: string): void {
  psql(
    `do $$ begin
       if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'reply_wall_visible') then
         execute $q$update public.creators set reply_wall_visible = false, x_handle = null, x_tag_allowed = false where id in (${ids})$q$;
       end if;
     end $$;`,
  );
}

/** 받았어요 시각을 한국 시간 오늘에서 days 일 전 그날의 시각(HH:MI)으로 옮긴다 — 3일 경계 시험용. */
export function receivedDaysAgo(boxId: string, days: number, time: string): void {
  psql(
    `begin; set local session_replication_role = replica;
     update public.gift_replies set received_at = ((public.receiving_today() - ${days})::timestamp + time '${time}') at time zone 'Asia/Seoul'
     where box_id = '${boxId}'; commit;`,
  );
}

/** 한국 시간 오늘 그 시각(HH:MI)의 timestamptz 식 — UTC 로 날짜를 자르면 00:30 은 어제가 된다(INV-G6 시험용). */
export function kstTodayAt(time: string): string {
  return `((public.receiving_today())::timestamp + time '${time}') at time zone 'Asia/Seoul'`;
}
