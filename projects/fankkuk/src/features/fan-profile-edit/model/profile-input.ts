import { z } from "zod";
import { FAN_INTRO_MAX } from "@/entities/fan/model/fan-profile";
import { nicknameSchema } from "@/entities/session/model/nickname-rule";
import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR, LINE_BREAK } from "@/shared/lib/validation/hidden-char";

// INV-A12 입력 경계 — 앱 서버가 먼저 검사한다. DB 함수 update_my_fan_profile 이 같은 규칙으로 다시 검사하고,
// 금칙어·연락처 필터(태그·팬덤 이름과 같은 creator_tag_text_problem)와 닉네임 겹침은 DB 가 판정한다.
// 본문에서 소개·닉네임 두 칸만 꺼낸다(둘 다 고르는 칸 — 바뀐 칸만 온다). 계정 ID·사진 경로 칸은 있어도 읽지 않는다.
// 닉네임 규칙은 가입·내 정보와 같다(signup INV-U13 — nickname-rule). 글자 수는 DB 의 char_length 와 같게 코드 포인트로 센다.

export { FAN_INTRO_MAX };

/** 자기소개 — 앞뒤 공백을 뺀 0~100자 한 줄. */
export const introField = z
  .string()
  .trim()
  .refine((s) => charCount(s) <= FAN_INTRO_MAX, `자기소개는 ${FAN_INTRO_MAX}자까지 적을 수 있어요.`)
  .refine((s) => !HIDDEN_CHAR.test(s) && !LINE_BREAK.test(s), "자기소개에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요.");

export const profileInputSchema = z
  .object({ intro: introField.optional(), nickname: nicknameSchema.optional() })
  .refine((v) => v.intro !== undefined || v.nickname !== undefined, "바뀐 내용이 없어요.");

export type ProfileInput = z.infer<typeof profileInputSchema>;

/** 칸 오류가 어느 칸 것인가 — 소개·닉네임 밖이면 undefined. */
export type ProfileField = "intro" | "nickname";

export function profileFieldOf(path: readonly PropertyKey[] | undefined): ProfileField | undefined {
  const head = path?.[0];
  return head === "intro" || head === "nickname" ? head : undefined;
}
