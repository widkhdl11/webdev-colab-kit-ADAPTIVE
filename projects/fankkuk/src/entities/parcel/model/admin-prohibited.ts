import { z } from "zod";

// 관리자 「보낼 수 없는 물품」 화면이 읽는 줄 (admin-console INV-K9·K8). 공개 목록(prohibited-item.ts)과 따로 둔다 —
// 관리자 줄에는 바뀐 시각이 붙고, 바꾼 기록에는 사람이 닉네임으로만 나온다.
// DB 읽기 함수가 준 줄에서 정해진 칸만 옮긴다. 꼴이 다른 줄이 하나라도 있으면 null — 기록이 몰래 빠지지 않게.

export type AdminProhibitedItem = { id: string; name: string; description: string; updatedAt: string };

export const PROHIBITED_CHANGE_ACTIONS = ["add", "edit", "delete"] as const;
export type ProhibitedChangeAction = (typeof PROHIBITED_CHANGE_ACTIONS)[number];

export type ProhibitedChange = {
  at: string;
  byNickname: string;
  action: ProhibitedChangeAction;
  nameBefore: string | null;
  nameAfter: string | null;
  descriptionBefore: string | null;
  descriptionAfter: string | null;
};

const itemRow = z.object({ id: z.string(), name: z.string(), description: z.string(), updated_at: z.string() });

const changeRow = z.object({
  at: z.string(),
  changed_by_nickname: z.string(),
  action: z.enum(PROHIBITED_CHANGE_ACTIONS),
  name_before: z.string().nullable(),
  name_after: z.string().nullable(),
  description_before: z.string().nullable(),
  description_after: z.string().nullable(),
});

export function adminProhibitedItemsFromRows(rows: unknown): AdminProhibitedItem[] | null {
  const parsed = z.array(itemRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({ id: r.id, name: r.name, description: r.description, updatedAt: r.updated_at }));
}

export function prohibitedChangesFromRows(rows: unknown): ProhibitedChange[] | null {
  const parsed = z.array(changeRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    at: r.at,
    byNickname: r.changed_by_nickname,
    action: r.action,
    nameBefore: r.name_before,
    nameAfter: r.name_after,
    descriptionBefore: r.description_before,
    descriptionAfter: r.description_after,
  }));
}

/** 기록 한 줄을 사람 말로: 「X」 추가 · 「전」→「후」 고침 · 「X」 설명을 고침 · 「X」 지움 */
export function describeProhibitedChange(c: ProhibitedChange): string {
  if (c.action === "add") return `「${c.nameAfter ?? ""}」 추가`;
  if (c.action === "delete") return `「${c.nameBefore ?? ""}」 지움`;
  const before = c.nameBefore ?? "";
  const after = c.nameAfter ?? before;
  if (before !== after) return `「${before}」→「${after}」 고침`;
  if (c.descriptionBefore !== c.descriptionAfter) return `「${after}」 설명을 고침`;
  return `「${after}」 고침`;
}
