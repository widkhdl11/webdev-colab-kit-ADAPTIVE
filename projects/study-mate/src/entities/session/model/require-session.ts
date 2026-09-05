// 서버 액션은 시작할 때 세션을 확인하고, 없으면 아무 일도 하지 않고 실패를 반환한다.
// 근거: docs/specs/auth-session.md — INV-A4 (시나리오 S2)

import type { ActionResult } from "@/shared/lib/action-result";
import type { VerifiedUser } from "./verified-user";

export const NO_SESSION_MESSAGE = "유저 정보를 찾을 수 없습니다";

/**
 * 액션 본체를 세션 확인 뒤로 감춘다.
 *
 * 본체는 검증된 사용자를 첫 인자로 받는다 — 그래서 액션 안에서 "세션 확인을 깜빡하는 것"이
 * 일어날 수 없다.
 *
 * **막지 못하는 것 두 가지를 밝혀 둔다.**
 * ① 판독기(`readUser`)를 호출자가 주입한다. 검증하지 않는 판독기를 끼우면 `VerifiedUser` 는
 *    타입 검사를 그대로 통과한다. 서버용 Supabase 클라이언트가 생기면 판독기를 묶은 것
 *    하나만 공개해서 이 자리를 닫는다.
 * ② 액션이 이 가드를 아예 안 거치는 것은 여기서 막을 방법이 없다. 지금은 그것을 잡는
 *    검사가 없다(하네스 백로그에 있다).
 */
export function requireSession<A extends readonly unknown[], T>(
  readUser: () => Promise<VerifiedUser | null>,
  action: (user: VerifiedUser, ...args: A) => Promise<ActionResult<T>>,
): (...args: A) => Promise<ActionResult<T>> {
  return async (...args: A) => {
    let user: VerifiedUser | null;
    try {
      user = await readUser();
    } catch {
      // 스펙은 "실패를 반환한다"고 적었다. 판독기가 던지면 그건 반환이 아니라 예외라
      // 계약이 깨진다 — 예외를 실패로 바꾸는 자리를 가드 한 곳으로 모은다.
      user = null;
    }
    if (user === null) return { ok: false, message: NO_SESSION_MESSAGE };
    return action(user, ...args);
  };
}
