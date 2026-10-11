import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readMyGiftReplies, readMyReceivedBoxes, readMyReplyCard, readMyReplyPending, readReplyWall } from "@/entities/gift-reply/api/gift-reply-reads";
import { insertOrder, linkClient, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { anonClient, deleteTestOrders, holdRowLock, psql, SEED } from "./helpers";

// 받았어요 · 감사 답장 · 답장 공유 카드 · 감사 답장 모음 (docs/specs/gift-reply.md INV-G1~G10, S1~S10) 중 DB 가 지키는 것.
// 알림 본문 틀(INV-G5 본문)과 공유 문구(INV-G9 S9b 의 글)는 src 단위 시험(notification-body.test.ts · entities/gift-reply/model/reply.test.ts)에도 있다.
// 크리에이터는 본인 확인 시험 계정(cvt_*) — 공개 모음이 본인 확인된 크리에이터만 보이므로 시험 동안 확인된 상태로 둔다.
// 주문·상자·사무실 상자 줄은 psql 로 바로 넣는다(물품 이름 「시험 선물」 — deleteTestOrders 가 상자·답장·알림 줄까지 같이 지운다).

const A = CV.haru; // 받는 크리에이터
const B = CV.summer; // 다른 크리에이터
const FAN_X = { id: SEED.fanId, login: "byeolbit_fan", nickname: "별빛" };
const FAN_Y = { id: SEED.otherFanId, login: "daltokki_fan", nickname: "달토끼" };
const client = linkClient;
const IDS = [A, B].map((c) => `'${c.creatorId}'`).join(", ");

let waybillSeq = 0;
function waybill(): string {
  waybillSeq += 1;
  return `9${String(Date.now()).slice(-8)}${String(waybillSeq).padStart(3, "0")}`;
}

/** psql 출력에서 RETURNING 으로 돌려받은 uuid 한 줄. */
function uuidLine(out: string): string {
  const hit = out.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l));
  if (!hit) throw new Error(`uuid 를 돌려받지 못했다: ${out}`);
  return hit;
}

type Box = { orderNo: string; orderId: string; boxId: string; parcelId: string };

/**
 * 결제가 끝난 주문 하나와 상자 n 개를 넣는다. state 는 사무실 상자 상태(shipped = 출고, inspected = 검수 완료).
 * 출고 상자는 사무실 상자 줄이 출고 상태이고 출고 운송장이 있다.
 */
function giftBoxes(fanId: string, creatorId: string, n: number, state: "shipped" | "inspected" = "shipped"): Box[] {
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

async function confirm(login: string, boxId: string, phrase: string | null = null, line: string | null = null) {
  return (await client(login)).rpc("confirm_gift_box", { p_box_id: boxId, p_phrase: phrase, p_line: line });
}

function replyRow(boxId: string): string {
  return psql(
    `select coalesce((select coalesce(phrase, '-') || '|' || coalesce(line, '-') || '|' || (replied_at is not null)::text || '|' || (deleted_at is not null)::text
                        from public.gift_replies where box_id = '${boxId}'), '')`,
  );
}

function replyRows(boxId: string): number {
  return Number(psql(`select count(*) from public.gift_replies where box_id = '${boxId}'`));
}

/** 그 상자의 이메일 알림 줄 종류(쉼표로). 카카오 줄은 템플릿이 있을 때만 생겨 이메일 줄로 센다. */
function mailKinds(parcelId: string): string {
  return psql(`select coalesce(string_agg(kind, ',' order by created_at, kind), '') from public.notification_outbox where parcel_id = '${parcelId}' and channel = 'email'`);
}

function resetReplySettings(): void {
  psql(
    `do $$ begin
       if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'reply_wall_visible') then
         execute $q$update public.creators set reply_wall_visible = false, x_handle = null, x_tag_allowed = false where id in (${IDS})$q$;
       end if;
     end $$;`,
  );
}

async function wallOf(creatorId: string): Promise<{ phrase: string; line: string | null; replied_on: string; fan_nickname: string | null }[]> {
  const r = await anonClient().rpc("creator_reply_wall", { p_creator_id: creatorId });
  if (r.error) throw new Error(`답장 모음 읽기 실패: ${r.error.code}`);
  return r.data as { phrase: string; line: string | null; replied_on: string; fan_nickname: string | null }[];
}

async function settings(login: string, wall: boolean, xHandle: string | null = null, tag = false) {
  return (await client(login)).rpc("update_my_reply_settings", { p_wall_visible: wall, p_x_handle: xHandle, p_x_tag_allowed: tag });
}

async function consent(login: string, boxId: string, isPublic: boolean, showNickname: boolean) {
  return (await client(login)).rpc("set_gift_reply_consent", { p_box_id: boxId, p_public: isPublic, p_show_nickname: showNickname });
}

/** 받았어요 시각을 한국 시간 오늘에서 days 일 전 그날의 시각(HH:MI)으로 옮긴다 — 3일 경계 시험용. */
function receivedDaysAgo(boxId: string, days: number, time: string): void {
  psql(
    `begin; set local session_replication_role = replica;
     update public.gift_replies set received_at = ((public.receiving_today() - ${days})::timestamp + time '${time}') at time zone 'Asia/Seoul'
     where box_id = '${boxId}'; commit;`,
  );
}

beforeAll(() => {
  createCvAccounts();
});
beforeEach(() => {
  deleteTestOrders();
  resetCv();
  resetReplySettings();
  verifyCreator(A.creatorId, "cvt-reply-a");
  verifyCreator(B.creatorId, "cvt-reply-b");
});
afterAll(() => {
  deleteTestOrders();
  resetReplySettings();
  dropCvAccounts();
});

describe("INV-G1: 받았어요·답장은 받는 크리에이터 본인만, 출고 뒤에만", () => {
  it("INV-G1 S1 (실패경로): 크리에이터 B·팬은 A 가 받은 상자에 받았어요·답장을 남길 수 없고 아무것도 남지 않는다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(B.login, box.boxId, "thanks", "고마워요")).error?.code).toBe("P0002");
    expect((await confirm(B.login, box.boxId)).error?.code).toBe("P0002");
    expect((await confirm(FAN_X.login, box.boxId)).error?.code).toBe("42501");
    expect((await anonClient().rpc("confirm_gift_box", { p_box_id: box.boxId, p_phrase: null, p_line: null })).error).not.toBeNull();
    expect(replyRows(box.boxId)).toBe(0);
    expect(mailKinds(box.parcelId)).toBe("");
  });

  it("INV-G1 (실패경로): 크리에이터 ID 를 덧붙여 부르면 그런 함수가 없다고 거부된다 — 받는 사람은 로그인 토큰으로만 정한다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    const r = await (await client(B.login)).rpc("confirm_gift_box", { p_box_id: box.boxId, p_phrase: null, p_line: null, p_creator_id: A.creatorId });
    expect(r.error).not.toBeNull();
    expect(replyRows(box.boxId)).toBe(0);
  });

  it("INV-G1 S1b (실패경로): 검수 완료(출고 전) 상자는 거부되고, 출고된 상자는 된다", async () => {
    const [early] = giftBoxes(FAN_X.id, A.creatorId, 1, "inspected");
    expect((await confirm(A.login, early.boxId)).error?.code).toBe("P0100");
    expect(replyRows(early.boxId)).toBe(0);
    const [shipped] = giftBoxes(FAN_X.id, A.creatorId, 1);
    const ok = await confirm(A.login, shipped.boxId);
    expect(ok.error).toBeNull();
    expect(ok.data).toBe("received");
    expect(replyRow(shipped.boxId)).toBe("-|-|false|false");
  });
});

describe("INV-G2: 받았어요는 상자마다 한 번", () => {
  it("INV-G2 S2 (동시): 받았어요를 동시에 두 번 보내도 기록 하나·알림 하나", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    // 두 요청이 상자 줄 잠금 뒤에 줄을 서게 해 확실히 겹치게 만든다(답장 줄의 외래 키 확인이 상자 줄을 잠근다)
    const held = await holdRowLock(`select 1 from public.boxes where id = '${box.boxId}' for update`, 1.5);
    const [r1, r2] = await Promise.all([confirm(A.login, box.boxId), confirm(A.login, box.boxId)]);
    await held.released;
    expect([r1.error, r2.error]).toEqual([null, null]);
    expect([r1.data, r2.data].sort()).toEqual(["received", "unchanged"]);
    expect(replyRows(box.boxId)).toBe(1);
    expect(mailKinds(box.parcelId)).toBe("gift_received");
  });

  it("INV-G2 S2 (동시): 답장과 함께 동시에 두 번 보내도 기록 하나·알림 하나, 늦은 쪽은 「이미 답장」으로 거부된다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    const held = await holdRowLock(`select 1 from public.boxes where id = '${box.boxId}' for update`, 1.5);
    const [r1, r2] = await Promise.all([confirm(A.login, box.boxId, "thanks", "첫 답장"), confirm(A.login, box.boxId, "love_it", "둘째 답장")]);
    await held.released;
    const codes = [r1.error?.code ?? "ok", r2.error?.code ?? "ok"].sort();
    expect(codes).toEqual(["P0101", "ok"]);
    expect(replyRows(box.boxId)).toBe(1);
    expect(mailKinds(box.parcelId)).toBe("gift_reply");
  });

  it("INV-G2 S2b: 확인만 한 상자에 답장을 더하면 저장되고 「답장이 왔어요」 알림 하나가 더 간다 — 다시 확인만 눌러도 그대로", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(A.login, box.boxId)).data).toBe("received");
    expect((await confirm(A.login, box.boxId)).data).toBe("unchanged");
    expect(mailKinds(box.parcelId)).toBe("gift_received");
    const added = await confirm(A.login, box.boxId, "will_use", "잘 쓸게요!");
    expect(added.error).toBeNull();
    expect(added.data).toBe("replied");
    expect(replyRow(box.boxId)).toBe("will_use|잘 쓸게요!|true|false");
    expect(mailKinds(box.parcelId)).toBe("gift_received,gift_reply");
    // 답장은 고칠 수 없다(INV-G4) — 같은 상자에 다시 답장하면 거부
    expect((await confirm(A.login, box.boxId, "love_it", null)).error?.code).toBe("P0101");
    expect(replyRow(box.boxId)).toBe("will_use|잘 쓸게요!|true|false");
  });
});

describe("INV-G3: 정해진 문구 다섯 + 한 줄 80자, 업계 기본 필터", () => {
  it("INV-G3 S3 (실패경로): 목록 밖 문구·81자·줄바꿈·전화번호·이메일·주소 꼴·금칙어는 각각 거부되고 아무것도 남지 않는다", async () => {
    const cases: [string | null, string | null, string][] = [
      ["잘 받았어요, 고마워요", null, "22023"], // 문구 글자가 아니라 정해진 코드만 받는다
      ["free_text", null, "22023"],
      ["thanks", "가".repeat(81), "22023"],
      ["thanks", "첫 줄\n둘째 줄", "22023"],
      ["thanks", "보이지\u200b않는 글자", "22023"],
      ["thanks", "연락 주세요 010-1234-5678", "P0082"],
      ["thanks", "메일 fan@example.com", "P0082"],
      ["thanks", "여기로 www.example.com", "P0082"],
      ["thanks", "씨발 고마워", "P0081"],
      [null, "문구 없이 한 줄만", "22023"],
    ];
    const boxes = giftBoxes(FAN_X.id, A.creatorId, cases.length);
    for (let i = 0; i < cases.length; i++) {
      const [phrase, line, code] = cases[i];
      const r = await confirm(A.login, boxes[i].boxId, phrase, line);
      expect(r.error?.code, `${phrase} / ${line}`).toBe(code);
      expect(replyRows(boxes[i].boxId)).toBe(0);
      expect(mailKinds(boxes[i].parcelId)).toBe("");
    }
  });

  it("INV-G3 S3: 다섯 문구는 저장되고, 앞뒤 공백을 뺀 80자·빈칸은 저장된다", async () => {
    const phrases = ["thanks", "love_it", "will_use", "cheered", "touched"];
    const boxes = giftBoxes(FAN_X.id, A.creatorId, phrases.length + 1);
    for (let i = 0; i < phrases.length; i++) {
      const line = i === 0 ? `  ${"나".repeat(80)}  ` : i === 1 ? "   " : null;
      expect((await confirm(A.login, boxes[i].boxId, phrases[i], line)).error).toBeNull();
    }
    expect(replyRow(boxes[0].boxId)).toBe(`thanks|${"나".repeat(80)}|true|false`);
    expect(replyRow(boxes[1].boxId)).toBe("love_it|-|true|false");
    expect(replyRow(boxes[4].boxId)).toBe("touched|-|true|false");
  });
});

describe("INV-G4: 답장은 지우기만, 지운 상자엔 다시 쓰지 않는다", () => {
  it("INV-G4 S4: 공개된 답장을 지우면 팬의 기록·모음·카드에서 사라지고, 같은 상자에 다시 쓰기는 거부된다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await settings(A.login, true)).error).toBeNull();
    expect((await confirm(A.login, box.boxId, "touched", "정말 고마워요")).error).toBeNull();
    expect((await consent(FAN_X.login, box.boxId, true, true)).error).toBeNull();
    receivedDaysAgo(box.boxId, 3, "10:00");
    expect((await wallOf(A.creatorId)).length).toBe(1);

    expect((await (await client(A.login)).rpc("delete_gift_reply", { p_box_id: box.boxId })).error).toBeNull();
    expect(replyRow(box.boxId)).toBe("-|-|true|true");
    expect(await wallOf(A.creatorId)).toEqual([]);
    const fanRows = await readMyGiftReplies(await client(FAN_X.login), box.orderNo);
    expect(fanRows.map((r) => [r.received, r.reply])).toEqual([[true, null]]);
    expect(await readMyReplyCard(await client(FAN_X.login), box.boxId)).toBeNull();

    // 다시 쓰기 — 답장도 확인만도 알림을 더 만들지 않는다
    expect((await confirm(A.login, box.boxId, "thanks", "다시")).error?.code).toBe("P0102");
    expect((await confirm(A.login, box.boxId)).data).toBe("unchanged");
    expect(replyRow(box.boxId)).toBe("-|-|true|true");
    expect(mailKinds(box.parcelId)).toBe("gift_reply");
  });

  it("INV-G4 (실패경로): 남의 답장·답장 없는 상자는 지울 수 없다", async () => {
    const [box, bare] = giftBoxes(FAN_X.id, A.creatorId, 2);
    expect((await confirm(A.login, box.boxId, "thanks", null)).error).toBeNull();
    expect((await (await client(B.login)).rpc("delete_gift_reply", { p_box_id: box.boxId })).error?.code).toBe("P0002");
    expect((await (await client(FAN_X.login)).rpc("delete_gift_reply", { p_box_id: box.boxId })).error?.code).toBe("42501");
    expect(replyRow(box.boxId)).toBe("thanks|-|true|false");
    expect((await confirm(A.login, bare.boxId)).error).toBeNull();
    expect((await (await client(A.login)).rpc("delete_gift_reply", { p_box_id: bare.boxId })).error?.code).toBe("P0103");
  });
});

describe("INV-G5: 알림은 둘, 한 상자에 둘 다 가지 않는다", () => {
  it("INV-G5 S5: 답장과 함께 받았어요 → 「답장이 왔어요」 하나, 받는 사람은 보낸 팬, 알림 줄에 크리에이터·답장 칸이 없다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(A.login, box.boxId, "cheered", "덕분에 힘났어요")).error).toBeNull();
    expect(mailKinds(box.parcelId)).toBe("gift_reply");
    expect(psql(`select string_agg(distinct account_id::text, ',') from public.notification_outbox where parcel_id = '${box.parcelId}'`)).toBe(FAN_X.id);
    expect(psql(`select order_id from public.notification_outbox where parcel_id = '${box.parcelId}' and channel = 'email'`)).toBe(box.orderId);
    // 알림 줄 표에는 본문·이름 칸이 없다 — 일꾼이 꺼낼 때 받는 것은 종류·주문번호·받는 사람 닉네임뿐(notifications INV-N1)
    const cols = psql("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'notification_outbox'");
    expect(cols).not.toMatch(/name|body|text|phrase|line|creator/);
  });

  it("INV-G5: 확인만 → 「도착했다고 확인됐어요」 하나", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(A.login, box.boxId)).error).toBeNull();
    expect(mailKinds(box.parcelId)).toBe("gift_received");
  });
});

describe("INV-G6: 팬 화면 — 받았어요 기록이나 배송 수령, 날짜만", () => {
  it("INV-G6 S6: 받았어요만 있음(배송 수령 없음) → 팬 화면에 「받았어요」와 날짜(YYYY-MM-DD), 시각 없음", async () => {
    const [box, other] = giftBoxes(FAN_X.id, A.creatorId, 2);
    expect((await confirm(A.login, box.boxId)).error).toBeNull();
    const today = psql("select to_char(public.receiving_today(), 'YYYY-MM-DD')");
    const raw = await (await client(FAN_X.login)).rpc("my_gift_replies", { p_order_no: box.orderNo });
    expect(raw.error).toBeNull();
    const rows = raw.data as Record<string, unknown>[];
    const mine = rows.find((r) => r.box_id === box.boxId);
    expect(mine?.received).toBe(true);
    expect(mine?.received_on).toBe(today);
    expect(rows.find((r) => r.box_id === other.boxId)?.received).toBe(false);
    // 어느 칸에도 시각(HH:MM)이 없다
    expect(JSON.stringify(rows)).not.toMatch(/T\d{2}:\d{2}|\d{2}:\d{2}:\d{2}/);
  });

  it("INV-G6: 배송 수령만 있어도 「받았어요」(날짜 없음) — 다른 팬·크리에이터에게는 빈 목록", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    psql(`begin; set local session_replication_role = replica; update public.orders set delivery = 'delivered' where id = '${box.orderId}'; commit;`);
    const rows = await readMyGiftReplies(await client(FAN_X.login), box.orderNo);
    expect(rows.map((r) => [r.received, r.receivedOn])).toEqual([[true, null]]);
    expect(await readMyGiftReplies(await client(FAN_Y.login), box.orderNo)).toEqual([]);
    expect(await readMyGiftReplies(await client(A.login), box.orderNo)).toEqual([]);
  });
});

describe("INV-G7: 답장 모음 — 양쪽 동의 + 받았어요 3일 뒤", () => {
  it("INV-G7 S7: 팬 공개 켬·크리에이터 모음 끔 → 안 보임. 켜면 받았어요 2일째는 안 보이고 3일째(0시)부터 보인다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(A.login, box.boxId, "love_it", "방송에 달고 나올게요")).error).toBeNull();
    expect((await consent(FAN_X.login, box.boxId, true, false)).error).toBeNull();
    receivedDaysAgo(box.boxId, 5, "12:00");
    expect(await wallOf(A.creatorId)).toEqual([]); // 크리에이터 모음 끔

    expect((await settings(A.login, true)).error).toBeNull();
    receivedDaysAgo(box.boxId, 2, "00:00"); // 2일 전 0시 — 아직 안 보임
    expect(await wallOf(A.creatorId)).toEqual([]);
    receivedDaysAgo(box.boxId, 3, "23:59"); // 3일 전 밤 — 오늘이 3일째라 보인다
    const wall = await wallOf(A.creatorId);
    expect(wall.map((w) => [w.phrase, w.line, w.fan_nickname])).toEqual([["love_it", "방송에 달고 나올게요", null]]);
    // 보이는 칸은 정해진 넷뿐
    expect(Object.keys(wall[0]).sort()).toEqual(["fan_nickname", "line", "phrase", "replied_on"]);

    // 하나라도 꺼지면 바로 내려간다
    expect((await consent(FAN_X.login, box.boxId, false, false)).error).toBeNull();
    expect(await wallOf(A.creatorId)).toEqual([]);
    expect((await consent(FAN_X.login, box.boxId, true, false)).error).toBeNull();
    expect((await wallOf(A.creatorId)).length).toBe(1);
    expect((await settings(A.login, false)).error).toBeNull();
    expect(await wallOf(A.creatorId)).toEqual([]);
  });

  it("INV-G7 S7b: 공개된 답장, 팬이 닉네임 안 보이기면 이름 칸이 비고(「익명의 팬」), 보이기면 닉네임 — 최신순·확인만은 없다", async () => {
    const [b1, b2, b3] = giftBoxes(FAN_X.id, A.creatorId, 3);
    const [y1] = giftBoxes(FAN_Y.id, A.creatorId, 1);
    expect((await settings(A.login, true)).error).toBeNull();
    expect((await confirm(A.login, b1.boxId, "thanks", "첫째")).error).toBeNull();
    expect((await confirm(A.login, b2.boxId)).error).toBeNull(); // 확인만 — 모음에 없다
    expect((await confirm(A.login, y1.boxId, "touched", "둘째")).error).toBeNull();
    expect((await confirm(A.login, b3.boxId, "will_use", null)).error).toBeNull(); // 팬이 공개 안 함
    psql(`begin; set local session_replication_role = replica; update public.gift_replies set replied_at = now() - interval '1 hour' where box_id = '${b1.boxId}'; commit;`);
    for (const b of [b1, b2, b3, y1]) receivedDaysAgo(b.boxId, 4, "09:00");
    expect((await consent(FAN_X.login, b1.boxId, true, false)).error).toBeNull();
    expect((await consent(FAN_Y.login, y1.boxId, true, true)).error).toBeNull();
    const wall = await readReplyWall(anonClient(), A.creatorId);
    expect(wall.map((w) => [w.phrase, w.line, w.fanNickname])).toEqual([
      ["touched", "둘째", "달토끼"],
      ["thanks", "첫째", null],
    ]);
    // 다른 크리에이터의 모음에는 없다 · 본인 확인 전 크리에이터는 빈 목록
    expect(await wallOf(B.creatorId)).toEqual([]);
    psql(`begin; set local session_replication_role = replica; update public.creators set identity_verified = false where id = '${A.creatorId}'; commit;`);
    expect(await wallOf(A.creatorId)).toEqual([]);
  });
});

describe("INV-G8: 공개 동의는 보낸 팬만, 모음·X 설정은 크리에이터만", () => {
  it("INV-G8 S8 (실패경로): 다른 팬·받은 크리에이터·로그인 안 함은 남의 답장 공개 동의를 바꿀 수 없다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(A.login, box.boxId, "thanks", null)).error).toBeNull();
    expect((await consent(FAN_Y.login, box.boxId, true, true)).error?.code).toBe("P0002");
    expect((await consent(A.login, box.boxId, true, true)).error?.code).toBe("P0002");
    expect((await anonClient().rpc("set_gift_reply_consent", { p_box_id: box.boxId, p_public: true, p_show_nickname: true })).error).not.toBeNull();
    expect(psql(`select fan_public::text || fan_show_nickname::text from public.gift_replies where box_id = '${box.boxId}'`)).toBe("falsefalse");
    expect((await consent(FAN_X.login, box.boxId, true, true)).error).toBeNull();
    expect(psql(`select fan_public::text || fan_show_nickname::text from public.gift_replies where box_id = '${box.boxId}'`)).toBe("truetrue");
  });

  it("INV-G8 (실패경로): 팬·로그인 안 함은 모음·X 설정을 바꿀 수 없고, X 계정은 영문·숫자·밑줄 1~15자", async () => {
    expect((await settings(FAN_X.login, true, "fan_x", true)).error?.code).toBe("42501");
    expect((await anonClient().rpc("update_my_reply_settings", { p_wall_visible: true, p_x_handle: null, p_x_tag_allowed: false })).error).not.toBeNull();
    for (const bad of ["a".repeat(16), "하루", "ha-ru", "@haru", "ha ru"]) {
      expect((await settings(A.login, true, bad, true)).error?.code, bad).toBe("22023");
    }
    expect(psql(`select reply_wall_visible::text || coalesce(x_handle, '-') from public.creators where id = '${A.creatorId}'`)).toBe("false-");
    expect((await settings(A.login, true, "Haru_TV_15chars", true)).error).toBeNull();
    expect(psql(`select reply_wall_visible::text || '|' || x_handle || '|' || x_tag_allowed::text from public.creators where id = '${A.creatorId}'`)).toBe("true|Haru_TV_15chars|true");
    // B 의 설정은 그대로
    expect(psql(`select reply_wall_visible::text || coalesce(x_handle, '-') from public.creators where id = '${B.creatorId}'`)).toBe("false-");
    // 계정을 비우면 태그 허용도 꺼진다
    expect((await settings(A.login, true, "", true)).error).toBeNull();
    expect(psql(`select coalesce(x_handle, '-') || '|' || x_tag_allowed::text from public.creators where id = '${A.creatorId}'`)).toBe("-|false");
  });
});

describe("INV-G9: 공유 카드는 보낸 팬만, 정해진 칸만", () => {
  it("INV-G9 S9 (실패경로): 다른 팬·받은 크리에이터·로그인 안 함은 남의 답장 카드 재료를 받지 못한다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(A.login, box.boxId, "touched", "카드 시험")).error).toBeNull();
    expect(await readMyReplyCard(await client(FAN_Y.login), box.boxId)).toBeNull();
    expect(await readMyReplyCard(await client(A.login), box.boxId)).toBeNull();
    expect((await anonClient().rpc("my_gift_reply_card", { p_box_id: box.boxId })).error).not.toBeNull();
    const card = await readMyReplyCard(await client(FAN_X.login), box.boxId);
    expect(card).toMatchObject({ creatorName: A.name, phrase: "touched", line: "카드 시험", fanNickname: FAN_X.nickname, xTag: null });
    // 카드 재료에 주문번호·운송장·물품·상자 칸이 없다
    const raw = await (await client(FAN_X.login)).rpc("my_gift_reply_card", { p_box_id: box.boxId });
    expect(Object.keys((raw.data as Record<string, unknown>[])[0]).sort()).toEqual(
      ["creator_name", "creator_photo_path", "fan_nickname", "line", "phrase", "replied_on", "x_tag"].sort(),
    );
  });

  it("INV-G9 S9b: X 계정 등록·태그 허용 끔 → 태그 없음, 켜면 계정이 온다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(A.login, box.boxId, "thanks", null)).error).toBeNull();
    expect((await settings(A.login, false, "haru_tv", false)).error).toBeNull();
    expect((await readMyReplyCard(await client(FAN_X.login), box.boxId))?.xTag).toBeNull();
    expect((await readMyGiftReplies(await client(FAN_X.login), box.orderNo))[0].xTag).toBeNull();
    expect((await settings(A.login, false, "haru_tv", true)).error).toBeNull();
    expect((await readMyReplyCard(await client(FAN_X.login), box.boxId))?.xTag).toBe("haru_tv");
    expect((await readMyGiftReplies(await client(FAN_X.login), box.orderNo))[0].xTag).toBe("haru_tv");
  });

  it("INV-G9: 탈퇴한 크리에이터의 답장은 팬의 기록으로 남고 이름·사진 칸이 비어 온다(「탈퇴한 크리에이터」)", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(A.login, box.boxId, "thanks", null)).error).toBeNull();
    psql(`begin; set local session_replication_role = replica; update public.creators set profile_id = null where id = '${A.creatorId}'; commit;`);
    try {
      const card = await readMyReplyCard(await client(FAN_X.login), box.boxId);
      expect(card).toMatchObject({ creatorName: null, creatorPhotoPath: null, phrase: "thanks" });
      expect((await readMyGiftReplies(await client(FAN_X.login), box.orderNo))[0].creatorName).toBeNull();
    } finally {
      psql(`begin; set local session_replication_role = replica; update public.creators set profile_id = '${A.id}' where id = '${A.creatorId}'; commit;`);
    }
  });
});

describe("INV-G10: 아직 답장 안 한 선물 N개 — 본인 화면에만", () => {
  it("INV-G10 S10: 출고 상자 3개 중 답장 1·확인만 1·아무것도 없음 1 → 2. 지운 상자·출고 전 상자는 세지 않고, 다른 사람 응답에는 없다", async () => {
    const [replied, confirmed, none] = giftBoxes(FAN_X.id, A.creatorId, 3);
    giftBoxes(FAN_Y.id, A.creatorId, 1, "inspected");
    expect((await confirm(A.login, replied.boxId, "thanks", null)).error).toBeNull();
    expect((await confirm(A.login, confirmed.boxId)).error).toBeNull();
    expect(await readMyReplyPending(await client(A.login))).toBe(2);
    expect((await (await client(A.login)).rpc("delete_gift_reply", { p_box_id: replied.boxId })).error).toBeNull();
    expect(await readMyReplyPending(await client(A.login))).toBe(2);
    expect(await readMyReplyPending(await client(B.login))).toBe(0);
    expect(await readMyReplyPending(await client(FAN_X.login))).toBe(0);
    expect((await anonClient().rpc("my_gift_reply_pending")).error).not.toBeNull();
    // 본인 목록: 출고 상자 셋만, 상태가 맞다
    const list = await readMyReceivedBoxes(await client(A.login));
    const stateOf = (id: string) => list.find((b) => b.boxId === id)?.replyState;
    expect([stateOf(replied.boxId), stateOf(confirmed.boxId), stateOf(none.boxId)]).toEqual(["deleted", "confirmed", "none"]);
    expect(list.length).toBe(3);
    expect(await readMyReceivedBoxes(await client(B.login))).toEqual([]);
  });
});
