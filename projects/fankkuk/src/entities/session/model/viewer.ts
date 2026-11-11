import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * INV-L2: 지금 요청한 사람의 ID. 쿠키 내용을 직접 해석하지 않고 Supabase Auth 서버에 토큰을 확인받는다
 * (getUser 는 매번 Auth 서버를 부른다 — 서명이 틀리거나 로그아웃된 세션이면 오류).
 * 확인에 실패하면 로그인하지 않은 것으로 본다. 사람 판정은 이 함수 하나만 한다.
 */
export async function readVerifiedUserId(auth: Pick<SupabaseClient["auth"], "getUser">): Promise<string | null> {
  try {
    const { data, error } = await auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export type ViewerRole = "fan" | "creator" | "operator";

/** 확인된 로그인 사용자와 그 역할. 역할은 DB 의 계정 칸(my_profile)에서 온다 — 주소 복호화 판단에는 쓰지 않는다(INV-P8). */
export type Viewer = { userId: string; role: ViewerRole; nickname?: string; /** 로그인 아이디 — 화면 안내용(팬꾹 링크가 로그인 아이디와 같은지 미리 보기, signup INV-U14). 판정은 DB 가 다시 한다 */ loginId?: string };

const ROLES: readonly ViewerRole[] = ["fan", "creator", "operator"];

/**
 * 본인에게 보이는 이름 자리(위쪽 메뉴 등). 닉네임이 있으면 닉네임.
 * 채널을 만들기 전 크리에이터는 닉네임이 비어 있다(signup INV-U21) — 본인만 보는 자리라 로그인 아이디를 쓴다.
 * 남에게 보이는 자리에는 쓰지 않는다(로그인 아이디는 공개하지 않는 값이다).
 */
/** 채널을 만들었는지(signup INV-U21) — 채널 없음 = 닉네임이 비어 있는 크리에이터. 팬은 언제나 닉네임이 있다 */
export function viewerHasChannel(viewer: Pick<Viewer, "nickname">): boolean {
  return viewer.nickname !== null && viewer.nickname !== "";
}

export function viewerOwnName(viewer: Pick<Viewer, "role" | "nickname" | "loginId">): string {
  if (viewer.nickname) return viewer.nickname;
  return viewer.role === "creator" ? (viewer.loginId ?? "") : "";
}

/** INV-L2 로 사람을 확인한 뒤, 그 사람의 계정 칸을 읽는다. 둘 중 하나라도 안 되면 로그인하지 않은 것으로 본다. */
export async function readViewer(client: Pick<SupabaseClient, "auth" | "rpc">): Promise<Viewer | null> {
  const userId = await readVerifiedUserId(client.auth);
  if (!userId) return null;
  const { data, error } = await client.rpc("my_profile");
  const row = Array.isArray(data) ? (data[0] as { role?: unknown; nickname?: unknown; login_id?: unknown } | undefined) : undefined;
  if (error || !row || !ROLES.includes(row.role as ViewerRole)) return null;
  return {
    userId,
    role: row.role as ViewerRole,
    // 채널을 만들기 전 크리에이터는 닉네임이 null 이다(signup INV-U21) — 없는 것으로 둔다
    nickname: typeof row.nickname === "string" ? row.nickname : undefined,
    loginId: typeof row.login_id === "string" ? row.login_id : undefined,
  };
}
