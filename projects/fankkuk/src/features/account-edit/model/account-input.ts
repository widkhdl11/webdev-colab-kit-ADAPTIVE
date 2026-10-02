import { z } from "zod";

// INV-A5 입력 경계 — 앱 서버가 먼저 검사한다. DB 함수 update_my_account 가 같은 규칙으로 다시 검사한다.
// 본문에서 이 네 칸만 꺼낸다. 사람 ID·아이디·역할·휴대폰 번호 칸은 있어도 읽지 않는다(INV-A3·A4).
// 글자 수는 DB 의 char_length 와 같게 코드 포인트로 센다(이모지 하나 = 한 글자).

// 이메일은 허용 문자 목록으로 본다 — 쉼표·꺾쇠가 든 주소는 메일 라이브러리가 「이름 <주소>」나 여러 주소로 읽어
// 저장한 값과 다른 곳으로 메일이 갈 수 있다(2026-10-02 security-reviewer). DB 검사식과 같은 식이다.

const chars = (s: string) => [...s].length;
export const EMAIL_SHAPE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

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
