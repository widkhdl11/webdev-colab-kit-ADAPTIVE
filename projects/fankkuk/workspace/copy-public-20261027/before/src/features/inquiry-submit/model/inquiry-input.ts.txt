import { z } from "zod";
import { isInquiryKind, type InquiryKind } from "@/entities/inquiry/model/inquiry-kind";
import { isOrderNo } from "@/entities/order/model/order-no";
import { charCount } from "@/shared/lib/validation/char-count";

// 1:1 문의 입력 검사 (admin-console INV-K11, 결정 d25). DB 함수 create_inquiry 와 같은 경계다 —
// 분류 여섯 가지 · 제목 1~100자 · 본문 1~4000자(앞뒤 공백을 지우고 센다) · 주문번호는 없거나 FC-7K3M9 꼴.
// 주문번호는 앞뒤 공백을 지우고 대문자로 바꾼 뒤 검사하고, 빈칸이면 「없음」이다.
// 화면(보내기 전)과 서버(라우트)가 같은 함수를 쓴다.

export const INQUIRY_TITLE_MAX = 100;
export const INQUIRY_BODY_MAX = 4000;

export type InquiryField = "kind" | "orderNo" | "title" | "body";

export const INQUIRY_MESSAGES: Readonly<Record<InquiryField, string>> = {
  kind: "분류를 골라 주세요.",
  orderNo: "주문번호는 FC-7K3M9 형식으로 적어 주세요.",
  title: `제목은 1~${INQUIRY_TITLE_MAX}자로 적어 주세요.`,
  body: `내용은 1~${INQUIRY_BODY_MAX}자로 적어 주세요.`,
};

export type InquiryValue = { kind: InquiryKind; title: string; body: string; orderNo: string | null };

export type InquiryCheck = { ok: true; value: InquiryValue } | { ok: false; field: InquiryField; message: string };

const inputShape = z
  .object({
    kind: z.string(),
    title: z.string(),
    body: z.string(),
    orderNo: z.string().nullable().optional(),
  })
  .strict();

export type InquiryInput = z.input<typeof inputShape>;

/** 주문번호 칸을 다듬는다: 앞뒤 공백 제거·대문자, 빈칸은 null. 꼴 검사는 하지 않는다. */
export function normalizeOrderNo(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "" ? null : v;
}

/** 꼴이 아예 다른 입력(칸이 없거나 문자열이 아님)은 분류부터 틀린 것으로 본다. 첫 번째로 걸린 칸 하나만 알려 준다. */
export function checkInquiryInput(input: unknown): InquiryCheck {
  const shaped = inputShape.safeParse(input);
  if (!shaped.success) return { ok: false, field: "kind", message: INQUIRY_MESSAGES.kind };
  const { kind, title: rawTitle, body: rawBody, orderNo: rawOrderNo } = shaped.data;
  if (!isInquiryKind(kind)) return { ok: false, field: "kind", message: INQUIRY_MESSAGES.kind };
  const orderNo = normalizeOrderNo(rawOrderNo);
  if (orderNo !== null && !isOrderNo(orderNo)) return { ok: false, field: "orderNo", message: INQUIRY_MESSAGES.orderNo };
  const title = rawTitle.trim();
  if (charCount(title) < 1 || charCount(title) > INQUIRY_TITLE_MAX) return { ok: false, field: "title", message: INQUIRY_MESSAGES.title };
  const body = rawBody.trim();
  if (charCount(body) < 1 || charCount(body) > INQUIRY_BODY_MAX) return { ok: false, field: "body", message: INQUIRY_MESSAGES.body };
  return { ok: true, value: { kind, title, body, orderNo } };
}
