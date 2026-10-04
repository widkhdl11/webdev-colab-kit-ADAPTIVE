// 1:1 문의 분류 (결정 d25). DB 에는 코드로 저장하고 화면에는 라벨로 보인다.
// 코드 목록은 DB 의 check(public.inquiries.kind)와 같아야 한다 — 하나를 늘리면 둘 다 늘린다.

export const INQUIRY_KINDS = ["gift", "fee", "shipping", "creator", "account", "etc"] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];

export const INQUIRY_KIND_LABELS: Readonly<Record<InquiryKind, string>> = {
  gift: "선물 보내기",
  fee: "요금",
  shipping: "배송",
  creator: "크리에이터",
  account: "계정",
  etc: "기타",
};

export function isInquiryKind(value: unknown): value is InquiryKind {
  return typeof value === "string" && (INQUIRY_KINDS as readonly string[]).includes(value);
}
