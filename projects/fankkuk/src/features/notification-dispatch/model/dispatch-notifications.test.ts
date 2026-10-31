import { createHash } from "node:crypto";
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
  order_no: string | null;
  nickname: string;
  /** 승인 요청·재알림만 — 보내는 순간의 승인 대기 건수(notification-batching INV-NB1) */
  waiting_count?: number | null;
  /** 재알림만 — 가장 이른 자동 반려까지 남은 일수(INV-NB2) */
  days_left?: number | null;
  /** 하루 묶음만 — 소식 건수(INV-NB5) */
  item_count?: number | null;
  recipient_is_creator?: boolean;
  undelivered_reason?: string | null;
  sender_name?: string | null;
  /** DB 가 더 내주는 칸이 와도 본문에 섞이지 않는지 보는 데만 쓴다 */
  approval_sender?: string | null;
  approval_gift_kind?: string | null;
  approval_box_count?: number | null;
  must_deliver: boolean;
  attempts: number;
  claimed_at: string;
};

const CLAIMED = "2026-10-06T06:00:00.123456+00:00";

const ROW: Row = { id: "row-1", kind: "arrived", channel: "email", round: 1, order_no: "FC-7K3M9", nickname: "별빛", must_deliver: false, attempts: 0, claimed_at: "2026-10-06T06:00:00.123456+00:00" };

type Call = { fn: string; args: unknown };

function fakeAdmin(opts: {
  rows?: Row[];
  contacts?: Record<string, string | null>;
  templates?: { kind: string; template_code: string; login_link_template_code?: string | null }[];
  /** 로그인 링크 토큰 발급 함수의 답(link-login INV-K1). 기본은 발급됨(true) */
  issue?: { data: unknown; error: { code: string } | null };
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
        case "login_link_issue":
          return opts.issue ?? { data: true, error: null };
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
      rows: [{ ...ROW, id: "k", kind: "shipped", channel: "kakao" }, { ...ROW, id: "e" }],
      contacts: { k: "01012345678", e: "byeolbit@example.com" },
      templates: [{ kind: "shipped", template_code: "TPL_SHIPPED_1" }],
    });
    await dispatchNotifications(deps(admin, { email, kakao }, seen));
    expect(seen.hasKakaoTemplates).toBe(true);
    expect(kakao.sent.map((m) => [m.outboxId, m.templateCode])).toEqual([["k", "TPL_SHIPPED_1"]]);
    // 알림톡은 템플릿 문서의 변수 이름으로 값만 넘긴다(INV-N7)
    expect(kakao.sent[0]!.variables).toEqual({ "#{닉네임}": "별빛", "#{주문번호}": "FC-7K3M9" });
    expect(email.sent[0]!.variables).toBeNull();
    expect(email.sent.map((m) => [m.outboxId, m.templateCode])).toEqual([["e", null]]);
    // 가짜 통로로 보낸 줄은 가짜로 남는다(INV-N11)
    expect(finishes(calls)).toContainEqual({ p_id: "k", p_claimed_at: CLAIMED, p_outcome: "sent", p_provider_message_id: null, p_error_code: null, p_fake: true });
  });

  it("INV-N7 (S7b, 실패경로): 카카오가 오류를 내도 이메일로 갈아타지 않는다 — 같은 줄을 오류로 끝내 DB 가 다시 보낼 차례를 정한다", async () => {
    const email = channel();
    const kakao = channel(true, "provider_error");
    const { admin, calls } = fakeAdmin({
      rows: [{ ...ROW, id: "k", kind: "shipped", channel: "kakao" }],
      contacts: { k: "01012345678" },
      templates: [{ kind: "shipped", template_code: "TPL_SHIPPED_1" }],
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

  const APPROVAL_ROW: Row = {
    ...ROW,
    kind: "approval_request",
    round: 2,
    nickname: "하루",
    waiting_count: 3,
    approval_sender: "달토끼",
    approval_gift_kind: "꽃",
    approval_box_count: 2,
    must_deliver: true,
  };

  it("INV-NB1 · INV-NB3 (S3): 승인 요청 줄은 꺼낸 승인 대기 건수로 본문을 만들고, 줄에 보낸 팬·종류·개수 칸이 와도 본문에 넣지 않는다", async () => {
    const email = channel();
    const { admin } = fakeAdmin({ rows: [APPROVAL_ROW], contacts: { "row-1": "haru@example.com" } });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent[0]!.text).toContain("승인 대기 3건");
    expect(email.sent[0]!.text).toContain("하루님");
    expect(email.sent[0]!.text).toContain("/creator/actions");
    expect(email.sent[0]!.text).not.toMatch(/달토끼|꽃|2개|FC-7K3M9/);
    expect(email.sent[0]!.text).not.toContain("haru@example.com"); // 받는 주소는 본문에 없다
  });

  it("INV-NB1 · INV-N7: 승인 요청은 템플릿 ID 가 있으면 알림톡으로 — 변수는 건수 하나", async () => {
    const kakao = channel(true);
    const { admin } = fakeAdmin({
      rows: [{ ...APPROVAL_ROW, channel: "kakao" }],
      contacts: { "row-1": "01012345678" },
      templates: [{ kind: "approval_request", template_code: "TPL_APPROVAL" }],
    });
    await dispatchNotifications(deps(admin, { email: channel(), kakao }));
    expect(kakao.sent.map((m) => [m.templateCode, m.variables])).toEqual([["TPL_APPROVAL", { "#{건수}": "3" }]]);
  });

  describe("link-login INV-K1: 카카오 승인 요청은 로그인 링크 템플릿이 있을 때만 토큰을 발급해 그 템플릿으로", () => {
    const LINK_TEMPLATES = [{ kind: "approval_request", template_code: "TPL_APPROVAL", login_link_template_code: "TPL_APPROVAL_LINK" }];
    const issues = (calls: Call[]) => calls.filter((c) => c.fn === "login_link_issue").map((c) => c.args as { p_outbox_id: string; p_token_hash: string });

    it("INV-K1 (S1): 그 줄 id 와 토큰 해시로 발급하고, 링크 템플릿 + 건수·토큰 변수로 보낸다 — 해시는 보낸 토큰의 SHA-256", async () => {
      const kakao = channel(true);
      const { admin, calls } = fakeAdmin({ rows: [{ ...APPROVAL_ROW, channel: "kakao" }], contacts: { "row-1": "01012345678" }, templates: LINK_TEMPLATES });
      await dispatchNotifications(deps(admin, { email: channel(), kakao }));
      expect(kakao.sent).toHaveLength(1);
      const sent = kakao.sent[0]!;
      expect(sent.templateCode).toBe("TPL_APPROVAL_LINK");
      const token = sent.variables!["#{token}"]!;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(sent.variables).toEqual({ "#{건수}": "3", "#{token}": token });
      expect(issues(calls)).toEqual([{ p_outbox_id: "row-1", p_token_hash: createHash("sha256").update(token).digest("hex") }]);
      // 발급이 보내기보다 먼저다 — 토큰이 DB 에 없는 링크를 보내지 않는다
      expect(calls.findIndex((c) => c.fn === "login_link_issue")).toBeLessThan(calls.findIndex((c) => c.fn === "notification_finish"));
    });

    it("INV-K1 (S3): 발송 기록(끝내기 인자)에 토큰 원문이 없다", async () => {
      const kakao = channel(false);
      const { admin, calls } = fakeAdmin({ rows: [{ ...APPROVAL_ROW, channel: "kakao" }], contacts: { "row-1": "01012345678" }, templates: LINK_TEMPLATES });
      await dispatchNotifications(deps(admin, { email: channel(), kakao }));
      const token = kakao.sent[0]!.variables!["#{token}"]!;
      expect(JSON.stringify(finishes(calls))).not.toContain(token);
    });

    it("INV-K1 (S3, 실패경로): 보내기가 실패해도 오류 코드에 토큰이 없다", async () => {
      const sentTokens: string[] = [];
      const kakao: NotificationChannel = {
        fake: false,
        async send(m) {
          sentTokens.push(m.variables?.["#{token}"] ?? "");
          throw new ChannelError("solapi_bad");
        },
        lookup: null,
      };
      const { admin, calls } = fakeAdmin({ rows: [{ ...APPROVAL_ROW, channel: "kakao" }], contacts: { "row-1": "01012345678" }, templates: LINK_TEMPLATES });
      await dispatchNotifications(deps(admin, { email: channel(), kakao }));
      expect(sentTokens[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(JSON.stringify(finishes(calls))).not.toContain(sentTokens[0]!);
      expect((finishes(calls)[0] as { p_error_code: string }).p_error_code).toBe("solapi_bad");
    });

    it("INV-K1 (실패경로): 링크 템플릿이 없으면 지금 그대로 — 발급하지 않고 토큰 없는 승인 요청 템플릿으로", async () => {
      const kakao = channel(true);
      const { admin, calls } = fakeAdmin({
        rows: [{ ...APPROVAL_ROW, channel: "kakao" }],
        contacts: { "row-1": "01012345678" },
        templates: [{ kind: "approval_request", template_code: "TPL_APPROVAL", login_link_template_code: null }],
      });
      await dispatchNotifications(deps(admin, { email: channel(), kakao }));
      expect(issues(calls)).toEqual([]);
      expect(kakao.sent.map((m) => [m.templateCode, m.variables])).toEqual([["TPL_APPROVAL", { "#{건수}": "3" }]]);
    });

    it("INV-K1 (비범위): 이메일 통로·승인 재알림은 링크 템플릿이 있어도 토큰을 발급하지 않는다", async () => {
      const email = channel();
      const kakao = channel(true);
      const { admin, calls } = fakeAdmin({
        rows: [
          { ...APPROVAL_ROW, id: "e1" },
          { ...APPROVAL_ROW, id: "k2", channel: "kakao", kind: "approval_reminder", round: 1, days_left: 2 },
        ],
        contacts: { e1: "haru@example.com", k2: "01012345678" },
        templates: [...LINK_TEMPLATES, { kind: "approval_reminder", template_code: "TPL_REMIND" }],
      });
      await dispatchNotifications(deps(admin, { email, kakao }));
      expect(issues(calls)).toEqual([]);
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]!.text).not.toContain("/login/link");
      expect(kakao.sent.map((m) => m.templateCode)).toEqual(["TPL_REMIND"]);
      expect(kakao.sent[0]!.variables).not.toHaveProperty("#{token}");
    });

    it("INV-K1 (실패경로): 발급이 DB 오류면 보내지 않고 다시 보낼 차례로(login_link_failed)", async () => {
      const kakao = channel(true);
      const { admin, calls } = fakeAdmin({
        rows: [{ ...APPROVAL_ROW, channel: "kakao" }],
        contacts: { "row-1": "01012345678" },
        templates: LINK_TEMPLATES,
        issue: { data: null, error: { code: "57014" } },
      });
      await dispatchNotifications(deps(admin, { email: channel(), kakao }));
      expect(kakao.sent).toHaveLength(0);
      expect(finishes(calls).map((f) => { const a = f as { p_outcome: string; p_error_code: string }; return `${a.p_outcome}:${a.p_error_code}`; })).toEqual(["error:login_link_failed"]);
    });

    it("INV-K1 (실패경로): DB 가 그 줄에 발급하지 않으면(false) 보내지 않는다 — 토큰 없는 링크를 보내지 않는다", async () => {
      const kakao = channel(true);
      const { admin, calls } = fakeAdmin({
        rows: [{ ...APPROVAL_ROW, channel: "kakao" }],
        contacts: { "row-1": "01012345678" },
        templates: LINK_TEMPLATES,
        issue: { data: false, error: null },
      });
      await dispatchNotifications(deps(admin, { email: channel(), kakao }));
      expect(kakao.sent).toHaveLength(0);
      expect(finishes(calls).map((f) => (f as { p_error_code: string }).p_error_code)).toEqual(["login_link_failed"]);
    });
  });

  it("INV-NB2 (S2c): 승인 재알림 줄은 건수·남은 일수로 본문을 만든다", async () => {
    const email = channel();
    const { admin } = fakeAdmin({ rows: [{ ...APPROVAL_ROW, kind: "approval_reminder", round: 1, waiting_count: 3, days_left: 1 }], contacts: { "row-1": "haru@example.com" } });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent[0]!.subject).toBe("[팬꾹] 선물 승인 기한 안내");
    expect(email.sent[0]!.text).toContain("승인 대기 3건, 1일 뒤 자동 반려");
  });

  it("INV-NB5 (S5): 하루 묶음 줄은 주문번호 없이 소식 건수로 — 크리에이터가 받으면 처리할 일 링크", async () => {
    const email = channel();
    const digest: Row = { ...ROW, kind: "status_digest", order_no: null, item_count: 2, recipient_is_creator: true };
    const { admin, calls } = fakeAdmin({ rows: [digest], contacts: { "row-1": "a@example.com" } });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent[0]!.subject).toBe("[팬꾹] 새 선물 소식");
    expect(email.sent[0]!.text).toContain("새 선물 소식 2건이 있습니다.");
    expect(email.sent[0]!.text).toContain("https://fankkuk.example.com/creator/actions");
    expect(finishes(calls).map((f) => (f as { p_outcome: string }).p_outcome)).toEqual(["sent"]);
  });

  it("INV-NB1 (실패경로): 승인 요청 줄에 건수가 없으면 보내지 않고 건너뜀", async () => {
    const email = channel();
    const { admin, calls } = fakeAdmin({ rows: [{ ...APPROVAL_ROW, waiting_count: null }], contacts: { "row-1": "haru@example.com" } });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent).toHaveLength(0);
    expect(finishes(calls).map((f) => (f as { p_error_code: string }).p_error_code)).toEqual(["body_unavailable"]);
  });

  it("INV-N7 (실패경로): 템플릿 ID 가 있어도 템플릿 문서에 본문이 없는 종류는 알림톡으로 보내지 않고 건너뜀", async () => {
    const kakao = channel(true);
    const { admin, calls } = fakeAdmin({
      rows: [{ ...ROW, channel: "kakao" }],
      contacts: { "row-1": "01012345678" },
      templates: [{ kind: "arrived", template_code: "TPL_ARRIVED_1" }],
    });
    await dispatchNotifications(deps(admin, { email: channel(), kakao }));
    expect(kakao.sent).toHaveLength(0);
    expect(finishes(calls)).toEqual([{ p_id: "row-1", p_claimed_at: CLAIMED, p_outcome: "skipped", p_provider_message_id: null, p_error_code: "alimtalk_unavailable", p_fake: false }]);
  });

  it("INV-N20: 역조공 받기 줄은 꺼낸 sender_name(DB 값)으로 보낸 크리에이터 이름을 넣고 그 몫의 선물 상세(#todo — action-center INV-J12·J13)로 잇는다. 이름이 없는 줄은 보내지 않는다", async () => {
    const email = channel();
    const { admin, calls } = fakeAdmin({
      rows: [
        { ...ROW, id: "offer", kind: "revgift_offer", order_no: "RG-7K3M90", sender_name: "모모", must_deliver: true },
        { ...ROW, id: "nameless", kind: "revgift_offer", order_no: "RG-7K3M91", sender_name: null, must_deliver: true },
      ],
      contacts: { offer: "a@example.com", nameless: "b@example.com" },
    });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.text).toContain("모모님");
    expect(email.sent[0]!.text).toContain("/gifts/RG-7K3M90#todo");
    const nameless = finishes(calls).find((a) => (a as { p_id: string }).p_id === "nameless") as { p_outcome: string; p_error_code: string };
    expect(`${nameless.p_outcome}:${nameless.p_error_code}`).toBe("skipped:body_unavailable");
  });

  it("INV-N17 ② · decline-block INV-D5: 거절 알림 문구는 꺼낸 줄의 undelivered_reason(DB 값)으로 고르고, 값이 없는 줄은 보내지 않는다(2026-10-12 (2) D11)", async () => {
    const email = channel();
    const { admin, calls } = fakeAdmin({
      rows: [
        { ...ROW, id: "declined", kind: "gift_undelivered", undelivered_reason: "declined", must_deliver: true },
        { ...ROW, id: "expired", kind: "gift_undelivered", undelivered_reason: "expired", must_deliver: true },
        { ...ROW, id: "missing", kind: "gift_undelivered", must_deliver: true },
      ],
      contacts: { declined: "a@example.com", expired: "b@example.com", missing: "c@example.com" },
    });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    const subject = (id: string) => email.sent.find((m) => m.outboxId === id)?.subject;
    expect(subject("declined")).toBe("[팬꾹] 크리에이터가 선물 수령을 거절했습니다");
    expect(subject("expired")).toBe("[팬꾹] 보낸 선물의 승인 기한이 지나 자동 반려되었습니다");
    expect(subject("missing")).toBeUndefined();
    const missing = finishes(calls).find((a) => (a as { p_id: string }).p_id === "missing") as { p_outcome: string; p_error_code: string };
    expect(`${missing.p_outcome}:${missing.p_error_code}`).toBe("skipped:body_unavailable");
  });

  it("INV-N6: 본문 끝 「꺼 두어도 가요」는 꺼낸 줄의 must_deliver(DB 판정)로 고른다 — 앱 목록을 다시 보지 않는다", async () => {
    const email = channel();
    const { admin } = fakeAdmin({
      rows: [
        { ...ROW, id: "must", kind: "arrived", must_deliver: true },
        { ...ROW, id: "optional", kind: "difference_due", must_deliver: false },
      ],
      contacts: { must: "a@example.com", optional: "b@example.com" },
    });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    const text = (id: string) => email.sent.find((m) => m.outboxId === id)!.text;
    expect(text("must")).toContain("서비스 이용에 필요한 필수 알림으로, 수신 설정과 관계없이 발송됩니다.");
    expect(text("optional")).not.toContain("꺼 두어도 가요");
  });

  it("INV-N6 (실패경로): 꺼낸 줄에 must_deliver 가 없으면 꼴이 다른 줄이라 보내지 않는다", async () => {
    const email = channel();
    const noFlag: Record<string, unknown> = { ...ROW };
    delete noFlag.must_deliver;
    const { admin } = fakeAdmin({ rows: [noFlag as typeof ROW], contacts: { "row-1": "a@example.com" } });
    await dispatchNotifications(deps(admin, { email, kakao: null }));
    expect(email.sent).toHaveLength(0);
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
        throw new Error("카카오 템플릿 코드가 설정돼 있는데 솔라피 설정(SOLAPI_API_KEY·SOLAPI_API_SECRET·SMS_SENDER_NUMBER·KAKAO_PF_ID)이 없다");
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
    const { admin, calls } = fakeAdmin({ rows: [{ ...ROW, kind: "approval_request", waiting_count: 1, must_deliver: true }], fail: { notification_contact: { code: "57014" } } });
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

  it("INV-N5·N16: 묶음 안에서도 줄마다 시간을 본다 — 30초가 지나면 남은 줄은 보내지 않고 「끝나지 않음」으로 센다(멈춘 줄 정리가 나중에 다시 보낸다)", async () => {
    let t = 0;
    const rows = [ROW, { ...ROW, id: "row-2" }, { ...ROW, id: "row-3" }];
    const { admin, calls } = fakeAdmin({ rows, contacts: { "row-1": "a@example.com", "row-2": "b@example.com", "row-3": "c@example.com" } });
    const email = channel();
    const slow = { ...email, send: async (m: ChannelMessage) => { t += TIME_BUDGET_MS; return email.send(m); } };
    const r = await dispatchNotifications({ ...deps(admin, { email: slow, kakao: null }), now: () => t });
    expect(email.sent).toHaveLength(1);
    expect(finishes(calls)).toHaveLength(1);
    expect(r).toMatchObject({ ok: true, counts: { sent: 1, unfinished: 2 } });
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

