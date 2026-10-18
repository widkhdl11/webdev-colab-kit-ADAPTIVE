import { z } from "zod";
import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR } from "@/shared/lib/validation/hidden-char";
import { FAN_NAME_MAX } from "@/entities/creator/model/fan-name";
import { isThemeColor } from "@/entities/creator/model/creator-color";

/**
 * 테마 색(저장 칸 이름은 퍼스널 컬러, creator-link INV-E13) — 빈 문자열이면 기본 모양으로 되돌리기, 아니면 파스텔 8색 가운데 하나(대소문자 무관)를 대문자로.
 * 8색 밖의 값(남색 같은 진한 색·이름 색·짧은 값·스타일 문장)은 거부한다. DB 함수와 DB 제약이 같은 8색 목록으로 다시 검사한다.
 */
const themeColorInput = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => s === "" || isThemeColor(s), "테마 색은 보기의 8색 가운데 하나를 골라 주세요.");

// 크리에이터 설정 입력 경계 — 앱 서버가 먼저 검사한다(my-account INV-A9·A11). DB 함수가 같은 규칙으로 다시 검사한다.
// 본문에서 정해진 칸만 꺼낸다. 크리에이터 ID·채널·본인 확인·계정 ID 칸은 있어도 읽지 않는다.
// 글자 수는 DB 의 char_length 와 같게 코드 포인트로 센다(이모지 하나 = 한 글자). 화면의 글자 수 세기·입력 막기도 같은 charCount 를 쓴다.
// 앞뒤 공백은 String.prototype.trim 범위(탭·줄바꿈·전각 공백 포함)로 뺀다 — DB 함수도 같은 범위를 뺀다(20261006000018).

/** 앞 공백을 뺀 값이 max 자를 넘으면 max 자까지만 남긴다. 넘지 않으면 그대로(입력 중인 앞뒤 공백을 지우지 않는다). */
export function clipChars(s: string, max: number): string {
  if (charCount(s.trim()) <= max) return s;
  return [...s.trimStart()].slice(0, max).join("");
}

/** 한 줄 칸(한 줄 소개·팬을 부르는 이름)에 붙여 넣은 줄바꿈을 띄어쓰기로 바꾼다(creator-link INV-E6). 입력하는 동안 화면이 부른다. */
export function oneLine(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, " ");
}

/** 공개 이름에 둘 수 없는 글자(제어 문자·보이지 않는 글자). DB 함수(update_my_creator_profile)도 같은 목록으로 거부한다. */
export { HIDDEN_CHAR };

export const PUBLIC_NAME_MAX = 20;
/** 한 줄 소개 — 40자, 줄바꿈 없음(creator-link INV-E6). DB 함수가 같은 길이와 태그 필터로 다시 검사한다. */
export const INTRO_MAX = 40;
/** 팬을 부르는 이름 — 선택, 10자, 줄바꿈 없음(추가분 4-1). 금칙어·연락처 꼴은 DB 가 한 줄 소개와 같은 필터로 다시 본다. */
export { FAN_NAME_MAX };

// 다섯 칸 모두 없어도 된다 — 없는 칸은 DB 가 지금 값 그대로 둔다. 화면은 자기가 고치는 칸만 보낸다
// (「내 팬꾹 꾸미기」 = 공개 이름·한 줄 소개·팬을 부르는 이름, 「주소와 설정」 = 찾기 노출). 보낸 칸 가운데 하나라도 틀리면 아무 칸도 바꾸지 않는다(INV-A9).
export const profileInputSchema = z.object({
  name: z
    .string()
    .trim()
    .refine((s) => charCount(s) >= 1 && charCount(s) <= PUBLIC_NAME_MAX, `공개 이름은 1~${PUBLIC_NAME_MAX}자로 적어 주세요.`)
    .refine((s) => !HIDDEN_CHAR.test(s), "공개 이름에 보이지 않는 글자나 줄바꿈은 쓸 수 없어요.")
    .optional(),
  intro: z
    .string()
    .trim()
    .refine((s) => charCount(s) <= INTRO_MAX, `한 줄 소개는 ${INTRO_MAX}자까지 적을 수 있어요.`)
    .refine((s) => !HIDDEN_CHAR.test(s) && !/[\u2028\u2029]/.test(s), "한 줄 소개에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요.")
    .optional(),
  searchable: z.boolean().optional(),
  // 빈 문자열이면 지운다
  fanName: z
    .string()
    .trim()
    .refine((s) => charCount(s) <= FAN_NAME_MAX, `팬을 부르는 이름은 ${FAN_NAME_MAX}자까지 적을 수 있어요.`)
    .refine((s) => !HIDDEN_CHAR.test(s) && !/[\u2028\u2029]/.test(s), "팬을 부르는 이름에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요.")
    .optional(),
  // 테마 색(INV-E13) — 보내지 않으면 그대로, 빈 값이면 기본 모양. 팬컬러·글자색 칸은 없다 — 본문에 있어도 읽지 않는다(INV-E13·E14)
  personalColor: themeColorInput.optional(),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export const notifyInputSchema = z.object({ kakao: z.boolean(), email: z.boolean() });

export type NotifyInput = z.infer<typeof notifyInputSchema>;
