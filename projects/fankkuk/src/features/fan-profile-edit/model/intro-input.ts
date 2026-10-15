import { z } from "zod";
import { FAN_INTRO_MAX } from "@/entities/fan/model/fan-profile";
import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR, LINE_BREAK } from "@/shared/lib/validation/hidden-char";

// INV-A12 입력 경계 — 앱 서버가 먼저 검사한다. DB 함수 update_my_fan_profile 이 같은 규칙으로 다시 검사하고,
// 금칙어·연락처 필터(태그·팬덤 이름과 같은 creator_tag_text_problem)는 DB 가 판정한다.
// 본문에서 소개 한 칸만 꺼낸다. 계정 ID·사진 경로 칸은 있어도 읽지 않는다.
// 글자 수는 DB 의 char_length 와 같게 코드 포인트로 센다(이모지 하나 = 한 글자).

export { FAN_INTRO_MAX };

export const introInputSchema = z.object({
  intro: z
    .string()
    .trim()
    .refine((s) => charCount(s) <= FAN_INTRO_MAX, `자기소개는 ${FAN_INTRO_MAX}자까지 적을 수 있어요.`)
    .refine((s) => !HIDDEN_CHAR.test(s) && !LINE_BREAK.test(s), "자기소개에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요."),
});

export type IntroInput = z.infer<typeof introInputSchema>;
