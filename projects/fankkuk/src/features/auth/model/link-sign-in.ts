import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoginLinks } from "@/entities/session/api/login-links";
import { isTestAccountEmail } from "@/entities/session/model/login-id";
import { loginLinkHashPrefix, loginLinkTokenHash, readLoginLinkToken } from "@/entities/session/model/login-link";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";
import { signOut } from "./sign-out";

// 알림톡 로그인 링크의 토큰으로 로그인 (docs/specs/link-login.md INV-K2·K4·K5).
// ① 토큰 해시를 DB 함수로 쓴다 — 한 번만·만료 전만(INV-K2). 원문은 DB 에 넘기지 않는다.
// ② 쓰였으면 그 계정의 로그인 주소로 Auth 가 1회용 로그인 값(magiclink 의 hashed_token)을 만들게 하고 — 메일은 보내지 않는다(관리자 링크 만들기) —
// ③ 요청 세션 클라이언트가 그 값을 확인해 로그인 쿠키를 쓴다(session-login INV-L1).
// 이미 로그인해 있으면 링크로 계정을 바꾸지 않는다(카드 fankkuk-20261031-1-d1): 토큰의 계정과 같거나 토큰을 쓸 수 없으면 그 로그인 그대로(kept),
// 다르면 지금 세션을 끝내고(로그아웃) 링크 계정으로는 로그인하지 않는다(signed_out) — 남이 보낸 링크로 남의 계정에 로그인된 채 쓰지 않게.
// 실패는 하나다 — 없음·이미 씀·만료·계정 없음을 나누지 않는다(INV-K4). 로그에는 해시 앞 8자만(INV-K5).

type AuthAdmin = {
  getUserById(id: string): PromiseLike<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
  generateLink(params: { type: "magiclink"; email: string }): PromiseLike<{ data: { properties?: { hashed_token?: string } | null } | null; error: unknown }>;
};

export type LinkSignInDeps = {
  links: Pick<LoginLinks, "consume">;
  /** 서버 전용 키의 Auth 관리자 */
  authAdmin: AuthAdmin;
  /** 요청한 사람의 세션 클라이언트 — 로그인 쿠키를 여기서 쓴다 */
  auth: Pick<SupabaseClient["auth"], "getUser" | "signOut" | "verifyOtp">;
  env: DeployEnv;
  /** 실패 로그 한 줄. 기본은 console.warn */
  log?: (line: string) => void;
};

/** signed_in: 링크 계정으로 로그인 · kept: 이미 로그인한 그대로 · signed_out: 다른 계정이라 로그아웃 · failed: 로그인 안 된 채 실패 */
export type LinkSignInResult = { outcome: "signed_in"; accountId: string } | { outcome: "kept" } | { outcome: "signed_out" } | { outcome: "failed" };

const failed = { outcome: "failed" } as const;
const kept = { outcome: "kept" } as const;

export async function linkSignIn(deps: LinkSignInDeps, body: unknown): Promise<LinkSignInResult> {
  const log = deps.log ?? ((line: string) => console.warn(line));
  const token = readLoginLinkToken(typeof body === "object" && body !== null ? (body as { t?: unknown }).t : undefined);
  // 카드 d1: 지금 로그인한 사람(INV-L2 로 확인)을 먼저 본다 — 토큰을 쓸 수 없을 때 그대로 둘지가 여기에 달렸다
  const current = await readVerifiedUserId(deps.auth);
  const unusable = current ? kept : failed;
  if (!token) return unusable;
  const hash = loginLinkTokenHash(token);
  const prefix = loginLinkHashPrefix(hash);

  let accountId: string | null;
  try {
    accountId = await deps.links.consume(hash);
  } catch {
    log(`[link-login] 토큰 쓰기 오류 ${prefix}`);
    return unusable;
  }
  if (!accountId) {
    log(`[link-login] 토큰 쓰기 실패 ${prefix}`);
    return unusable;
  }
  if (current) {
    if (current === accountId) return kept;
    // 카드 d1: 다른 계정 — 지금 세션을 끝내고(INV-L7, 쿠키를 지운다) 링크 계정으로는 로그인하지 않는다
    try {
      await signOut(deps.auth);
    } catch {
      // 라이브러리는 Auth 오류여도 이 기기의 쿠키는 지운다 — 로그인 화면으로 보내는 것은 같다
      log(`[link-login] 로그아웃 오류 ${prefix}`);
    }
    log(`[link-login] 다른 계정으로 로그인돼 있어 로그아웃 ${prefix}`);
    return { outcome: "signed_out" };
  }

  try {
    const { data: found, error: findError } = await deps.authAdmin.getUserById(accountId);
    const email = findError ? undefined : found.user?.email;
    // session-login INV-L6: 운영에서는 시험 계정 주소로 Auth 를 부르지 않는다
    if (!email || (isProduction(deps.env) && isTestAccountEmail(email))) {
      log(`[link-login] 로그인 주소 없음 ${prefix}`);
      return failed;
    }

    const { data: link, error: linkError } = await deps.authAdmin.generateLink({ type: "magiclink", email });
    const tokenHash = linkError ? undefined : link?.properties?.hashed_token;
    if (!tokenHash) {
      log(`[link-login] 로그인 값 만들기 실패 ${prefix}`);
      return failed;
    }
    const { error: verifyError } = await deps.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (verifyError) {
      log(`[link-login] 로그인 확인 실패 ${prefix}`);
      return failed;
    }
    return { outcome: "signed_in", accountId };
  } catch {
    log(`[link-login] 로그인 오류 ${prefix}`);
    return failed;
  }
}
