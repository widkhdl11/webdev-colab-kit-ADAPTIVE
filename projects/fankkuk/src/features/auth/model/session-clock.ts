import type { SupabaseClient } from "@supabase/supabase-js";
import { currentSessionIds, type SessionActivity } from "@/entities/session/api/session-activity";
import { judgeSession } from "@/entities/session/model/session-lifetime";

// 운영자 화면의 「곧 로그아웃됩니다」에 쓰는 끝나는 시각 (docs/specs/session-login.md INV-L19). 화면은 서버가 준 시각으로만 센다.
// endsAt = 미사용 끝·절대 끝 중 이른 쪽, extendable = 미사용 끝이 먼저일 때만([연장] 은 절대 기간을 늘리지 않는다).

export type SessionClock = { endsAt: number; extendable: boolean; now: number };

/** 지금 클라이언트에 든 세션의 끝나는 시각. 로그인 안 함·끝남·읽기 실패는 null */
export async function readSessionClock(auth: Pick<SupabaseClient["auth"], "getSession">, activity: SessionActivity): Promise<SessionClock | null> {
  try {
    const ids = await currentSessionIds(auth);
    if (!ids) return null;
    const got = await activity.facts(ids.userId, ids.sessionId);
    if (!got) return null;
    const v = judgeSession(got.facts, got.now);
    return v.expired ? null : { endsAt: v.endsAt, extendable: v.extendable, now: got.now };
  } catch {
    return null;
  }
}

/** INV-L19 [연장]: 마지막 사용 시각을 지금으로 고친 뒤 새 끝나는 시각. 절대 끝은 그대로다. */
export async function extendSession(auth: Pick<SupabaseClient["auth"], "getSession">, activity: SessionActivity): Promise<SessionClock | null> {
  try {
    const ids = await currentSessionIds(auth);
    if (!ids || !(await activity.touch(ids.userId, ids.sessionId))) return null;
  } catch {
    return null;
  }
  return readSessionClock(auth, activity);
}
