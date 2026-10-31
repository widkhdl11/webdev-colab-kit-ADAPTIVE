// 시험 전용: Supabase Auth 서버 대신 답하는 가짜 fetch. 라이브러리(@supabase/ssr)는 진짜를 그대로 쓰고
// 네트워크만 바꾼다 — 그래서 라이브러리가 쿠키를 어떤 옵션으로 쓰는지를 오프라인에서 본다.

export const UNIT_CONFIG = { url: "https://fkunit.supabase.co", anonKey: "unit-anon-key" };
/** 위 주소로 라이브러리가 짓는 로그인 쿠키 이름(조각이면 뒤에 .0 .1 이 붙는다). */
export const UNIT_AUTH_COOKIE = "sb-fkunit-auth-token";

/** 가짜 토큰에 든 세션 id(접근 토큰의 session_id) */
export const UNIT_SESSION_ID = "99999999-8888-4777-8666-555555555555";

export const UNIT_USER = {
  id: "11111111-2222-4333-8444-555555555555",
  aud: "authenticated",
  role: "authenticated",
  email: "fan@login.fankkuk.invalid",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-10-01T00:00:00.000Z",
};

const b64url = (s: string) => Buffer.from(s).toString("base64url");

function accessToken(expSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: UNIT_USER.id, aud: "authenticated", role: "authenticated", exp: expSeconds, session_id: UNIT_SESSION_ID }));
  return `${header}.${payload}.unit-signature`;
}

/** 라이브러리가 쿠키에 담는 세션 꼴. expiresInSeconds 가 음수면 이미 만료된 세션. */
export function unitSession(expiresInSeconds: number, refreshToken = "unit-refresh-1") {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: accessToken(now + expiresInSeconds),
    token_type: "bearer",
    expires_in: expiresInSeconds,
    expires_at: now + expiresInSeconds,
    refresh_token: refreshToken,
    user: UNIT_USER,
  };
}

/** 쿠키 값으로 그대로 넣을 수 있는 세션(라이브러리의 base64url 꼴). */
export function unitSessionCookieValue(expiresInSeconds: number): string {
  return `base64-${b64url(JSON.stringify(unitSession(expiresInSeconds)))}`;
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/**
 * passwordOk false: 비밀번호 로그인(grant_type=password)만 Auth 처럼 400 invalid_credentials 로 답한다. 토큰 갱신은 그대로 성공.
 * passwordDelayMs: 비밀번호 로그인 답을 그만큼 늦게 준다 — 시작 때 건 토큰 갱신의 쿠키 쓰기가 응답 전에 끝나는 경우를 만든다.
 */
export function fakeAuthFetch(opts: { passwordOk?: boolean; passwordDelayMs?: number } = {}) {
  const passwordOk = opts.passwordOk !== false;
  const passwordDelayMs = opts.passwordDelayMs ?? 0;
  const calls: string[] = [];
  const fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (passwordDelayMs > 0 && url.includes("grant_type=password")) await new Promise((r) => setTimeout(r, passwordDelayMs));
    if (!passwordOk && url.includes("/auth/v1/token") && url.includes("grant_type=password")) {
      return new Response(JSON.stringify({ code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/auth/v1/token")) return json(unitSession(3600, "unit-refresh-2"));
    if (url.includes("/auth/v1/user")) return json(UNIT_USER);
    if (url.includes("/auth/v1/logout")) return new Response(null, { status: 204 });
    return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}
