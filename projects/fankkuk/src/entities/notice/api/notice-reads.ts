import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Notice } from "../model/notice";

// 공지를 DB 읽기 함수(list_notices)로 읽는다. 응답은 신뢰 경계 밖이라 형식을 검사한다.
// 본문 링크는 사이트 안 주소나 https 주소만 받는다. 문자열 앞부분이 아니라 브라우저처럼 해석한 결과로 본다 —
// 「/\evil.com」은 「/」로 시작하지만 브라우저가 「//evil.com」(다른 사이트)으로 읽는다.
// 형식이 틀린 공지(허용하지 않는 링크 포함)는 그 글만 빼고 서버 기록에 남긴다 — 글 하나 때문에 메인·공지 화면이 통째로 실패하지 않게.

const BASE = "https://fankkuk.invalid";

export function isAllowedNoticeHref(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, BASE);
  } catch {
    return false;
  }
  if (url.origin === BASE) return href.startsWith("/");
  return (
    url.protocol === "https:" &&
    href.trim().toLowerCase().startsWith("https://")
  );
}

const hrefSchema = z.string().refine(isAllowedNoticeHref, "허용하지 않는 링크");

const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string() }),
  z.object({
    type: z.literal("text"),
    parts: z.array(
      z.union([z.string(), z.object({ label: z.string(), href: hrefSchema })]),
    ),
  }),
  z.object({ type: z.literal("signature"), text: z.string() }),
  z.object({ type: z.literal("list"), items: z.array(z.string()) }),
]);

const rowSchema = z.object({
  slug: z.string(),
  title: z.string(),
  published_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pinned: z.boolean(),
  body: z.array(blockSchema),
});

/** 고정 글이 먼저, 그다음 최신순(DB 가 정한 순서 그대로). */
export async function readNotices(
  client: Pick<SupabaseClient, "rpc">,
): Promise<Notice[]> {
  const { data, error } = await client.rpc("list_notices");
  if (error) throw new Error(`공지를 읽지 못했다: ${error.code}`);
  if (!Array.isArray(data)) throw new Error("공지 응답이 목록이 아니다");
  return data.flatMap((raw: unknown) => {
    const r = rowSchema.safeParse(raw);
    if (!r.success) {
      console.error(
        "형식이 틀린 공지를 뺐다",
        (raw as { slug?: unknown } | null)?.slug,
        r.error.issues[0]?.message,
      );
      return [];
    }
    return [
      {
        id: r.data.slug,
        title: r.data.title,
        date: r.data.published_on,
        pinned: r.data.pinned,
        body: r.data.body,
      },
    ];
  });
}
