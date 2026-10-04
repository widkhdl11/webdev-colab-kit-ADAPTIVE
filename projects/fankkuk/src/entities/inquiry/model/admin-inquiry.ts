import { z } from "zod";
import { inquiryBaseFromRow, inquiryRowBase, type InquiryBase } from "./inquiry-row";

// 관리자 「1:1 문의」 화면이 읽는 줄 (admin-console INV-K11·K8). 쓴 사람은 아이디·닉네임으로만 나온다.
// 꼴이 다른 줄이 하나라도 있으면 null.

export type AdminInquiry = InquiryBase & {
  authorLoginId: string;
  authorNickname: string;
  answeredByNickname: string | null;
};

const adminInquiryRow = inquiryRowBase.extend({
  author_login_id: z.string(),
  author_nickname: z.string(),
  answered_by_nickname: z.string().nullable(),
});

export function adminInquiriesFromRows(rows: unknown): AdminInquiry[] | null {
  const parsed = z.array(adminInquiryRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    ...inquiryBaseFromRow(r),
    authorLoginId: r.author_login_id,
    authorNickname: r.author_nickname,
    answeredByNickname: r.answered_by_nickname,
  }));
}
