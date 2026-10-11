import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ChannelError, type NotificationChannels } from "../api/channels";
import { buildNotificationBody, kindHasPath, NOTIFICATION_KINDS, siteOrigin, type NotificationBody } from "../lib/notification-body";

// 보내는 일꾼 (notifications INV-N5·N6·N7·N8·N10). 앱 서버 키로만 돈다.
// 줄의 상태(대기 → 보내는 중 → 끝)와 「둘이 같은 줄을 꺼내지 않음」, 재시도 간격·실패 한도, 끝난 승인 요청 건너뛰기는 DB 함수가 지킨다.
// 일꾼이 하는 일: 꺼낸 줄마다 ① 연락처 읽기(꺼진 칸·확인 안 된 이메일은 빈 값 → 건너뜀, INV-N6) ② 꺼낸 값으로만 본문 만들기(INV-N1)
// ③ 줄의 통로로 보내기 — 실패해도 다른 통로로 갈아타지 않는다(INV-N7) ④ 결과를 끝내기로 남기기.
// 연락처·본문·오류 문장은 어디에도 남기지 않는다(INV-N10) — 끝내기에는 정해진 오류 코드만 넘기고, 로그를 찍지 않는다.
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
  order_no: z.string(),
  nickname: z.string(),
  auto_reject_at: z.string().nullable(),
  /** 꼭 가는 알림인가 — DB 가 줄의 종류로 정한 값(public.notification_kind_must_deliver). 본문 끝 안내는 이것을 따른다(INV-N6). */
  must_deliver: z.boolean(),
  /** 꺼낸 시각 — 끝내기에 그대로 돌려준다. 다른 일꾼이 다시 꺼낸 줄이면 DB 가 이 결과를 받지 않는다(INV-N5). 문자열 그대로 둔다(밀리초로 바꾸면 값이 달라진다). */
  claimed_at: z.string(),
});
type ClaimedRow = z.infer<typeof claimedRow>;

const rowId = z.object({ id: z.string() });
const claimToken = z.object({ id: z.string(), claimed_at: z.string() });
const templateRow = z.object({ kind: z.string(), template_code: z.string() });

type Outcome = { outcome: "sent"; providerMessageId: string | null; fake: boolean } | { outcome: "skipped" | "error"; code: string };

class DbFailure extends Error {}

async function rpc(admin: DispatchDeps["admin"], fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new DbFailure(fn);
  return data;
}

async function sendRow(deps: DispatchDeps, origin: string, channels: NotificationChannels, templates: Map<string, string>, row: ClaimedRow): Promise<Outcome> {
  // 받는 사람별 경로가 없는 종류는 몇 번을 다시 해도 같다 — 다시 보내지 않고 건너뜀(운영자 목록에 남는다)
  if (!kindHasPath(row.kind)) return { outcome: "skipped", code: "kind_not_ready" };

  const contact = await deps.admin.rpc("notification_contact", { p_outbox_id: row.id });
  // 연락처를 못 읽은 것(오류)과 보낼 곳이 없는 것(빈 값)은 다르다 — 오류는 다시 보낼 차례로
  if (contact.error) return { outcome: "error", code: "contact_failed" };
  if (typeof contact.data !== "string" || contact.data === "") return { outcome: "skipped", code: "no_contact" };

  const channel = row.channel === "kakao" ? channels.kakao : channels.email;
  if (!channel) return { outcome: "error", code: "channel_unavailable" };
  const templateCode = row.channel === "kakao" ? (templates.get(row.kind) ?? null) : null;
  if (row.channel === "kakao" && !templateCode) return { outcome: "error", code: "template_missing" };

  let body: NotificationBody;
  try {
    body = buildNotificationBody({ kind: row.kind, round: row.round, nickname: row.nickname, orderNo: row.order_no, autoRejectAt: row.auto_reject_at, mustDeliver: row.must_deliver, appOrigin: origin });
  } catch {
    return { outcome: "skipped", code: "body_unavailable" };
  }

  try {
    const { providerMessageId } = await channel.send({ outboxId: row.id, to: contact.data, subject: body.subject, text: body.text, templateCode });
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
    // 72시간 재알림 줄(INV-N8)과, 결과를 모르는 채 멈춘 메일 줄 되돌리기(INV-N5)
    await rpc(deps.admin, "notification_enqueue_due");
    await rpc(deps.admin, "notification_requeue_stale");

    const tpl = await deps.admin.from("notification_kakao_templates").select("kind, template_code");
    if (tpl.error) throw new DbFailure("templates");
    const templates = new Map(z.array(templateRow).parse(tpl.data ?? []).map((t) => [t.kind, t.template_code]));

    let channels: NotificationChannels;
    try {
      channels = deps.chooseChannels(templates.size > 0);
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
