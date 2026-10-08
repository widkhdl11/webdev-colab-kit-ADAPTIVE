import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 운영자 실패 목록 읽기 (notifications INV-N10). 로그인한 운영자의 세션 클라이언트로 부른다 — 운영자가 아니면 DB 가 거부한다.
// 보이는 것은 종류·주문번호·차례·통로·상태·시도 횟수·오류 코드·끝난 시각뿐이다. 받는 사람·연락처·본문은 DB 가 돌려주지 않고,
// 응답에 다른 칸이 섞여 와도 여기서 꺼내지 않는다. 꼴이 다른 답은 오류로 던진다(빈 목록으로 보이게 하지 않는다).

const KINDS = ["approval_request", "arrived", "inspected", "shipped", "in_transit", "delivered", "hold", "box_arrived", "hold_fan"] as const;
export type NotificationKindName = (typeof KINDS)[number];

const row = z.object({
  // 모르는 종류(새로 더한 알림)가 와도 화면 전체를 오류로 만들지 않는다 — 종류 코드를 그대로 보여 준다
  kind: z.string().regex(/^[a-z_]{1,40}$/),
  order_no: z.string(),
  round: z.number().int(),
  channel: z.enum(["email", "kakao"]),
  status: z.enum(["failed", "skipped"]),
  attempts: z.number().int(),
  error_code: z.string().nullable(),
  finished_at: z.string(),
});

export type NotificationFailure = {
  kind: string;
  orderNo: string;
  round: number;
  channel: "email" | "kakao";
  status: "failed" | "skipped";
  attempts: number;
  errorCode: string | null;
  finishedAt: string;
};

export async function readNotificationFailures(client: Pick<SupabaseClient, "rpc">): Promise<NotificationFailure[]> {
  const { data, error } = await client.rpc("notification_failures");
  if (error) throw new Error(`보내지 못한 알림 목록을 읽지 못했다: ${error.code}`);
  const parsed = z.array(row).safeParse(data);
  if (!parsed.success) throw new Error("보내지 못한 알림 목록의 모양이 다르다");
  return parsed.data.map((r) => ({
    kind: r.kind,
    orderNo: r.order_no,
    round: r.round,
    channel: r.channel,
    status: r.status,
    attempts: r.attempts,
    errorCode: r.error_code,
    finishedAt: r.finished_at,
  }));
}

const KIND_LABEL: Record<NotificationKindName, string> = {
  approval_request: "승인 요청",
  arrived: "입고",
  inspected: "검수",
  shipped: "출고",
  in_transit: "배송중",
  delivered: "수령",
  hold: "보관",
  box_arrived: "상자 도착",
  hold_fan: "돌려보낼 상자",
};

function isKnownKind(kind: string): kind is NotificationKindName {
  return (KINDS as readonly string[]).includes(kind);
}

export function kindLabel(kind: string, round = 1): string {
  if (!isKnownKind(kind)) return kind;
  const base = KIND_LABEL[kind];
  if (kind !== "approval_request" || round === 1) return base;
  return `${base} (${round === 2 ? "도착 재알림" : "3차 재알림"})`;
}

/** 일꾼과 DB 가 남기는 오류 코드 → 운영자가 읽는 말. 모르는 코드는 코드 그대로 보인다. */
const ERROR_LABEL: Record<string, string> = {
  no_contact: "알림을 꺼 두었거나 확인된 이메일·휴대폰 번호가 없어요",
  request_not_waiting: "보내기 전에 승인·거절·반려돼서 보내지 않았어요",
  kind_not_ready: "아직 보낼 수 없는 종류예요(택배사 연결 전)",
  body_unavailable: "본문을 만들 수 없었어요(주문번호 꼴 확인)",
  contact_failed: "연락처를 읽지 못했어요",
  channel_unavailable: "카카오 알림톡 대행사가 연결되지 않았어요",
  template_missing: "이 종류의 카카오 템플릿 코드가 없어요",
  smtp_error: "메일 서버가 받지 않았어요",
  fake_kakao_error: "로컬 가짜 카카오가 보내지 못했어요",
  send_failed: "보내는 중 알 수 없는 오류가 났어요",
  row_unreadable: "발송 기록을 읽지 못했어요",
  stale_requeued: "결과를 모른 채 멈춰서 다시 보냈어요",
  stale_not_delivered: "대행사 조회 결과 가지 않아서 다시 보냈어요",
};

export function errorCodeLabel(code: string | null): string {
  if (!code) return "—";
  return ERROR_LABEL[code] ?? code;
}
