import { z } from "zod";
import type { NoticeBlock } from "./notice";

// 관리자 「공지」 화면이 읽는 줄 (admin-console INV-K11·K8). 쓴 사람은 닉네임으로만, 쓴 사람이 기록되기 전의 옛 공지는 null.
// 관리자 화면은 본문을 고치기 칸에 글자로 넣을 뿐 링크를 그리지 않으므로 링크 주소 검사는 공개 읽기(notice-reads)에 맡긴다.

export type AdminNotice = {
  slug: string;
  title: string;
  pinned: boolean;
  publishedAt: string;
  authorNickname: string | null;
  body: NoticeBlock[];
};

const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string() }),
  z.object({ type: z.literal("text"), parts: z.array(z.union([z.string(), z.object({ label: z.string(), href: z.string() })])) }),
  z.object({ type: z.literal("signature"), text: z.string() }),
  z.object({ type: z.literal("list"), items: z.array(z.string()) }),
]);

const noticeRow = z.object({
  slug: z.string(),
  title: z.string(),
  pinned: z.boolean(),
  published_at: z.string(),
  author_nickname: z.string().nullable(),
  body: z.array(blockSchema),
});

export function adminNoticesFromRows(rows: unknown): AdminNotice[] | null {
  const parsed = z.array(noticeRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    slug: r.slug,
    title: r.title,
    pinned: r.pinned,
    publishedAt: r.published_at,
    authorNickname: r.author_nickname,
    body: r.body,
  }));
}

function blockText(block: NoticeBlock): string {
  switch (block.type) {
    case "text":
      return block.parts.map((p) => (typeof p === "string" ? p : p.label)).join("");
    case "list":
      return block.items.join("\n\n");
    case "heading":
    case "signature":
      return block.text;
  }
}

/** 고치기 칸에 넣을 글. 덩어리와 목록 항목을 모두 빈 줄로 잇는다 — 저장하면 DB 가 빈 줄로 문단을 나누므로 칸에 보이는 문단과 저장될 문단이 같다. 링크는 이름만 남는다. */
export function noticeBodyText(blocks: readonly NoticeBlock[]): string {
  return blocks
    .map(blockText)
    .filter((t) => t.trim() !== "")
    .join("\n\n");
}
