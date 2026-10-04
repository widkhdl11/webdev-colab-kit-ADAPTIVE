import { z } from "zod";
import { charCount } from "@/shared/lib/validation/char-count";

// 보낼 수 없는 물품 한 줄 (admin-console INV-K9). 운영자가 관리자 화면에서 바꾸고, 크리에이터 페이지가 그대로 보여 준다.
// 이름 1~40자 · 설명 0~120자 — DB 가 저장할 때 지키는 조건과 같다. 다른 칸이 섞여 와도 화면까지 가지 않는다.

export const PROHIBITED_NAME_MAX = 40;
export const PROHIBITED_DESCRIPTION_MAX = 120;

export type ProhibitedItem = { id: string; name: string; description: string };

const rowShape = z.object({
  id: z.string().min(1),
  // 글자 수는 DB(char_length)와 같은 기준으로 센다 — 기준이 어긋나면 DB 가 받은 이름을 화면이 거부해 페이지 전체가 깨진다
  name: z.string().refine((s) => charCount(s) >= 1 && charCount(s) <= PROHIBITED_NAME_MAX),
  description: z.string().refine((s) => charCount(s) <= PROHIBITED_DESCRIPTION_MAX),
});

/** 모양이 다른 줄이 하나라도 있으면 실패(null) — 목록이 몰래 빠지면 보낼 수 없는 것을 보낼 수 있는 것처럼 보인다. */
export function prohibitedItemsFromRows(rows: unknown): ProhibitedItem[] | null {
  const shaped = z.array(rowShape).safeParse(rows);
  if (!shaped.success) return null;
  return shaped.data.map(({ id, name, description }) => ({ id, name, description }));
}
