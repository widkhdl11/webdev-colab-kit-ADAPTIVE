import { z } from "zod";
import { inquiryBaseFromRow, inquiryRowBase, type InquiryBase } from "./inquiry-row";

// 고객센터 「내 문의」가 읽는 줄 (admin-console INV-K11, 결정 d25). 쓴 사람 본인의 문의만 온다(DB 가 거른다).
// 꼴이 다른 줄이 하나라도 있으면 null.

export type MyInquiry = InquiryBase;

export function myInquiriesFromRows(rows: unknown): MyInquiry[] | null {
  const parsed = z.array(inquiryRowBase).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map(inquiryBaseFromRow);
}
