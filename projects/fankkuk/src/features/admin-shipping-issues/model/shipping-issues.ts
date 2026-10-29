import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 운영자 「배송문제 확인」 (office-workflow INV-W10 S10f · INV-W7 — 2026-10-21 「도착하지 않은 상자는 30일 하나로, 알림 세 번」, 시안 v32).
// 결제 완료 + 7일이 지났고 아직 입고되지 않은 상자가 있는 진행 중 주문 — 결제 후 경과일 순. 읽기만 한다(상태를 바꾸는 버튼이 없다).
// 칸은 주문번호 · 보낸 사람 닉네임 · 결제 시각 · 결제 후 경과일 · 미도착 상자 수 · 고객 답변(「아직 보내지 않음」을 누른 시각) · 자동 취소일(결제 + 30일).
// 정해진 칸 밖의 값이 오면 내보내지 않는다(strict — 실명·주소·전화번호가 섞여도 화면에 가지 않게). 운영자가 아니면 404.

const READ_FAILED = "목록을 읽지 못했어요. 잠시 뒤 다시 해 주세요.";

const rows = z.array(
  z
    .object({
      order_no: z.string(),
      sender_nickname: z.string(),
      paid_at: z.string(),
      elapsed_days: z.number().int().min(0),
      missing_boxes: z.number().int().positive(),
      not_sent_at: z.string().nullable(),
      auto_cancel_at: z.string(),
    })
    .strict(),
);
const body = z.object({ kind: z.literal("list") }).strict();

export type ShippingIssue = {
  orderNo: string;
  senderNickname: string;
  paidAt: string;
  elapsedDays: number;
  missingBoxes: number;
  notSentAt: string | null;
  autoCancelAt: string;
};

export async function readShippingIssues(client: Pick<SupabaseClient, "rpc">, input: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (!body.safeParse(input).success) return { status: 400, body: { message: "유효하지 않은 요청입니다." } };
  const { data, error } = await client.rpc("admin_shipping_issues");
  if (error) return pgErrorReply(error.code, { limit: READ_FAILED, failed: READ_FAILED });
  const parsed = rows.safeParse(data ?? []);
  if (!parsed.success) return { status: 500, body: { message: READ_FAILED } };
  const issues: ShippingIssue[] = parsed.data.map((r) => ({
    orderNo: r.order_no,
    senderNickname: r.sender_nickname,
    paidAt: r.paid_at,
    elapsedDays: r.elapsed_days,
    missingBoxes: r.missing_boxes,
    notSentAt: r.not_sent_at,
    autoCancelAt: r.auto_cancel_at,
  }));
  return { status: 200, body: { issues } };
}
