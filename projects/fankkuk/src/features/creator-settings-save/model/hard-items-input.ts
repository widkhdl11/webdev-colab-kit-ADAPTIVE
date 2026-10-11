import { z } from "zod";
import { HARD_ACTIONS, HARD_PERIODS, HARD_REASONS } from "@/entities/gift-item/model/hard-items";
import { ITEM_CATEGORIES } from "@/entities/gift-item/model/item-category";

// 받기 어려운 품목 입력 경계 (hard-items INV-H3·H4). 고르는 값 넷뿐이다 — 문장을 받는 칸이 없다.
// 앱 서버가 먼저 꼴을 보고, DB 저장 함수가 같은 목록으로 다시 검사한다. 품목이 비면 설정을 지운다(해제).
// 본문에서 정해진 칸만 꺼낸다. 크리에이터 ID·계정 ID 칸은 있어도 읽지 않는다.

export const hardItemsInputSchema = z.object({
  categories: z
    .array(z.enum(ITEM_CATEGORIES))
    .max(ITEM_CATEGORIES.length)
    .refine((list) => new Set(list).size === list.length, "같은 품목을 두 번 고를 수 없어요."),
  reason: z.enum(HARD_REASONS),
  period: z.enum(HARD_PERIODS),
  action: z.enum(HARD_ACTIONS),
});

export type HardItemsInput = z.infer<typeof hardItemsInputSchema>;
