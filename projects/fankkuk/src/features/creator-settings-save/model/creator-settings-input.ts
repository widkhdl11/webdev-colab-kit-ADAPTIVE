import { z } from "zod";

// 크리에이터 설정 입력 경계 — 앱 서버가 먼저 검사한다(my-account INV-A9·A11). DB 함수가 같은 규칙으로 다시 검사한다.
// 본문에서 정해진 칸만 꺼낸다. 크리에이터 ID·채널·본인 확인·계정 ID 칸은 있어도 읽지 않는다.
// 글자 수는 DB 의 char_length 와 같게 코드 포인트로 센다(이모지 하나 = 한 글자). 화면의 글자 수 세기·입력 막기도 이 함수를 쓴다.
// 앞뒤 공백은 String.prototype.trim 범위(탭·줄바꿈·전각 공백 포함)로 뺀다 — DB 함수도 같은 범위를 뺀다(20261006000018).

/** 코드 포인트 수 — DB char_length 와 같다. maxLength(UTF-16 단위)와 달리 이모지 하나를 한 글자로 센다. */
export const countChars = (s: string): number => [...s].length;

/** 앞 공백을 뺀 값이 max 자를 넘으면 max 자까지만 남긴다. 넘지 않으면 그대로(입력 중인 앞뒤 공백을 지우지 않는다). */
export function clipChars(s: string, max: number): string {
  if (countChars(s.trim()) <= max) return s;
  return [...s.trimStart()].slice(0, max).join("");
}

/**
 * 공개 이름에 둘 수 없는 글자 — 제어 문자(C0·C1)와 보이지 않는 서식 문자(소프트 하이픈, 제로폭 공백·접합자, 좌우 방향 표시·덮어쓰기,
 * 단어 결합자, BOM), 한글 채움 문자. 빈 이름처럼 보이거나 다른 크리에이터 이름과 똑같아 보이는 이름을 만들 수 있다.
 * DB 함수(update_my_creator_profile)도 같은 목록으로 거부한다.
 */
export const HIDDEN_CHAR = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u3164\ufeff\uffa0\ufff9-\ufffb]/u;

export const PUBLIC_NAME_MAX = 20;
export const INTRO_MAX = 200;

export const profileInputSchema = z.object({
  name: z
    .string()
    .trim()
    .refine((s) => countChars(s) >= 1 && countChars(s) <= PUBLIC_NAME_MAX, `공개 이름은 1~${PUBLIC_NAME_MAX}자로 적어 주세요.`)
    .refine((s) => !HIDDEN_CHAR.test(s), "공개 이름에 보이지 않는 글자나 줄바꿈은 쓸 수 없어요."),
  intro: z
    .string()
    .trim()
    .refine((s) => countChars(s) <= INTRO_MAX, `소개글은 ${INTRO_MAX}자까지 적을 수 있어요.`),
  searchable: z.boolean(),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export const notifyInputSchema = z.object({ kakao: z.boolean(), email: z.boolean() });

export type NotifyInput = z.infer<typeof notifyInputSchema>;
