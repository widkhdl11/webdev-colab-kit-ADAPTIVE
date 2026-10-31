import type { SupabaseClient } from "@supabase/supabase-js";
import { currentSessionIds, type SessionActivity } from "@/entities/session/api/session-activity";
import { judgeSession, sessionCookieMaxAgeSeconds } from "@/entities/session/model/session-lifetime";
import { signOut } from "./sign-out";

// 요청마다 로그인 유지 기간 판정 (docs/specs/session-login.md INV-L16·L17). 요청마다 갱신하는 자리(proxy)가 부른다.
// 사람은 부르는 쪽이 INV-L2 로 확인한 ID, 세션은 그 토큰의 session_id. 기간을 넘었거나 세션이 이미 끝났으면
// Auth 로그아웃(이 기기 세션) + DB 세션 끝을 하고 「끝남」을 돌려준다.
// byLifetime: 기간으로 끝낸 때만 true — 로그인 화면 안내(reason=session)는 이때만 붙는다. 다른 이유로 이미 끝난 세션(비밀번호 바꾸기·직접 로그아웃)은 false.
// linkHint: 기간으로 끝난 사람이 크리에이터이고 승인 요청 로그인 링크 템플릿이 등록돼 있을 때 — 알림톡 안내 줄 표시(쿠키로만 넘긴다, INV-L17).

export type SessionGuardResult =
  /** 기간 안 — 「유지」 켬 쿠키 유효기간(초, 그 역할의 절대 기간) */
  | { kind: "ok"; maxAge: number }
  | { kind: "ended"; byLifetime: boolean; linkHint: boolean }
  /** 판정 재료를 못 읽음 — 부르는 쪽이 주소에 따라 닫거나 통과시킨다. cause 는 오류 기록용(토큰·ID 원문 없음) */
  | { kind: "unknown"; cause: "no_session_id" | "facts_failed" };

export type SessionGuardDeps = {
  auth: Pick<SupabaseClient["auth"], "getSession" | "signOut">;
  /** 판정 재료·마지막 사용·끝내기·링크 템플릿 등록 여부(기간으로 끝난 크리에이터에게만 묻는다) */
  activity: SessionActivity;
};

export async function guardSession(deps: SessionGuardDeps, userId: string, opts: { countsAsUse: boolean }): Promise<SessionGuardResult> {
  let ids: { userId: string; sessionId: string } | null;
  try {
    ids = await currentSessionIds(deps.auth);
  } catch {
    return { kind: "unknown", cause: "no_session_id" };
  }
  if (!ids) return { kind: "unknown", cause: "no_session_id" };
  // 확인된 사람과 토큰의 사람이 다르면 판정하지 않는다(그럴 일은 없다 — 넓게 열지 않게 끝낸다). 기간으로 끝낸 것이 아니라 안내는 없다
  if (ids.userId !== userId) return end(deps, ids, { byLifetime: false, linkHint: false });

  let got: Awaited<ReturnType<SessionActivity["facts"]>>;
  try {
    got = await deps.activity.facts(ids.userId, ids.sessionId);
  } catch {
    return { kind: "unknown", cause: "facts_failed" };
  }
  // 세션이 이미 끝났다(비밀번호 바꾸기로 다른 세션이 끝남·DB 에서 끝냄) — 기간으로 끝낸 것이 아니라 안내는 없다
  if (!got) return end(deps, ids, { byLifetime: false, linkHint: false });
  const verdict = judgeSession(got.facts, got.now);
  if (verdict.expired) {
    let linkHint = false;
    if (got.facts.role === "creator") {
      try {
        linkHint = await deps.activity.loginLinkReady();
      } catch {
        linkHint = false;
      }
    }
    return end(deps, ids, { byLifetime: true, linkHint });
  }
  if (verdict.touch && opts.countsAsUse) {
    try {
      await deps.activity.touch(ids.userId, ids.sessionId);
    } catch {
      // 다음 요청이 다시 고친다 — 판정은 최대 1분 늦을 뿐이다
    }
  }
  return { kind: "ok", maxAge: sessionCookieMaxAgeSeconds(verdict.cls) };
}

async function end(deps: SessionGuardDeps, ids: { userId: string; sessionId: string }, how: { byLifetime: boolean; linkHint: boolean }): Promise<SessionGuardResult> {
  try {
    await signOut(deps.auth);
  } catch {
    // 라이브러리는 Auth 오류여도 이 기기의 쿠키를 지운다 — DB 쪽 끝내기가 남는다
  }
  try {
    await deps.activity.end(ids.userId, ids.sessionId);
  } catch {
    // Auth 로그아웃이 이미 갱신 토큰을 폐기했다
  }
  return { kind: "ended", ...how };
}
