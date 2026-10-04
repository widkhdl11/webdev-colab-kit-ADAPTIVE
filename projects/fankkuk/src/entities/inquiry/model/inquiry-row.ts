import { z } from "zod";
import { INQUIRY_KINDS, type InquiryKind } from "./inquiry-kind";

// 1:1 문의 한 줄의 공통 칸 (admin-console INV-K11, 결정 d25). 「내 문의」와 관리자 목록이 같이 쓴다 —
// 관리자 목록은 여기에 쓴 사람·답한 사람 칸을 더한다(admin-inquiry.ts).

export const INQUIRY_STATUSES = ["open", "answered"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export type InquiryBase = {
  id: string;
  kind: InquiryKind;
  title: string;
  body: string;
  orderNo: string | null;
  status: InquiryStatus;
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
};

/** DB 함수(my_inquiries·admin_inquiries)가 돌려주는 공통 칸. */
export const inquiryRowBase = z.object({
  id: z.string(),
  kind: z.enum(INQUIRY_KINDS),
  title: z.string(),
  body: z.string(),
  order_no: z.string().nullable(),
  status: z.enum(INQUIRY_STATUSES),
  answer: z.string().nullable(),
  created_at: z.string(),
  answered_at: z.string().nullable(),
});

export function inquiryBaseFromRow(r: z.infer<typeof inquiryRowBase>): InquiryBase {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    orderNo: r.order_no,
    status: r.status,
    answer: r.answer,
    createdAt: r.created_at,
    answeredAt: r.answered_at,
  };
}
