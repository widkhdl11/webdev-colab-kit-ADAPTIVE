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
  // 채널을 아직 만들지 않은 크리에이터는 닉네임이 없다(signup INV-U21) — 운영자 크리에이터 목록과 같은 「채널 없음」으로 보인다
  author_nickname: z.string().nullable(),
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
    authorNickname: r.author_nickname ?? "채널 없음",
    answeredByNickname: r.answered_by_nickname,
    authorRestricted: r.author_restricted,
    authorRestrictionReason: r.author_restriction_reason,
  }));
}
