import { z } from "zod";
import { EMAIL_SHAPE } from "@/shared/lib/validation/email-shape";

// INV-A5 입력 경계 — 앱 서버가 먼저 검사한다. DB 함수 update_my_account 가 같은 규칙으로 다시 검사한다.
// 본문에서 이 네 칸만 꺼낸다. 사람 ID·아이디·역할·휴대폰 번호 칸은 있어도 읽지 않는다(INV-A3·A4).
// 글자 수는 DB 의 char_length 와 같게 코드 포인트로 센다(이모지 하나 = 한 글자).

const chars = (s: string) => [...s].length;

export const accountInputSchema = z.object({
  nickname: z
    .string()
    .trim()
    .refine((s) => chars(s) >= 1 && chars(s) <= 12, "닉네임은 1~12자로 적어 주세요."),
  email: z
    .string()
    .trim()
    .refine((s) => chars(s) <= 254 && EMAIL_SHAPE.test(s), "이메일 주소를 확인해 주세요."),
  notifyKakao: z.boolean(),
  notifyEmail: z.boolean(),
});

export type AccountInput = z.infer<typeof accountInputSchema>;
