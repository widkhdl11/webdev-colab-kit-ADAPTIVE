import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ChannelError, type NotificationChannels } from "../api/channels";
import { loginLinksOf } from "@/entities/session/api/login-links";
import { buildAlimtalkVariables, buildLoginLinkAlimtalkVariables } from "../lib/alimtalk-body";
import { buildNotificationBody, kindHasPath, NOTIFICATION_KINDS, siteOrigin, type NotificationBody, type NotificationBodyInput } from "../lib/notification-body";

// 보내는 일꾼 (notifications INV-N5·N6·N7·N8·N10, notification-batching INV-NB1~NB5). 앱 서버 키로만 돈다.
// 줄의 상태(대기 → 보내는 중 → 끝)와 「둘이 같은 줄을 꺼내지 않음」, 재시도 간격·실패 한도, 끝난 승인 요청 건너뛰기는 DB 함수가 지킨다.
// 일꾼이 하는 일: 꺼낸 줄마다 ① 연락처 읽기(꺼진 칸·확인 안 된 이메일은 빈 값 → 건너뜀, INV-N6) ② 꺼낸 값으로만 본문 만들기(INV-N1)
// ③ 줄의 통로로 보내기 — 실패해도 다른 통로로 갈아타지 않는다(INV-N7) ④ 결과를 끝내기로 남기기.
// 연락처·본문·오류 문장은 어디에도 남기지 않는다(INV-N10) — 끝내기에는 정해진 오류 코드만 넘기고, 로그를 찍지 않는다.
// link-login INV-K1: 카카오 승인 요청은 로그인 링크 템플릿 코드가 있을 때만, 보내기 직전에 그 줄에 묶은 1회용 토큰을 발급해 그 템플릿으로 보낸다.
// 토큰은 알림톡 변수로만 넘긴다 — 끝내기·오류 코드·로그에 없다. 코드가 없으면(솔라피 검수 전) 지금 템플릿 그대로(토큰 없음).
// 한 번 부를 때 30초가 지나면 새 묶음을 꺼내지 않는다. 다시 보낼 가장 짧은 간격(1분)보다 짧아서, 이번에 실패한 줄을
// 같은 호출에서 또 꺼내 시도 횟수를 두 번 깎지 않고, 요청이 끊겨 줄이 「보내는 중」에 남는 일도 줄인다.

export type DispatchDeps = {
  admin: Pick<SupabaseClient, "rpc" | "from">;
  /** 설정의 사이트 주소 — 알림 링크는 요청 헤더가 아니라 이것으로 만든다(INV-N9) */
  appOrigin: string;
  /** 카카오 템플릿 코드가 하나라도 있는지를 받아 통로를 고른다. 운영에서 대행사 없이 템플릿만 있으면 던진다(INV-N11). */
  chooseChannels: (hasKakaoTemplates: boolean) => NotificationChannels;
  /** 시험용 시계(밀리초). 기본은 Date.now. */
  now?: () => number;
};

export type DispatchCounts = {
  sent: number;
  skipped: number;
  retrying: number;
  failed: number;
  /** 끝내기가 실패해 「보내는 중」에 남은 줄 — 10분 뒤 멈춘 줄 정리가 맡는다 */
  unfinished: number;
  staleResolved: number;
  /** 발송 조회를 못 해 그대로 둔 멈춘 줄(조회 실패·조회할 통로 없음) */
  staleUnchecked: number;
};
export type DispatchResult = { ok: true; counts: DispatchCounts } | { ok: false; reason: "db" | "config"; counts: DispatchCounts };

export function emptyCounts(): DispatchCounts {
  return { sent: 0, skipped: 0, retrying: 0, failed: 0, unfinished: 0, staleResolved: 0, staleUnchecked: 0 };
}

export const TIME_BUDGET_MS = 30_000;
/** 묶음 하나에 꺼내는 줄 수 */
const BATCH = 20;

const claimedRow = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  channel: z.enum(["email", "kakao"]),
  round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** 하루 묶음은 주문이 없어 null(notification-batching INV-NB3). 다른 종류에서 비면 본문을 만들지 않는다 */
  order_no: z.string().nullable(),
  nickname: z.string(),
  /** 승인 요청·재알림만 — 보내는 순간 그 크리에이터의 승인 대기 건수(DB 가 센 값, INV-NB1). 다른 종류는 null */
  waiting_count: z.number().int().nullable().optional(),
  /** 재알림만 — 가장 빨리 자동 반려될 건까지 남은 일수(DB 가 센 값, INV-NB2). 다른 종류는 null */
  days_left: z.number().int().nullable().optional(),
  /** 하루 묶음만 — 소식 건수(INV-NB5). 다른 종류는 null */
  item_count: z.number().int().nullable().optional(),
  /** 받는 사람이 크리에이터인가 — 하루 묶음 링크를 고른다 */
  recipient_is_creator: z.boolean().optional(),
  /** 거절 알림의 문구 갈래 — DB 가 주문 상태로 정한 값(직접·차단 거절 declined · 7일 반려 expired). 다른 종류는 null */
  undelivered_reason: z.enum(["declined", "expired"]).nullable().optional(),
  /** 역조공 받기 줄만 — 보낸 크리에이터 공개 이름(DB 가 넣은 값, INV-N20). 다른 종류는 null */
  sender_name: z.string().nullable().optional(),
  /** 반송 주소 재알림 줄만 — 처분 예정 시각(반송 대기 + 720시간, INV-N22). 다른 종류는 null. 이 칸을 내주지 않는 옛 DB 면 재알림은 만들지 못해 보내지 않는다 */
  dispose_due_at: z.string().nullable().optional(),
  /** 꼭 가는 알림인가 — DB 가 줄의 종류로 정한 값(public.notification_kind_must_deliver). 본문 끝 안내는 이것을 따른다(INV-N6). */
  must_deliver: z.boolean(),
  /** 꺼낸 시각 — 끝내기에 그대로 돌려준다. 다른 일꾼이 다시 꺼낸 줄이면 DB 가 이 결과를 받지 않는다(INV-N5). 문자열 그대로 둔다(밀리초로 바꾸면 값이 달라진다). */
  claimed_at: z.string(),
});
type ClaimedRow = z.infer<typeof claimedRow>;

const rowId = z.object({ id: z.string() });
const claimToken = z.object({ id: z.string(), claimed_at: z.string() });
const templateRow = z.object({ kind: z.string(), template_code: z.string(), login_link_template_code: z.string().nullable().optional() });

/** 카카오 템플릿 설정 — 종류별 코드와, 승인 요청의 로그인 링크 템플릿 코드(link-login, 없으면 null) */
type Templates = { byKind: Map<string, string>; loginLink: string | null };

type Outcome = { outcome: "sent"; providerMessageId: string | null; fake: boolean } | { outcome: "skipped" | "error"; code: string };

class DbFailure extends Error {}

async function rpc(admin: DispatchDeps["admin"], fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new DbFailure(fn);
  return data;
}

async function sendRow(deps: DispatchDeps, origin: string, channels: NotificationChannels, templates: Templates, row: ClaimedRow): Promise<Outcome> {
  // 받는 사람별 경로가 없는 종류는 몇 번을 다시 해도 같다 — 다시 보내지 않고 건너뜀(운영자 목록에 남는다)
  if (!kindHasPath(row.kind)) return { outcome: "skipped", code: "kind_not_ready" };

  const contact = await deps.admin.rpc("notification_contact", { p_outbox_id: row.id });
  // 연락처를 못 읽은 것(오류)과 보낼 곳이 없는 것(빈 값)은 다르다 — 오류는 다시 보낼 차례로
  if (contact.error) return { outcome: "error", code: "contact_failed" };
  if (typeof contact.data !== "string" || contact.data === "") return { outcome: "skipped", code: "no_contact" };

  const channel = row.channel === "kakao" ? channels.kakao : channels.email;
  if (!channel) return { outcome: "error", code: "channel_unavailable" };
  let templateCode = row.channel === "kakao" ? (templates.byKind.get(row.kind) ?? null) : null;
  if (row.channel === "kakao" && !templateCode) return { outcome: "error", code: "template_missing" };

  const input: NotificationBodyInput = {
    kind: row.kind,
    round: row.round,
    nickname: row.nickname,
    orderNo: row.order_no,
    waitingCount: row.waiting_count ?? null,
    daysLeft: row.days_left ?? null,
    itemCount: row.item_count ?? null,
    recipientIsCreator: row.recipient_is_creator ?? false,
    undeliveredReason: row.undelivered_reason ?? null,
    senderName: row.sender_name ?? null,
    disposeDueAt: row.dispose_due_at ?? null,
    mustDeliver: row.must_deliver,
    appOrigin: origin,
  };
  let body: NotificationBody;
  try {
    body = buildNotificationBody(input);
  } catch {
    return { outcome: "skipped", code: "body_unavailable" };
  }
  // 알림톡은 검수받은 템플릿에 변수만 채운다(INV-N7) — 템플릿 문서에 없는 종류·값이 빈 줄은 몇 번을 다시 해도 같다
  let variables = row.channel === "kakao" ? buildAlimtalkVariables(input) : null;
  if (row.channel === "kakao" && !variables) return { outcome: "skipped", code: "alimtalk_unavailable" };

  // link-login INV-K1: 보내는 순간 그 줄의 받는 계정에 묶어 발급한다. 발급을 못 하면 토큰 없는 링크를 보내지 않고 다시 보낼 차례로
  if (row.channel === "kakao" && row.kind === "approval_request" && templates.loginLink) {
    let token: string | null;
    try {
      token = await loginLinksOf(deps.admin).issue(row.id);
    } catch {
      return { outcome: "error", code: "login_link_failed" };
    }
    const linkVariables = token ? buildLoginLinkAlimtalkVariables(input, token) : null;
    if (!linkVariables) return { outcome: "error", code: "login_link_failed" };
    templateCode = templates.loginLink;
    variables = linkVariables;
  }

  try {
    const { providerMessageId } = await channel.send({ outboxId: row.id, to: contact.data, subject: body.subject, text: body.text, templateCode, variables });
    return { outcome: "sent", providerMessageId, fake: channel.fake };
  } catch (e) {
    return { outcome: "error", code: e instanceof ChannelError ? e.code : "send_failed" };
  }
}

export async function dispatchNotifications(deps: DispatchDeps): Promise<DispatchResult> {
  const now = deps.now ?? Date.now;
  const deadline = now() + TIME_BUDGET_MS;
  const counts = emptyCounts();

  // 사이트 주소가 틀렸으면 모든 줄이 같은 이유로 실패한다 — 줄을 꺼내기 전에 설정 오류로 멈춘다
  let origin: string;
  try {
    origin = siteOrigin(deps.appOrigin);
  } catch {
    return { ok: false, reason: "config", counts };
  }

  try {
    // 기한 알림 줄 — 승인 요청 창 끝 통·승인 재알림(notification-batching INV-NB1·NB2)·역조공 받기 재알림 — 과, 결과를 모르는 채 멈춘 메일 줄 되돌리기(INV-N5)
    await rpc(deps.admin, "notification_enqueue_due");
    await rpc(deps.admin, "notification_requeue_stale");

    const tpl = await deps.admin.from("notification_kakao_templates").select("kind, template_code, login_link_template_code");
    if (tpl.error) throw new DbFailure("templates");
    const rows = z.array(templateRow).parse(tpl.data ?? []);
    const templates: Templates = {
      byKind: new Map(rows.map((t) => [t.kind, t.template_code])),
      loginLink: rows.find((t) => t.kind === "approval_request")?.login_link_template_code ?? null,
    };

    let channels: NotificationChannels;
    try {
      channels = deps.chooseChannels(templates.byKind.size > 0);
    } catch {
      return { ok: false, reason: "config", counts };
    }

    // 발송 조회가 되는 통로의 멈춘 줄: 갔으면 보냄, 안 갔으면 다시 보낼 차례로. 조회를 못 하면 건드리지 않는다.
    const stale = z.array(rowId).parse((await rpc(deps.admin, "notification_stale_lookups")) ?? []);
    const lookup = channels.kakao?.lookup ?? null;
    for (const s of stale) {
      if (!lookup || now() >= deadline) {
        counts.staleUnchecked += 1;
        continue;
      }
      let delivered: boolean;
      try {
        delivered = await lookup(s.id);
      } catch {
        counts.staleUnchecked += 1;
        continue;
      }
      const r = await deps.admin.rpc("notification_resolve_stale", { p_id: s.id, p_delivered: delivered });
      if (r.error) counts.staleUnchecked += 1;
      else counts.staleResolved += 1;
    }

    while (now() < deadline) {
      const rows = await rpc(deps.admin, "notification_claim", { p_limit: BATCH });
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const raw of rows) {
        const parsed = claimedRow.safeParse(raw);
        const id = claimToken.safeParse(raw);
        // 묶음 안에서도 줄마다 시간을 본다 — 예약 발송(INV-N16)은 DB 쪽 60초·배포처 함수 시간 안에 끝나야 한다.
        // 남은 줄은 보내지 않았으니 「보내는 중」으로 두면 멈춘 줄 정리(INV-N5)가 나중에 다시 보낸다 — 두 번 가지 않는다.
        if (!id.success || now() >= deadline) {
          counts.unfinished += 1;
          continue;
        }
        const o: Outcome = parsed.success ? await sendRow(deps, origin, channels, templates, parsed.data) : { outcome: "error", code: "row_unreadable" };
        const fin = await deps.admin.rpc("notification_finish", {
          p_id: id.data.id,
          p_claimed_at: id.data.claimed_at,
          p_outcome: o.outcome,
          p_provider_message_id: o.outcome === "sent" ? o.providerMessageId : null,
          p_error_code: o.outcome === "sent" ? null : o.code,
          p_fake: o.outcome === "sent" ? o.fake : false,
        });
        if (fin.error) counts.unfinished += 1;
        else if (fin.data === "sent") counts.sent += 1;
        else if (fin.data === "skipped") counts.skipped += 1;
        else if (fin.data === "failed") counts.failed += 1;
        else counts.retrying += 1;
      }
    }
    return { ok: true, counts };
  } catch (e) {
    // 중간에 멈춰도 그때까지 보낸 건수는 돌려준다 — 운영자가 다시 누를지 판단하는 근거다
    if (e instanceof DbFailure || e instanceof z.ZodError) return { ok: false, reason: "db", counts };
    throw e;
  }
}
