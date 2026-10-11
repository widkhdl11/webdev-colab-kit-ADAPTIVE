import { z } from "zod";
import { normalizeXHandle, X_HANDLE_PATTERN } from "@/entities/gift-reply/model/reply";

// 답장 모음 보이기 · X 계정 · 태그 허용 입력 경계 (gift-reply INV-G8·G9). DB 저장 함수(update_my_reply_settings)가 같은 꼴로 다시 검사한다.
// X 계정은 앞뒤 공백과 맨 앞 「@」 하나를 떼고 영문·숫자·밑줄 1~15자(X 의 아이디 규칙). 비우면 등록 안 함 — 태그 허용도 끈다.
// 본문에서 정해진 칸만 꺼낸다. 크리에이터 ID 칸은 있어도 읽지 않는다.

export const replySettingsInputSchema = z
  .object({ wallVisible: z.boolean(), xHandle: z.string().max(40), xTagAllowed: z.boolean() })
  .transform((v) => {
    const xHandle = normalizeXHandle(v.xHandle);
    return { wallVisible: v.wallVisible, xHandle, xTagAllowed: xHandle !== null && v.xTagAllowed };
  })
  .refine((v) => v.xHandle === null || X_HANDLE_PATTERN.test(v.xHandle), "X 계정은 영문·숫자·밑줄 1~15자로 적어 주세요.");

export type ReplySettingsInput = z.input<typeof replySettingsInputSchema>;
