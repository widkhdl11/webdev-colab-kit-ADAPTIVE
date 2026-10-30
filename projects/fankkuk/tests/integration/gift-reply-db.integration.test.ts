import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readMyGiftReplies, readMyReceivedBoxes, readMyReplyCard, readMyReplyPending, readReplyWall } from "@/entities/gift-reply/api/gift-reply-reads";
import { linkClient, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { FAN_X, FAN_Y, giftBoxes, kstTodayAt, receivedDaysAgo, resetReplySettings } from "./gift-reply-helpers";
import { anonClient, deleteTestOrders, holdRowLock, psql, instantNotices } from "./helpers";

// 받았어요 · 감사 답장 · 답장 공유 카드 · 감사 답장 모음 (docs/specs/gift-reply.md INV-G1~G10, S1~S10) 중 DB 가 지키는 것.
// 알림 본문 틀(INV-G5 본문)과 공유 문구(INV-G9 S9b 의 글)는 src 단위 시험(notification-body.test.ts · entities/gift-reply/model/reply.test.ts)에도 있다.
// 크리에이터는 본인 확인 시험 계정(cvt_*) — 공개 모음이 본인 확인된 크리에이터만 보이므로 시험 동안 확인된 상태로 둔다.
// 주문·상자·사무실 상자 줄은 psql 로 바로 넣는다(물품 이름 「시험 선물」 — deleteTestOrders 가 상자·답장·알림 줄까지 같이 지운다).

const A = CV.haru; // 받는 크리에이터
const B = CV.summer; // 다른 크리에이터
const client = linkClient;
const IDS = [A, B].map((c) => `'${c.creatorId}'`).join(", ");

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

beforeAll(() => {
  createCvAccounts();
});
beforeEach(() => {
  deleteTestOrders();
  resetCv();
  resetReplySettings(IDS);
  verifyCreator(A.creatorId, "cvt-reply-a");
  verifyCreator(B.creatorId, "cvt-reply-b");
  // 답장 알림 줄을 본다 — 별빛은 「바로 받기」를 켠 팬(꺼져 있으면 하루 묶음 대기로 간다, notification-batching INV-NB5). 정리 단계가 설정을 지우므로 맨 끝에
  instantNotices(FAN_X.id);
});
afterAll(() => {
  deleteTestOrders();
  resetReplySettings(IDS);
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

  it("INV-G1 S1b (실패경로): 주문은 출고인데 상자 둘 중 하나가 검수 완료면 그 상자 받았어요는 거부된다 — 주문 상태가 아니라 상자 상태로 판단한다", async () => {
    const [sent, waiting] = giftBoxes(FAN_X.id, A.creatorId, 2);
    psql(
      `begin; set local session_replication_role = replica;
       update public.office_parcels set state = 'inspected', printed_at = null, shipped_at = null, outbound_waybill_no = null where id = '${waiting.parcelId}'; commit;`,
    );
    expect(psql(`select status::text from public.orders where id = '${sent.orderId}'`)).toBe("shipped");
    expect((await confirm(A.login, waiting.boxId)).error?.code).toBe("P0100");
    expect((await confirm(A.login, waiting.boxId, "thanks", null)).error?.code).toBe("P0100");
    expect(replyRows(waiting.boxId)).toBe(0);
    expect(mailKinds(waiting.parcelId)).toBe("");
    expect((await confirm(A.login, sent.boxId)).data).toBe("received");
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

  it("INV-G4: 지운 뒤 공개 동의 칸을 DB 에서 직접 다시 켜도 모음은 빈 목록이다 — 모음은 지우지 않은 답장만 읽는다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await settings(A.login, true)).error).toBeNull();
    expect((await confirm(A.login, box.boxId, "touched", "지울 답장")).error).toBeNull();
    expect((await consent(FAN_X.login, box.boxId, true, true)).error).toBeNull();
    receivedDaysAgo(box.boxId, 4, "10:00");
    expect((await wallOf(A.creatorId)).length).toBe(1);
    expect((await (await client(A.login)).rpc("delete_gift_reply", { p_box_id: box.boxId })).error).toBeNull();
    psql(`begin; set local session_replication_role = replica; update public.gift_replies set fan_public = true, fan_show_nickname = true where box_id = '${box.boxId}'; commit;`);
    expect(psql(`select fan_public::text || '|' || (deleted_at is not null)::text from public.gift_replies where box_id = '${box.boxId}'`)).toBe("true|true");
    expect(await wallOf(A.creatorId)).toEqual([]);
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

  it("INV-G6: 배송 수령만 있어도 「받았어요」이고 날짜는 수령 날짜(한국 시간) — 다른 팬·크리에이터에게는 빈 목록", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    const today = psql("select to_char(public.receiving_today(), 'YYYY-MM-DD')");
    psql(`begin; set local session_replication_role = replica; update public.orders set delivery = 'delivered', delivered_at = ${kstTodayAt("00:30")} where id = '${box.orderId}'; commit;`);
    const rows = await readMyGiftReplies(await client(FAN_X.login), box.orderNo);
    expect(rows.map((r) => [r.received, r.receivedOn])).toEqual([[true, today]]);
    expect(await readMyGiftReplies(await client(FAN_Y.login), box.orderNo)).toEqual([]);
    expect(await readMyGiftReplies(await client(A.login), box.orderNo)).toEqual([]);
  });

  it("INV-G6: 받았어요 기록과 배송 수령이 둘 다 있으면 받았어요 날짜 그대로 · 수령 시각이 기록되기 전에 수령된 주문은 「받았어요」만(날짜 없음)", async () => {
    const [both, legacy] = [giftBoxes(FAN_X.id, A.creatorId, 1)[0], giftBoxes(FAN_X.id, A.creatorId, 1)[0]];
    expect((await confirm(A.login, both.boxId)).error).toBeNull();
    receivedDaysAgo(both.boxId, 2, "10:00");
    const twoDaysAgo = psql("select to_char(public.receiving_today() - 2, 'YYYY-MM-DD')");
    psql(`begin; set local session_replication_role = replica; update public.orders set delivery = 'delivered', delivered_at = ${kstTodayAt("09:00")} where id = '${both.orderId}'; commit;`);
    psql(`begin; set local session_replication_role = replica; update public.orders set delivery = 'delivered', delivered_at = null where id = '${legacy.orderId}'; commit;`);
    expect((await readMyGiftReplies(await client(FAN_X.login), both.orderNo)).map((r) => [r.received, r.receivedOn])).toEqual([[true, twoDaysAgo]]);
    expect((await readMyGiftReplies(await client(FAN_X.login), legacy.orderNo)).map((r) => [r.received, r.receivedOn])).toEqual([[true, null]]);
  });

  it("INV-G6: 택배사 연결이 배송 수령으로 바꾸면 그 시각이 저절로 기록되고, 수령에서 벗어나면 지워진다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    psql(`update public.orders set delivery = 'in_transit' where id = '${box.orderId}'`);
    expect(psql(`select coalesce(delivered_at::text, '-') from public.orders where id = '${box.orderId}'`)).toBe("-");
    psql(`update public.orders set delivery = 'delivered' where id = '${box.orderId}'`);
    expect(psql(`select (delivered_at between now() - interval '1 minute' and now() + interval '1 minute')::text from public.orders where id = '${box.orderId}'`)).toBe("true");
    const today = psql("select to_char(public.receiving_today(), 'YYYY-MM-DD')");
    expect((await readMyGiftReplies(await client(FAN_X.login), box.orderNo)).map((r) => r.receivedOn)).toEqual([today]);
    psql(`update public.orders set delivery = 'in_transit' where id = '${box.orderId}'`);
    expect(psql(`select coalesce(delivered_at::text, '-') from public.orders where id = '${box.orderId}'`)).toBe("-");
  });

  it("INV-G6: 받았어요·답장 시각이 한국 시간 오늘 00:30 이면 팬 화면·공유 카드·답장 모음·크리에이터 화면의 날짜가 모두 오늘이다(UTC 로 자르면 어제)", async () => {
    const [box, walled] = giftBoxes(FAN_X.id, A.creatorId, 2);
    const today = psql("select to_char(public.receiving_today(), 'YYYY-MM-DD')");
    expect((await settings(A.login, true)).error).toBeNull();
    expect((await confirm(A.login, box.boxId, "thanks", "새벽 답장")).error).toBeNull();
    expect((await confirm(A.login, walled.boxId, "love_it", "모음 답장")).error).toBeNull();
    psql(
      `begin; set local session_replication_role = replica;
       update public.gift_replies set received_at = ${kstTodayAt("00:30")}, replied_at = ${kstTodayAt("00:30")} where box_id = '${box.boxId}';
       update public.gift_replies set replied_at = ${kstTodayAt("00:30")} where box_id = '${walled.boxId}'; commit;`,
    );
    receivedDaysAgo(walled.boxId, 3, "00:30"); // 모음은 받았어요 3일째부터 — 답장 날짜만 오늘 00:30
    expect((await consent(FAN_X.login, walled.boxId, true, false)).error).toBeNull();

    const fan = (await readMyGiftReplies(await client(FAN_X.login), box.orderNo)).find((r) => r.boxId === box.boxId);
    expect([fan?.receivedOn, fan?.reply?.repliedOn]).toEqual([today, today]);
    expect((await readMyReplyCard(await client(FAN_X.login), box.boxId))?.repliedOn).toBe(today);
    expect((await wallOf(A.creatorId)).map((w) => [w.line, w.replied_on])).toEqual([["모음 답장", today]]);
    const mine = (await readMyReceivedBoxes(await client(A.login))).find((b) => b.boxId === box.boxId);
    expect([mine?.receivedOn, mine?.reply?.repliedOn]).toEqual([today, today]);
  });

  it("INV-G6: 크리에이터를 주면 그 크리에이터에게 보낸 상자만 온다 — 주문번호만 주던 호출·아무것도 안 준 호출은 그대로", async () => {
    const [toA] = giftBoxes(FAN_X.id, A.creatorId, 1);
    const [toB] = giftBoxes(FAN_X.id, B.creatorId, 1);
    const fan = await client(FAN_X.login);
    expect((await readMyGiftReplies(fan, null, A.creatorId)).map((r) => r.boxId)).toEqual([toA.boxId]);
    expect((await readMyGiftReplies(fan, null, B.creatorId)).map((r) => r.boxId)).toEqual([toB.boxId]);
    expect((await readMyGiftReplies(fan, toA.orderNo, B.creatorId)).map((r) => r.boxId)).toEqual([]);
    expect((await readMyGiftReplies(fan, toB.orderNo)).map((r) => r.boxId)).toEqual([toB.boxId]);
    // 아무것도 안 주면 이 팬의 모든 출고 상자(시드 주문 포함) — 두 상자가 다 있다
    expect((await readMyGiftReplies(fan)).map((r) => r.boxId)).toEqual(expect.arrayContaining([toA.boxId, toB.boxId]));
    // 주문번호만 주는 예전 호출 꼴도 그대로 동작한다
    const raw = await fan.rpc("my_gift_replies", { p_order_no: toA.orderNo });
    expect(raw.error).toBeNull();
    expect((raw.data as { box_id: string }[]).map((r) => r.box_id)).toEqual([toA.boxId]);
    // 다른 팬은 같은 크리에이터로 걸러도 빈 목록
    expect(await readMyGiftReplies(await client(FAN_Y.login), null, A.creatorId)).toEqual([]);
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

  it("INV-G8: 공개를 끄면 닉네임 보이기도 꺼진다 — DB 가 정하고 저장된 두 값을 돌려준다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    expect((await confirm(A.login, box.boxId, "thanks", null)).error).toBeNull();
    const stored = () => psql(`select fan_public::text || '|' || fan_show_nickname::text from public.gift_replies where box_id = '${box.boxId}'`);
    const on = await consent(FAN_X.login, box.boxId, true, true);
    expect([on.error, on.data]).toEqual([null, [{ fan_public: true, fan_show_nickname: true }]]);
    expect(stored()).toBe("true|true");
    const off = await consent(FAN_X.login, box.boxId, false, true);
    expect([off.error, off.data]).toEqual([null, [{ fan_public: false, fan_show_nickname: false }]]);
    expect(stored()).toBe("false|false");
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
