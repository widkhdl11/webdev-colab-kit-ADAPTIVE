import { z } from "zod";

// 관리자 「1:1 문의」 화면이 읽는 줄 (admin-console INV-K11·K8). 쓴 사람은 아이디·닉네임으로만 나온다.
// 꼴이 다른 줄이 하나라도 있으면 null.

export const INQUIRY_STATUSES = ["open", "answered"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export type AdminInquiry = {
  id: string;
  title: string;
  body: string;
  status: InquiryStatus;
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
  authorLoginId: string;
  authorNickname: string;
  answeredByNickname: string | null;
};

const inquiryRow = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.enum(INQUIRY_STATUSES),
  answer: z.string().nullable(),
  created_at: z.string(),
  answered_at: z.string().nullable(),
  author_login_id: z.string(),
  author_nickname: z.string(),
  answered_by_nickname: z.string().nullable(),
});

export function adminInquiriesFromRows(rows: unknown): AdminInquiry[] | null {
  const parsed = z.array(inquiryRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    status: r.status,
    answer: r.answer,
    createdAt: r.created_at,
    answeredAt: r.answered_at,
    authorLoginId: r.author_login_id,
    authorNickname: r.author_nickname,
    answeredByNickname: r.answered_by_nickname,
  }));
}
