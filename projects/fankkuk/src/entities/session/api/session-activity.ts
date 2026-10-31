import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { lifetimeClassOf, sessionCookieMaxAgeSeconds, type SessionFacts } from "../model/session-lifetime";

// 세션별 마지막 사용 시각과 판정 재료 (docs/specs/session-login.md INV-L16·L19). 서버 전용 키(관리자 클라이언트)로만 부른다.
// 사람 ID 는 부르는 쪽이 로그인 토큰으로 확인한 값(INV-L2)이고, 세션 id 는 그 토큰의 session_id 다. DB 가 그 세션이 그 사람의 것인지 다시 본다.

export type SessionActivity = {
  /** 판정 재료와 DB 지금 시각. 세션이 끝났거나 남의 세션이면 null. DB 오류는 던진다. */
  facts(userId: string, sessionId: string): Promise<{ facts: SessionFacts; now: number } | null>;
  /** 마지막 사용 시각을 지금으로. 그 사람의 살아 있는 세션이면 true */
  touch(userId: string, sessionId: string): Promise<boolean>;
  /** 그 세션을 DB 에서 끝낸다(Auth 세션 줄·마지막 사용 줄) */
  end(userId: string, sessionId: string): Promise<void>;
  /** 승인 요청 로그인 링크 템플릿이 등록돼 있는가(link-login, session-login INV-L17) */
  loginLinkReady(): Promise<boolean>;
};

const factsRow = z.object({
  role: z.string().nullable(),
  is_owner: z.boolean(),
  created_at: z.string(),
  last_seen_at: z.string().nullable(),
  db_now: z.string(),
});

export function sessionActivityOf(admin: Pick<SupabaseClient, "rpc">): SessionActivity {
  return {
    async facts(userId, sessionId) {
      const { data, error } = await admin.rpc("session_lifetime_facts", { p_user_id: userId, p_session_id: sessionId });
      if (error) throw new Error(`세션 판정 재료를 읽지 못했다: ${error.code}`);
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return null;
      const r = factsRow.parse(row);
      return {
        facts: { role: r.role, isOwner: r.is_owner, createdAt: Date.parse(r.created_at), lastSeenAt: r.last_seen_at === null ? null : Date.parse(r.last_seen_at) },
        now: Date.parse(r.db_now),
      };
    },
    async touch(userId, sessionId) {
      const { data, error } = await admin.rpc("session_touch", { p_user_id: userId, p_session_id: sessionId });
      if (error) throw new Error(`마지막 사용 시각을 고치지 못했다: ${error.code}`);
      return data === true;
    },
    async end(userId, sessionId) {
      const { error } = await admin.rpc("session_end", { p_user_id: userId, p_session_id: sessionId });
      if (error) throw new Error(`세션을 끝내지 못했다: ${error.code}`);
    },
    async loginLinkReady() {
      const { data, error } = await admin.rpc("login_link_template_ready");
      if (error) throw new Error(`로그인 링크 템플릿 등록 여부를 읽지 못했다: ${error.code}`);
      return data === true;
    },
  };
}

/** 접근 토큰(JWT) 본문의 session_id. 서명 확인은 하지 않는다 — 부르는 쪽이 그 토큰을 Auth 로 확인한 뒤에만 쓰고, DB 가 사람과 세션을 다시 맞춰 본다. */
export function sessionIdOfAccessToken(accessToken: string | undefined | null): string | null {
  const payload = accessToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof claims.session_id === "string" && /^[0-9a-f-]{36}$/i.test(claims.session_id) ? claims.session_id : null;
  } catch {
    return null;
  }
}

/** 지금 클라이언트에 든 세션의 사람·세션 id. 없으면 null */
export async function currentSessionIds(auth: Pick<SupabaseClient["auth"], "getSession">): Promise<{ userId: string; sessionId: string } | null> {
  const { data } = await auth.getSession();
  const token = data.session?.access_token;
  const sessionId = sessionIdOfAccessToken(token);
  const sub = sessionId ? subjectOfAccessToken(token) : null;
  return sessionId && sub ? { userId: sub, sessionId } : null;
}

function subjectOfAccessToken(accessToken: string | undefined): string | null {
  const payload = accessToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

/**
 * INV-L15·L16: 지금 클라이언트에 든 세션의 「유지」 켬 쿠키 유효기간(초) — 그 역할의 절대 기간. 세션·역할을 모르면 undefined(만료 없는 쿠키로 쓴다).
 * 쿠키를 어떻게 쓸지만 정한다 — 누가 로그인했는지 판정에는 쓰지 않는다.
 */
export async function sessionCookieMaxAgeFor(auth: Pick<SupabaseClient["auth"], "getSession">, activity: SessionActivity): Promise<number | undefined> {
  try {
    const ids = await currentSessionIds(auth);
    if (!ids) return undefined;
    const got = await activity.facts(ids.userId, ids.sessionId);
    return got ? sessionCookieMaxAgeSeconds(lifetimeClassOf(got.facts)) : undefined;
  } catch {
    return undefined;
  }
}
