import { afterEach, describe, expect, it } from "vitest";
import { dispatchNotifications, type DispatchDeps } from "@/features/notification-dispatch/model/dispatch-notifications";
import type { ChannelMessage, NotificationChannel } from "@/features/notification-dispatch/api/channels";
import { adminClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { approve, deleteTestUnmatched, fanSetsWaybill, paidGift, receiveAndLabel, waybill } from "./office-helpers";

// 보내는 일꾼 — 실제 DB 함수와 맞물려 (notifications INV-N3·N5·N6·N8·N10).
// 통로는 보낸 것을 모으는 가짜로 바꿔 끼운다. 연락처를 읽는 함수(manual/0011)가 적용된 로컬 DB 에서 돈다.
// 시드 주문은 건드리지 않는다 — 새 시험 주문만 쓰고, 시드 대기 요청에 생기는 재알림 줄은 정리 단계가 지운다.

const OUTBOX = "public.notification_outbox";
const TEMPLATES = "public.notification_kakao_templates";

afterEach(() => {
  deleteTestOrders();
  deleteTestUnmatched();
  psql(`delete from ${OUTBOX}`);
  psql(`delete from ${TEMPLATES}`);
});

type Capture = NotificationChannel & { sent: ChannelMessage[] };

function capture(fake: boolean, delayMs = 0): Capture {
  const sent: ChannelMessage[] = [];
  return {
    sent,
    fake,
    async send(m) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      sent.push(m);
      return { providerMessageId: null };
    },
    lookup: null,
  };
}

function depsWith(email: Capture, kakao: Capture | null = null): DispatchDeps {
  return { admin: adminClient(), appOrigin: "http://127.0.0.1:3311", chooseChannels: () => ({ email, kakao }) };
}

function statusOf(orderId: string, kind: string, channel = "email", round = 1): string {
  return psql(`select status from ${OUTBOX} where order_id = '${orderId}' and kind = '${kind}' and channel = '${channel}' and round = ${round}`);
}

function idOf(orderId: string, kind: string, channel = "email", round = 1): string {
  return psql(`select id from ${OUTBOX} where order_id = '${orderId}' and kind = '${kind}' and channel = '${channel}' and round = ${round}`);
}

describe("보내는 일꾼 — DB 와 함께 (manual/0011 뒤)", () => {
  it("INV-N3·N5: 결제 완료로 생긴 승인 요청 줄을 하루의 확인된 이메일로 한 번 보내고 보냄으로 끝낸다", async () => {
    const g = await paidGift();
    const email = capture(false);
    const result = await dispatchNotifications(depsWith(email));
    expect(result.ok).toBe(true);
    const mine = email.sent.filter((m) => m.outboxId === idOf(g.orderId, "approval_request"));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.to).toBe(psql(`select c.email from pii.account_contacts c join public.profiles p on p.id = c.account_id where p.login_id = 'haru_creator'`));
    expect(mine[0]!.text).toContain(g.orderNo);
    expect(mine[0]!.text).toContain("http://127.0.0.1:3311/creator/requests");
    expect(statusOf(g.orderId, "approval_request")).toBe("sent");
  });

  it("INV-N5 (S5, 동시): 일꾼 둘이 동시에 돌아도 줄마다 한 번만 보낸다", async () => {
    const orders = [await paidGift(), await paidGift(), await paidGift()];
    const a = capture(false, 30);
    const b = capture(false, 30);
    const [ra, rb] = await Promise.all([dispatchNotifications(depsWith(a)), dispatchNotifications(depsWith(b))]);
    expect(ra.ok && rb.ok).toBe(true);
    for (const o of orders) {
      const id = idOf(o.orderId, "approval_request");
      const times = [...a.sent, ...b.sent].filter((m) => m.outboxId === id).length;
      expect(times).toBe(1);
      expect(statusOf(o.orderId, "approval_request")).toBe("sent");
    }
    // 같은 줄을 한 번 더 돌려도 보낼 것이 없다(INV-N5 — 보냄은 끝)
    const again = capture(false);
    await dispatchNotifications(depsWith(again));
    const ids = new Set(orders.map((o) => idOf(o.orderId, "approval_request")));
    expect(again.sent.filter((m) => ids.has(m.outboxId))).toHaveLength(0);
  });

  it("INV-N8 (S8·S8b): 72시간이 지난 대기 요청에 일꾼이 3차 줄을 만들고, 꺼내기 전에 승인됐으면 건너뛴다", async () => {
    const waiting = await paidGift();
    const approved = await paidGift();
    // 승인된 주문의 3차 줄이 먼저 생긴 뒤 승인되는 순서를 만든다: 일꾼이 도는 도중에 승인할 수 없으니, 줄을 먼저 만들고 승인한다
    psql(`update public.orders set registered_at = now() - interval '73 hours' where id = '${approved.orderId}'`);
    psql(`select public.notification_enqueue_due()`);
    expect(statusOf(approved.orderId, "approval_request", "email", 3)).toBe("pending");
    await approve(approved);
    // 대기 주문의 3차 줄은 일꾼이 만들어야 한다(여기까지 없다)
    psql(`update public.orders set registered_at = now() - interval '73 hours' where id = '${waiting.orderId}'`);
    expect(statusOf(waiting.orderId, "approval_request", "email", 3)).toBe("");

    const email = capture(false);
    await dispatchNotifications(depsWith(email));
    expect(statusOf(waiting.orderId, "approval_request", "email", 3)).toBe("sent");
    expect(statusOf(approved.orderId, "approval_request", "email", 3)).toBe("skipped");
    expect(email.sent.some((m) => m.outboxId === idOf(approved.orderId, "approval_request", "email", 3))).toBe(false);
    expect(email.sent.find((m) => m.outboxId === idOf(waiting.orderId, "approval_request", "email", 3))!.subject).toContain("아직");
  });

  it("INV-N7: 템플릿 코드가 있으면 카카오 줄은 휴대폰 번호로 가짜 카카오에", async () => {
    psql(`insert into ${TEMPLATES} (kind, template_code) values ('approval_request', 'TPL_APPROVAL_1')`);
    const g = await paidGift();
    const email = capture(false);
    const kakao = capture(true);
    await dispatchNotifications(depsWith(email, kakao));
    const k = kakao.sent.find((m) => m.outboxId === idOf(g.orderId, "approval_request", "kakao"));
    expect(k?.templateCode).toBe("TPL_APPROVAL_1");
    expect(k?.to).toMatch(/^01\d{8,9}$/);
    expect(statusOf(g.orderId, "approval_request", "kakao")).toBe("sent");
    expect(psql(`select fake from ${OUTBOX} where id = '${idOf(g.orderId, "approval_request", "kakao")}'`)).toBe("t");
  });

  it("INV-N6 (S6c): 두 칸을 다 끈 크리에이터에게도 승인 요청은 간다 — 꼭 가는 알림", async () => {
    psql(`insert into ${TEMPLATES} (kind, template_code) values ('approval_request', 'TPL_APPROVAL_1')`);
    const haru = `(select id from public.profiles where login_id = 'haru_creator')`;
    const saved = psql(`select notify_kakao || '|' || notify_email from pii.account_contacts where account_id = ${haru}`);
    psql(`update pii.account_contacts set notify_kakao = false, notify_email = false where account_id = ${haru}`);
    try {
      const g = await paidGift();
      await dispatchNotifications(depsWith(capture(false), capture(true)));
      expect(statusOf(g.orderId, "approval_request", "email")).toBe("sent");
      expect(statusOf(g.orderId, "approval_request", "kakao")).toBe("sent");
    } finally {
      const [k, m] = saved.split("|");
      psql(`update pii.account_contacts set notify_kakao = ${k === "t"}, notify_email = ${m === "t"} where account_id = ${haru}`);
    }
  });

  it("INV-N6 (S6): 카카오 칸을 끈 팬의 입고 카카오 줄은 건너뛰고 이메일 줄은 보낸다", async () => {
    psql(`insert into ${TEMPLATES} (kind, template_code) values ('arrived', 'TPL_ARRIVED_1')`);
    const fan = `(select id from public.profiles where login_id = 'byeolbit_fan')`;
    const saved = psql(`select notify_kakao from pii.account_contacts where account_id = ${fan}`);
    psql(`update pii.account_contacts set notify_kakao = false where account_id = ${fan}`);
    try {
      const g = await paidGift();
      const staff = await signedInClient("fankkuk_staff");
      const no = waybill();
      await fanSetsWaybill(g.boxIds[0]!, no);
      await receiveAndLabel(staff, no);
      const kakao = capture(true);
      await dispatchNotifications(depsWith(capture(false), kakao));
      const k = idOf(g.orderId, "arrived", "kakao");
      expect(statusOf(g.orderId, "arrived", "kakao")).toBe("skipped");
      expect(psql(`select error_code from ${OUTBOX} where id = '${k}'`)).toBe("no_contact");
      expect(kakao.sent.some((m) => m.outboxId === k)).toBe(false);
      expect(statusOf(g.orderId, "arrived", "email")).toBe("sent");
    } finally {
      psql(`update pii.account_contacts set notify_kakao = ${saved === "t"} where account_id = ${fan}`);
    }
  });

  it("INV-N10 (S10): 일꾼이 끝낸 줄에는 휴대폰·이메일 꼴의 값과 본문 문장이 없다", async () => {
    psql(`insert into ${TEMPLATES} (kind, template_code) values ('approval_request', 'TPL_APPROVAL_1')`);
    const g = await paidGift();
    const failing: Capture = { ...capture(false), send: async () => Promise.reject(new Error("550 haru@example.com 01012345678")) };
    await dispatchNotifications(depsWith(capture(false), failing));
    const dump = psql(`select row_to_json(o)::text from ${OUTBOX} o where order_id = '${g.orderId}'`);
    expect(dump).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    // 앞뒤가 16진수 글자면 ID(UUID)의 일부다 — 무작위 ID 안의 「01…」을 번호로 잡지 않는다(2026-10-08 ef0160445216 으로 한 번 실패)
    expect(dump).not.toMatch(/(?<![0-9a-f])01\d{8,9}(?![0-9a-f])/i);
    expect(dump).not.toContain("승인");
    expect(psql(`select error_code from ${OUTBOX} where id = '${idOf(g.orderId, "approval_request", "kakao")}'`)).toBe("send_failed");
  });
});
