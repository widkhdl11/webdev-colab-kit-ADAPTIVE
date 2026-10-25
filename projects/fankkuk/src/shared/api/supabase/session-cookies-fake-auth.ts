// 시험 전용: Supabase Auth 서버 대신 답하는 가짜 fetch. 라이브러리(@supabase/ssr)는 진짜를 그대로 쓰고
// 네트워크만 바꾼다 — 그래서 라이브러리가 쿠키를 어떤 옵션으로 쓰는지를 오프라인에서 본다.

export const UNIT_CONFIG = { url: "https://fkunit.supabase.co", anonKey: "unit-anon-key" };
/** 위 주소로 라이브러리가 짓는 로그인 쿠키 이름(조각이면 뒤에 .0 .1 이 붙는다). */
export const UNIT_AUTH_COOKIE = "sb-fkunit-auth-token";

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
  const payload = b64url(JSON.stringify({ sub: UNIT_USER.id, aud: "authenticated", role: "authenticated", exp: expSeconds }));
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

export function fakeAuthFetch() {
  const calls: string[] = [];
  const fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url.includes("/auth/v1/token")) return json(unitSession(3600, "unit-refresh-2"));
    if (url.includes("/auth/v1/user")) return json(UNIT_USER);
    if (url.includes("/auth/v1/logout")) return new Response(null, { status: 204 });
    return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}
