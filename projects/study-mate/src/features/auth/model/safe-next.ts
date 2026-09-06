// 로그인 뒤 돌아갈 곳. 근거 스펙: docs/specs/auth-session.md — INV-A6
//
// 이 값은 **주소창에서 온다.** 그대로 믿고 보내면 로그인 화면이 남의 사이트로 사람을
// 실어 나르는 장치가 된다 — 주소는 우리 도메인이고 로그인도 진짜라서, 보내진 사람은
// 이상한 점을 못 느낀다.

import { HOME_PATH } from "@/entities/session/model/route-access";

/**
 * 눈에 안 보이는 글자(개행·탭·NUL 등)가 하나라도 섞였는가.
 *
 * C1 구역(U+0080~U+009F)도 본다. 유니코드가 제어문자로 분류하는 것이 C0 와 C1 둘인데
 * 처음에는 C0 만 봤다. 이 값은 헤더의 `Location` 에 실리고, 그 헤더를 latin-1 로 쓰는
 * 자리에서 C1 은 한 바이트 제어문자가 된다.
 */
function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
    if (code >= 0x80 && code <= 0x9f) return true;
  }
  return false;
}

/**
 * 이 사이트 안의 경로일 때만 그대로 쓴다. 아니면 홈으로 보낸다.
 *
 * 막는 것들:
 * - `https://evil.example` · `//evil.example` — 다른 출처
 * - `/\evil.example` — 브라우저가 `//` 로 읽는 모양
 * - `javascript:` · `data:` — 스킴이 붙은 값
 * - 개행·탭이 섞인 값 — 헤더에 실릴 때 잘리거나 이어붙는다
 */
export function safeNextPath(value: string | null | undefined): string {
  if (typeof value !== "string" || value === "") return HOME_PATH;

  // 제어문자가 하나라도 있으면 통째로 버린다. 지우고 쓰면 지운 결과가 또 다른 경로다.
  if (hasControlChar(value)) return HOME_PATH;

  // 반드시 슬래시 하나로 시작한다. 두 번째 글자가 `/` 나 `\` 면 다른 출처로 읽힌다.
  if (!value.startsWith("/")) return HOME_PATH;
  if (value.length > 1 && (value[1] === "/" || value[1] === "\\")) return HOME_PATH;

  return value;
}
