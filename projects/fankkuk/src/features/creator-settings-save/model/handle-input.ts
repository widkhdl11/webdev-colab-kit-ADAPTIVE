import { z } from "zod";
import { HANDLE_MAX, HANDLE_MIN, isHandleShape, normalizeHandle } from "@/entities/creator/model/creator-handle";

// 링크용 아이디 입력 경계 (creator-link INV-E2). 앱 서버가 꼴을 먼저 보고, 예약어·본인 로그인 아이디·잠금·중복은 DB 함수가 본다.
// 본문에서 아이디 한 칸만 꺼낸다 — 크리에이터 ID 칸은 있어도 읽지 않는다(INV-E1).

export const handleInputSchema = z.object({
  handle: z
    .string()
    .transform(normalizeHandle)
    .refine(isHandleShape, `영문·숫자·밑줄(_)로 ${HANDLE_MIN}~${HANDLE_MAX}자를 적어 주세요.`),
});

export type HandleInput = z.input<typeof handleInputSchema>;
