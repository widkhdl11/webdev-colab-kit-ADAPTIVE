import { z } from "zod";
import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR } from "@/shared/lib/validation/hidden-char";

// 닉네임 규칙(signup INV-U13 · my-account INV-A5) — 가입과 내 정보가 같은 규칙을 쓴다.
// 앞뒤 공백을 뺀 1~12자(코드 포인트로 센다 — DB char_length 와 같다), 줄바꿈·보이지 않는 글자 없음.
// 금칙어·연락처 필터와 겹침(영문 대소문자·앞뒤 공백 무시)은 DB 가 판정한다(nickname_problem · 유일 인덱스) — 여기서는 그 답을 문구로 바꾼다.

export const NICKNAME_MAX = 12;

const LENGTH_MESSAGE = `닉네임은 1~${NICKNAME_MAX}자로 적어 주세요.`;
const HIDDEN_MESSAGE = "닉네임에 줄바꿈이나 보이지 않는 글자는 쓸 수 없어요.";
const LINE_BREAK = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`);

export const NICKNAME_TAKEN = "이미 쓰는 닉네임이에요.";

/** 앞뒤 공백을 뺀 닉네임. 틀리면 화면 문구로 거부한다. */
export const nicknameSchema = z
  .string()
  .trim()
  .refine((s) => charCount(s) >= 1 && charCount(s) <= NICKNAME_MAX, LENGTH_MESSAGE)
  .refine((s) => !HIDDEN_CHAR.test(s) && !LINE_BREAK.test(s), HIDDEN_MESSAGE);

const FILTER_MESSAGES: Record<string, string> = {
  FKU05: "닉네임에 쓸 수 없는 말이 들어 있어요. 다른 닉네임을 적어 주세요.",
  FKU06: "닉네임에 전화번호·이메일·인터넷 주소는 쓸 수 없어요.",
  FKU07: "닉네임에 글자나 숫자를 하나 이상 넣어 주세요.",
};

/**
 * DB 가 닉네임 때문에 거부한 오류 코드 → 응답. 닉네임 사유가 아니면 null.
 * FKU04 = 이미 쓰는 닉네임(409) · FKU05~07 = 필터(400, 어느 금칙어인지는 말하지 않는다).
 */
export function nicknameRejection(code: string | undefined): { status: 400 | 409; message: string } | null {
  if (code === "FKU04") return { status: 409, message: NICKNAME_TAKEN };
  if (code !== undefined && Object.hasOwn(FILTER_MESSAGES, code)) return { status: 400, message: FILTER_MESSAGES[code]! };
  return null;
}
