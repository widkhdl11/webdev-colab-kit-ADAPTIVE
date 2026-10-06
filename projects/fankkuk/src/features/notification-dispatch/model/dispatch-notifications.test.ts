import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelError, type ChannelMessage, type NotificationChannel, type NotificationChannels } from "@/features/notification-dispatch/api/channels";
import { dispatchNotifications, TIME_BUDGET_MS, type DispatchDeps } from "./dispatch-notifications";

// 보내는 일꾼 (notifications INV-N5·N6·N7·N10). DB 함수(꺼내기·끝내기·멈춘 줄 정리)가 줄의 상태를 지키고,
// 일꾼은 꺼낸 줄마다 연락처를 읽고 → 본문을 만들고 → 통로로 보내고 → 결과를 끝내기로 남긴다.

type Row = {
  id: string;
  kind: string;
  channel: "email" | "kakao";
  round: number;
  order_no: string;
  nickname: string;
  auto_reject_at: string | null;
  must_deliver: boolean;
  attempts: number;
  claimed_at: string;
};

const CLAIMED = "2026-10-06T06:00:00.123456+00:00";

const ROW: Row = { id: "row-1", kind: "arrived", channel: "email", round: 1, order_no: "FC-7K3M9", nickname: "별빛", auto_reject_at: null, must_deliver: false, attempts: 0, claimed_at: "2026-10-06T06:00:00.123456+00:00" };

type Call = { fn: string; args: unknown };

function fakeAdmin(opts: {
  rows?: Row[];
  contacts?: Record<string, string | null>;
  templates?: { kind: string; template_code: string }[];
  stale?: { id: string; channel: string; provider_message_id: string | null }[];
  fail?: Partial<Record<string, { code: string }>>;
}) {
  const calls: Call[] = [];
  let claimed = false;
  const admin = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      const failure = opts.fail?.[fn];
      if (failure) return { data: null, error: failure };
      switch (fn) {
        case "notification_enqueue_due":
        case "notification_requeue_stale":
          return { data: 0, error: null };
        case "notification_stale_lookups":
          return { data: opts.stale ?? [], error: null };
        case "notification_claim": {
          const data = claimed ? [] : (opts.rows ?? []);
          claimed = true;
          return { data, error: null };
        }
        case "notification_contact":
          return { data: opts.contacts?.[(args as { p_outbox_id: string }).p_outbox_id] ?? null, error: null };
        case "notification_finish":
          return { data: (args as { p_outcome: string }).p_outcome === "error" ? "pending" : (args as { p_outcome: string }).p_outcome, error: null };
        case "notification_resolve_stale":
          return { data: (args as { p_delivered: boolean }).p_delivered ? "sent" : "pending", error: null };
      }
      throw new Error(`모르는 함수 ${fn}`);
    },
    from: (table: string) => {
      calls.push({ fn: `from:${table}`, args: null });
      return { select: async () => ({ data: opts.templates ?? [], error: null }) };
    },
  };
  return { admin: admin as unknown as DispatchDeps["admin"], calls };
}

function channel(fake = false, fail?: string): NotificationChannel & { sent: ChannelMessage[] } {
  const sent: ChannelMessage[] = [];
  return {
    sent,
    fake,
    async send(m) {
      if (fail) throw new ChannelError(fail);
      sent.push(m);
      return { providerMessageId: fake ? null : "prov-1" };
    },
    lookup: null,
  };
}

function deps(admin: DispatchDeps["admin"], channels: NotificationChannels, seen: { hasKakaoTemplates?: boolean } = {}): DispatchDeps {
  return {
    admin,
    appOrigin: "https://fankkuk.example.com",
    chooseChannels: (hasKakaoTemplates) => {
      seen.hasKakaoTemplates = hasKakaoTemplates;
      return channels;
    },
  };
}

const finishes = (calls: Call[]) => calls.filter((c) => c.fn === "notification_finish").map((c) => c.args);

describe("보내는 일꾼 (INV-N5·N6·N7)", () => {
  it("INV-N5: 정해진 순서 — 재알림 줄 만들기 → 멈춘 줄 정리 → 꺼내기 → 줄마다 연락처·보내기·끝내기", async () => {
    const email = channel();
    const { admin, calls } = fakeAdmin({ rows: [ROW], contacts: { "row-1": "byeolbit@example.com" } });
    const result = await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(calls.map((c) => c.fn)).toEqual([
      "notification_enqueue_due",
      "notification_requeue_stale",
      "from:notification_kakao_templates",
      "notification_stale_lookups",
      "notification_claim",
      "notification_contact",
      "notification_finish",
      "notification_claim",
    ]);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.to).toBe("byeolbit@example.com");
    expect(email.sent[0]!.outboxId).toBe("row-1");
    expect(finishes(calls)).toEqual([{ p_id: "row-1", p_claimed_at: CLAIMED, p_outcome: "sent", p_provider_message_id: "prov-1", p_error_code: null, p_fake: false }]);
    expect(result).toEqual({ ok: true, counts: { sent: 1, skipped: 0, retrying: 0, failed: 0, unfinished: 0, staleResolved: 0, staleUnchecked: 0 } });
  });

  it("INV-N6 (S6·S6b): 연락처가 빈 값(칸이 꺼짐·확인된 이메일 없음)이면 보내지 않고 건너뜀으로 끝낸다", async () => {
    const email = channel();
    const { admin, calls } = fakeAdmin({ rows: [ROW], contacts: { "row-1": null } });
    const result = await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent).toHaveLength(0);
    expect(finishes(calls)).toEqual([{ p_id: "row-1", p_claimed_at: CLAIMED, p_outcome: "skipped", p_provider_message_id: null, p_error_code: "no_contact", p_fake: false }]);
    expect(result.ok && result.counts.skipped).toBe(1);
  });

  it("INV-N7 (S7): 카카오 줄은 그 종류의 템플릿 코드로 카카오 통로에, 이메일 줄은 이메일 통로에", async () => {
    const email = channel();
    const kakao = channel(true);
    const seen: { hasKakaoTemplates?: boolean } = {};
    const { admin, calls } = fakeAdmin({
      rows: [{ ...ROW, id: "k", channel: "kakao" }, { ...ROW, id: "e" }],
      contacts: { k: "01012345678", e: "byeolbit@example.com" },
      templates: [{ kind: "arrived", template_code: "TPL_ARRIVED_1" }],
    });
    await dispatchNotifications(deps(admin, { email, kakao }, seen));
    expect(seen.hasKakaoTemplates).toBe(true);
    expect(kakao.sent.map((m) => [m.outboxId, m.templateCode])).toEqual([["k", "TPL_ARRIVED_1"]]);
    expect(email.sent.map((m) => [m.outboxId, m.templateCode])).toEqual([["e", null]]);
    // 가짜 통로로 보낸 줄은 가짜로 남는다(INV-N11)
    expect(finishes(calls)).toContainEqual({ p_id: "k", p_claimed_at: CLAIMED, p_outcome: "sent", p_provider_message_id: null, p_error_code: null, p_fake: true });
  });

  it("INV-N7 (S7b, 실패경로): 카카오가 오류를 내도 이메일로 갈아타지 않는다 — 같은 줄을 오류로 끝내 DB 가 다시 보낼 차례를 정한다", async () => {
    const email = channel();
    const kakao = channel(true, "provider_error");
    const { admin, calls } = fakeAdmin({
      rows: [{ ...ROW, id: "k", channel: "kakao" }],
      contacts: { k: "01012345678" },
      templates: [{ kind: "arrived", template_code: "TPL_ARRIVED_1" }],
    });
    const result = await dispatchNotifications(deps(admin, { email, kakao }));
    expect(email.sent).toHaveLength(0);
    expect(finishes(calls)).toEqual([{ p_id: "k", p_claimed_at: CLAIMED, p_outcome: "error", p_provider_message_id: null, p_error_code: "provider_error", p_fake: false }]);
    expect(result.ok && result.counts.retrying).toBe(1);
  });

  it("INV-N7 (실패경로): 카카오 줄인데 카카오 통로가 없으면(운영·대행사 전) 보내지 않고 오류 코드", async () => {
    const email = channel();
    const { admin, calls } = fakeAdmin({ rows: [{ ...ROW, channel: "kakao" }], contacts: { "row-1": "01012345678" } });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent).toHaveLength(0);
    expect(finishes(calls)).toEqual([{ p_id: "row-1", p_claimed_at: CLAIMED, p_outcome: "error", p_provider_message_id: null, p_error_code: "channel_unavailable", p_fake: false }]);
  });

  it("INV-N7 (실패경로): 꺼낸 뒤 그 종류의 템플릿 코드가 지워졌으면 카카오로 보내지 않는다", async () => {
    const kakao = channel(true);
    const { admin, calls } = fakeAdmin({ rows: [{ ...ROW, channel: "kakao" }], contacts: { "row-1": "01012345678" }, templates: [] });
    await dispatchNotifications(deps(admin, { email: channel(), kakao }));
    expect(kakao.sent).toHaveLength(0);
    expect(finishes(calls)).toEqual([{ p_id: "row-1", p_claimed_at: CLAIMED, p_outcome: "error", p_provider_message_id: null, p_error_code: "template_missing", p_fake: false }]);
  });

  it("INV-N1: 본문을 만들 수 없는 줄(배송중·수령 — 경로 미정, 꼴이 틀린 주문번호)은 보내지 않고 건너뜀 — 다시 해도 결과가 같다", async () => {
    const email = channel();
    const { admin, calls } = fakeAdmin({
      rows: [{ ...ROW, id: "t", kind: "in_transit" }, { ...ROW, id: "bad", order_no: "../admin" }],
      contacts: { t: "a@example.com", bad: "a@example.com" },
    });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent).toHaveLength(0);
    expect(finishes(calls).map((a) => { const f = a as { p_outcome: string; p_error_code: string }; return `${f.p_outcome}:${f.p_error_code}`; })).toEqual(["skipped:kind_not_ready", "skipped:body_unavailable"]);
    // 경로 없는 종류는 연락처도 읽지 않는다
    expect(calls.filter((c) => c.fn === "notification_contact").map((c) => c.args)).toEqual([{ p_outbox_id: "bad" }]);
  });

  it("INV-N1·N8: 승인 요청 줄은 자동 반려 예정 시각을 본문에 넣고, 꺼낸 값 말고는 본문에 쓰지 않는다", async () => {
    const email = channel();
    const { admin } = fakeAdmin({
      rows: [{ ...ROW, kind: "approval_request", round: 3, nickname: "하루", auto_reject_at: "2026-10-08T01:00:00Z", must_deliver: true }],
      contacts: { "row-1": "haru@example.com" },
    });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent[0]!.text).toContain("10월 8일 오전 10시까지");
    expect(email.sent[0]!.text).toContain("하루님");
    expect(email.sent[0]!.text).not.toContain("haru@example.com"); // 받는 주소는 본문에 없다
  });

  it("INV-N5: 메일 서버 오류는 코드로 끝내고, DB 가 실패로 끝냈으면 실패로 센다", async () => {
    const { admin, calls } = fakeAdmin({ rows: [ROW], contacts: { "row-1": "a@example.com" } });
    const finish = admin.rpc.bind(admin);
    (admin as { rpc: unknown }).rpc = async (fn: string, args: unknown) =>
      fn === "notification_finish" ? (calls.push({ fn, args }), { data: "failed", error: null }) : finish(fn as never, args as never);
    const result = await dispatchNotifications(deps(admin, { email: channel(false, "smtp_error"), kakao: null }));
    expect(finishes(calls)).toEqual([{ p_id: "row-1", p_claimed_at: CLAIMED, p_outcome: "error", p_provider_message_id: null, p_error_code: "smtp_error", p_fake: false }]);
    expect(result.ok && result.counts.failed).toBe(1);
  });

  it("INV-N10: 통로가 ChannelError 가 아닌 예외를 던지면 그 문장 대신 정해진 코드로 끝낸다", async () => {
    const email: NotificationChannel = {
      fake: false,
      send: async () => {
        throw new Error("connect ECONNREFUSED to=byeolbit@example.com");
      },
      lookup: null,
    };
    const { admin, calls } = fakeAdmin({ rows: [ROW], contacts: { "row-1": "byeolbit@example.com" } });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(JSON.stringify(finishes(calls))).not.toContain("byeolbit@example.com");
    expect(finishes(calls)).toEqual([{ p_id: "row-1", p_claimed_at: CLAIMED, p_outcome: "error", p_provider_message_id: null, p_error_code: "send_failed", p_fake: false }]);
  });

  it("INV-N5: 끝내기가 실패한 줄은 「보내는 중」에 남는다 — 멈춘 줄 정리가 맡고, 끝나지 않은 줄로 센다", async () => {
    const { admin } = fakeAdmin({ rows: [ROW], contacts: { "row-1": "a@example.com" }, fail: { notification_finish: { code: "55000" } } });
    const result = await dispatchNotifications(deps(admin, { email: channel(), kakao: null }));
    expect(result.ok && result.counts.unfinished).toBe(1);
  });

  it("INV-N5 (S5e): 발송 조회가 되는 통로의 멈춘 줄 — 조회해서 갔으면 보냄, 안 갔으면 다시 보낼 차례로", async () => {
    const kakao: NotificationChannel = { fake: false, send: async () => ({ providerMessageId: null }), lookup: async (id) => id === "went" };
    const { admin, calls } = fakeAdmin({
      stale: [
        { id: "went", channel: "kakao", provider_message_id: null },
        { id: "lost", channel: "kakao", provider_message_id: null },
      ],
    });
    const result = await dispatchNotifications(deps(admin, { email: channel(), kakao }));
    expect(calls.filter((c) => c.fn === "notification_resolve_stale").map((c) => c.args)).toEqual([
      { p_id: "went", p_delivered: true },
      { p_id: "lost", p_delivered: false },
    ]);
    expect(result.ok && result.counts.staleResolved).toBe(2);
  });

  it("INV-N5 (실패경로): 조회 자체가 실패한 멈춘 줄은 건드리지 않는다 — 모르는 채로 다시 보내지 않는다", async () => {
    const kakao: NotificationChannel = {
      fake: false,
      send: async () => ({ providerMessageId: null }),
      lookup: async () => {
        throw new Error("down");
      },
    };
    const { admin, calls } = fakeAdmin({ stale: [{ id: "x", channel: "kakao", provider_message_id: null }] });
    await dispatchNotifications(deps(admin, { email: channel(), kakao }));
    expect(calls.some((c) => c.fn === "notification_resolve_stale")).toBe(false);
  });

  it("INV-N11 (S11): 통로를 고르다 설정 오류가 나면 아무 줄도 꺼내지 않는다", async () => {
    const { admin, calls } = fakeAdmin({ rows: [ROW], templates: [{ kind: "arrived", template_code: "TPL" }] });
    const result = await dispatchNotifications({
      admin,
      appOrigin: "https://fankkuk.example.com",
      chooseChannels: () => {
        throw new Error("카카오 템플릿 코드가 설정돼 있는데 알림톡 대행사 설정(KAKAO_ALIMTALK_*)이 없다");
      },
    });
    expect(result).toMatchObject({ ok: false, reason: "config" });
    expect(calls.some((c) => c.fn === "notification_claim")).toBe(false);
  });

  it("INV-N5: DB 함수가 실패하면 거기서 멈추고 실패를 돌려준다", async () => {
    const { admin, calls } = fakeAdmin({ rows: [ROW], fail: { notification_claim: { code: "42501" } } });
    const email = channel();
    expect(await dispatchNotifications(deps(admin, { email, kakao: null }))).toMatchObject({ ok: false, reason: "db" });
    expect(email.sent).toHaveLength(0);
    expect(calls.some((c) => c.fn === "notification_contact")).toBe(false);
  });

  it("INV-N6·N5 (실패경로): 연락처 함수가 실패하면 건너뛰지 않고 오류로 끝낸다 — 빈 값(보낼 곳 없음)과 구분해 다시 보낼 차례로", async () => {
    const email = channel();
    const { admin, calls } = fakeAdmin({ rows: [{ ...ROW, kind: "approval_request", auto_reject_at: "2026-10-08T01:00:00Z", must_deliver: true }], fail: { notification_contact: { code: "57014" } } });
    const result = await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent).toHaveLength(0);
    expect(finishes(calls)).toEqual([{ p_id: "row-1", p_claimed_at: CLAIMED, p_outcome: "error", p_provider_message_id: null, p_error_code: "contact_failed", p_fake: false }]);
    expect(result.ok && result.counts.retrying).toBe(1);
  });

  it("INV-N9·N11: 사이트 주소 설정이 틀렸으면 줄을 꺼내기 전에 설정 오류로 멈춘다", async () => {
    for (const appOrigin of ["https://fankkuk.example.com/evil", "ftp://fankkuk.example.com", "fankkuk"]) {
      const { admin, calls } = fakeAdmin({ rows: [ROW], contacts: { "row-1": "a@example.com" } });
      const result = await dispatchNotifications({ ...deps(admin, { email: channel(), kakao: null }), appOrigin });
      expect(result).toMatchObject({ ok: false, reason: "config" });
      expect(calls).toEqual([]);
    }
  });

  it("INV-N5: 30초가 지나면 새 묶음을 꺼내지 않는다 — 이번에 실패한 줄을 같은 호출에서 다시 꺼내지 않는다", async () => {
    let t = 0;
    let claims = 0;
    const rows = (n: number) => [{ ...ROW, id: `r${n}` }];
    const { admin } = fakeAdmin({});
    const base = admin.rpc.bind(admin);
    (admin as { rpc: unknown }).rpc = async (fn: string, args: unknown) => {
      if (fn === "notification_claim") {
        claims += 1;
        t += TIME_BUDGET_MS / 2; // 묶음 하나에 15초가 걸린다고 치고
        return { data: rows(claims), error: null };
      }
      if (fn === "notification_contact") return { data: "a@example.com", error: null };
      return base(fn as never, args as never);
    };
    await dispatchNotifications({ ...deps(admin, { email: channel(), kakao: null }), now: () => t });
    expect(claims).toBe(2);
  });

  it("INV-N5: 두 번째 묶음에서 DB 가 실패해도 첫 묶음에서 보낸 건수는 돌려준다", async () => {
    let claims = 0;
    const { admin } = fakeAdmin({ contacts: { "row-1": "a@example.com" } });
    const base = admin.rpc.bind(admin);
    (admin as { rpc: unknown }).rpc = async (fn: string, args: unknown) => {
      if (fn === "notification_claim") {
        claims += 1;
        return claims === 1 ? { data: [ROW], error: null } : { data: null, error: { code: "08006" } };
      }
      return base(fn as never, args as never);
    };
    const result = await dispatchNotifications(deps(admin, { email: channel(), kakao: null }));
    expect(result).toMatchObject({ ok: false, reason: "db", counts: { sent: 1 } });
  });

  it("INV-N5: 조회할 카카오 통로가 없는 멈춘 줄은 건드리지 않고 「확인 못 함」으로 센다", async () => {
    const { admin, calls } = fakeAdmin({ stale: [{ id: "x", channel: "kakao", provider_message_id: null }] });
    const result = await dispatchNotifications(deps(admin, { email: channel(), kakao: null }));
    expect(calls.some((c) => c.fn === "notification_resolve_stale")).toBe(false);
    expect(result.ok && result.counts.staleUnchecked).toBe(1);
  });
});

describe("INV-N10: 일꾼은 아무것도 찍지 않는다", () => {
  afterEach(() => vi.restoreAllMocks());

  it("INV-N10 (S10): 보냄·실패·연락처 오류를 거쳐도 console 에 한 줄도 남기지 않는다", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const email: NotificationChannel = {
      fake: false,
      send: async (m) => {
        if (m.outboxId === "boom") throw new Error("550 byeolbit@example.com 01012345678");
        return { providerMessageId: null };
      },
      lookup: null,
    };
    const { admin } = fakeAdmin({
      rows: [ROW, { ...ROW, id: "boom" }, { ...ROW, id: "nocontact" }],
      contacts: { "row-1": "byeolbit@example.com", boom: "byeolbit@example.com" },
    });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

