// 세션 판독기를 서버용 Supabase 클라이언트에 묶어 하나만 내보낸다.
// require-session.ts 가 "① 검증하지 않는 판독기를 끼울 수 있다"고 적어 둔 자리를 닫는 쪽이다 —
// 부르는 쪽이 판독기를 고를 수 없으면 잘못된 판독기를 끼울 수도 없다.

import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readVerifiedUser, type VerifiedUser } from "../model/verified-user";

let warnedMissingConfig = false;

/**
 * 지금 요청의 사용자. 검증된 클레임으로만 판정한다 (INV-A3).
 *
 * 설정이 없으면 비로그인으로 본다 — 인가 판정에서는 이쪽이 안전한 방향이다.
 * 데이터를 읽는 클라이언트는 반대로 던진다(server-client.ts 의 주석 참고).
 */
export async function currentUser(): Promise<VerifiedUser | null> {
  try {
    const supabase = await createServerSupabase();
    return await readVerifiedUser(supabase.auth);
  } catch (cause) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn("[session] 세션을 읽지 못해 비로그인으로 처리한다", cause);
    }
    return null;
  }
}
