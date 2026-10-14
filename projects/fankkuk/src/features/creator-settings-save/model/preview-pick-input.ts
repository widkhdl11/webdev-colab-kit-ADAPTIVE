import { z } from "zod";

// 링크 미리보기 이미지 고르기 입력 경계 (creator-link INV-E1·E10, 「내 팬꾹 꾸미기」). 본문에서 고르기 한 칸만 꺼낸다 —
// 크리에이터 ID 칸은 있어도 읽지 않는다. 심볼이 있는지는 DB 함수가 본다.

export const previewPickInputSchema = z.object({ pick: z.enum(["photo", "symbol"]) });

export type PreviewPickInput = z.input<typeof previewPickInputSchema>;
