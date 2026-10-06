import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ChannelError, type NotificationChannels } from "@/shared/api/notification-channel/channels";
import { buildNotificationBody, NOTIFICATION_KINDS, type NotificationBody } from "../lib/notification-body";

// 보내는 일꾼 (notifications INV-N5·N6·N7·N8·N10). 앱 서버 키로만 돈다.
// 줄의 상태(대기 → 보내는 중 → 끝)와 「둘이 같은 줄을 꺼내지 않음」, 재시도 간격·실패 한도, 끝난 승인 요청 건너뛰기는 DB 함수가 지킨다.
// 일꾼이 하는 일: 꺼낸 줄마다 ① 연락처 읽기(꺼진 칸·확인 안 된 이메일은 빈 값 → 건너뜀, INV-N6) ② 꺼낸 값으로만 본문 만들기(INV-N1)
// ③ 줄의 통로로 보내기 — 실패해도 다른 통로로 갈아타지 않는다(INV-N7) ④ 결과를 끝내기로 남기기.
// 연락처·본문·오류 문장은 어디에도 남기지 않는다(INV-N10) — 끝내기에는 정해진 오류 코드만 넘기고, 로그를 찍지 않는다.

export type DispatchDeps = {
  admin: Pick<SupabaseClient, "rpc" | "from">;
  /** 설정의 사이트 주소 — 알림 링크는 요청 헤더가 아니라 이것으로 만든다(INV-N9) */
  appOrigin: string;
  /** 카카오 템플릿 코드가 하나라도 있는지를 받아 통로를 고른다. 운영에서 대행사 없이 템플릿만 있으면 던진다(INV-N11). */
  chooseChannels: (hasKakaoTemplates: boolean) => NotificationChannels;
};

export type DispatchCounts = { sent: number; skipped: number; retrying: number; failed: number; unfinished: number; staleResolved: number };
export type DispatchResult = { ok: true; counts: DispatchCounts } | { ok: false; reason: "db" | "config" };

/** 한 번 부를 때 꺼내는 묶음 수 — 묶음마다 20줄. 남은 줄은 다음 차례에. */
const MAX_BATCHES = 10;
const BATCH = 20;

const claimedRow = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  channel: z.enum(["email", "kakao"]),
  round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  order_no: z.string(),
  nickname: z.string(),
  auto_reject_at: z.string().nullable(),
});
type ClaimedRow = z.infer<typeof claimedRow>;

const staleRow = z.object({ id: z.string() });
const templateRow = z.object({ kind: z.string(), template_code: z.string() });

type Outcome = { outcome: "sent"; providerMessageId: string | null; fake: boolean } | { outcome: "skipped" | "error"; code: string };

class DbFailure extends Error {}

async function rpc(admin: DispatchDeps["admin"], fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new DbFailure(fn);
  return data;
}

async function sendRow(deps: DispatchDeps, channels: NotificationChannels, templates: Map<string, string>, raw: unknown): Promise<{ id: string; outcome: Outcome } | null> {
  const parsedId = staleRow.safeParse(raw);
  if (!parsedId.success) return null;
  const id = parsedId.data.id;
  const parsed = claimedRow.safeParse(raw);
  if (!parsed.success) return { id, outcome: { outcome: "error", code: "row_unreadable" } };
  const row: ClaimedRow = parsed.data;

  const contact = await deps.admin.rpc("notification_contact", { p_outbox_id: id });
  if (contact.error) return { id, outcome: { outcome: "error", code: "contact_failed" } };
  if (typeof contact.data !== "string" || contact.data === "") return { id, outcome: { outcome: "skipped", code: "no_contact" } };

  const channel = row.channel === "kakao" ? channels.kakao : channels.email;
  if (!channel) return { id, outcome: { outcome: "error", code: "channel_unavailable" } };
  const templateCode = row.channel === "kakao" ? (templates.get(row.kind) ?? null) : null;
  if (row.channel === "kakao" && !templateCode) return { id, outcome: { outcome: "error", code: "template_missing" } };

  let body: NotificationBody;
  try {
    body = buildNotificationBody({
      kind: row.kind,
      round: row.round,
      nickname: row.nickname,
      orderNo: row.order_no,
      autoRejectAt: row.auto_reject_at,
      appOrigin: deps.appOrigin,
    });
  } catch {
    return { id, outcome: { outcome: "error", code: "body_unavailable" } };
  }

  try {
    const { providerMessageId } = await channel.send({ outboxId: id, to: contact.data, subject: body.subject, text: body.text, templateCode });
    return { id, outcome: { outcome: "sent", providerMessageId, fake: channel.fake } };
  } catch (e) {
    return { id, outcome: { outcome: "error", code: e instanceof ChannelError ? e.code : "send_failed" } };
  }
}

export async function dispatchNotifications(deps: DispatchDeps): Promise<DispatchResult> {
  const counts: DispatchCounts = { sent: 0, skipped: 0, retrying: 0, failed: 0, unfinished: 0, staleResolved: 0 };
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
      return { ok: false, reason: "config" };
    }

    // 발송 조회가 되는 통로의 멈춘 줄: 갔으면 보냄, 안 갔으면 다시 보낼 차례로. 조회가 실패하면 건드리지 않는다.
    const stale = z.array(staleRow).parse((await rpc(deps.admin, "notification_stale_lookups")) ?? []);
    const lookup = channels.kakao?.lookup;
    if (lookup) {
      for (const s of stale) {
        let delivered: boolean;
        try {
          delivered = await lookup(s.id);
        } catch {
          continue;
        }
        const r = await deps.admin.rpc("notification_resolve_stale", { p_id: s.id, p_delivered: delivered });
        if (!r.error) counts.staleResolved += 1;
      }
    }

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const rows = await rpc(deps.admin, "notification_claim", { p_limit: BATCH });
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const raw of rows) {
        const done = await sendRow(deps, channels, templates, raw);
        if (!done) {
          counts.unfinished += 1;
          continue;
        }
        const o = done.outcome;
        const fin = await deps.admin.rpc("notification_finish", {
          p_id: done.id,
          p_outcome: o.outcome,
          p_provider_message_id: o.outcome === "sent" ? o.providerMessageId : null,
          p_error_code: o.outcome === "sent" ? null : o.code,
          p_fake: o.outcome === "sent" ? o.fake : false,
        });
        // 끝내기가 실패한 줄은 「보내는 중」에 남는다 — 10분 뒤 멈춘 줄 정리가 맡는다
        if (fin.error) counts.unfinished += 1;
        else if (fin.data === "sent") counts.sent += 1;
        else if (fin.data === "skipped") counts.skipped += 1;
        else if (fin.data === "failed") counts.failed += 1;
        else counts.retrying += 1;
      }
    }
    return { ok: true, counts };
  } catch (e) {
    if (e instanceof DbFailure || e instanceof z.ZodError) return { ok: false, reason: "db" };
    throw e;
  }
}
