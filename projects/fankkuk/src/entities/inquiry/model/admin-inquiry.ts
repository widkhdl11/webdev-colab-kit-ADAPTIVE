import { z } from "zod";
import { inquiryBaseFromRow, inquiryRowBase, type InquiryBase } from "./inquiry-row";

// 관리자 「1:1 문의」 화면이 읽는 줄 (admin-console INV-K11·K8·K12). 쓴 사람은 아이디·닉네임으로만 나오고,
// 그 사람이 지금 문의 제한 중인지와 사유가 함께 온다.
// 꼴이 다른 줄이 하나라도 있으면 null.

export type AdminInquiry = InquiryBase & {
  authorLoginId: string;
  authorNickname: string;
  answeredByNickname: string | null;
  authorRestricted: boolean;
  authorRestrictionReason: string | null;
};

const adminInquiryRow = inquiryRowBase.extend({
  author_login_id: z.string(),
  author_nickname: z.string(),
  answered_by_nickname: z.string().nullable(),
  author_restricted: z.boolean(),
  author_restriction_reason: z.string().nullable(),
});

export function adminInquiriesFromRows(rows: unknown): AdminInquiry[] | null {
  const parsed = z.array(adminInquiryRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    ...inquiryBaseFromRow(r),
    authorLoginId: r.author_login_id,
    authorNickname: r.author_nickname,
    answeredByNickname: r.answered_by_nickname,
    authorRestricted: r.author_restricted,
    authorRestrictionReason: r.author_restriction_reason,
  }));
}
