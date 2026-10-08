import type { SupabaseClient } from "@supabase/supabase-js";

// 비밀번호 확인 횟수 (session-login INV-L14). 아이디마다 10분에 5번 틀리면 마지막으로 틀린 때부터 15분 막는다.
// 로그인·비밀번호 바꾸기·번호 바꾸기는 Auth 에 비밀번호를 묻기 전에 begin 을 부르고, 결과를 finish 로 적는다.
// 막힘 판정·동시 시도 세기는 DB 가 한다(시작 함수가 아이디를 잠그고 「결과 전」 시도도 틀린 것으로 센다).
// 서버 전용 키(관리자 클라이언트)로만 부른다 — 손님 키로 부를 수 있으면 남의 아이디를 일부러 막을 수 있다.

export type PasswordAttempts = {
  /** 시도를 시작한다. 막혔으면 null(이번 시도는 기록되지 않는다), 아니면 결과를 적을 시도 번호 */
  begin(loginKey: string): Promise<number | null>;
  /** 그 시도의 결과를 적는다(한 번만 — 이미 적힌 시도는 DB 가 그대로 둔다) */
  finish(id: number, ok: boolean): Promise<void>;
  /** 비밀번호 재설정이 끝났을 때 그 아이디의 막힘을 푼다(INV-L10·L14) */
  clear(loginKey: string): Promise<void>;
};

/** INV-L14: 막혔을 때의 안내 하나 — 있는 아이디든 없는 아이디든 같다(INV-L5). */
export const PASSWORD_LOCKED_MESSAGE = "비밀번호를 여러 번 틀려 잠시 확인할 수 없어요. 15분 뒤 다시 하거나 비밀번호를 재설정해 주세요.";

/** 세는 열쇠 — 앞뒤 공백을 떼고 소문자로(DB 도 같은 꼴만 받는다). */
export function passwordLoginKey(loginId: string): string {
  return loginId.trim().toLowerCase();
}

/** admin = 서버 전용 키의 클라이언트. 기록을 못 하면 예외 — 막힘을 확인하지 못한 채 비밀번호를 묻지 않는다. */
export function passwordAttemptsOf(admin: Pick<SupabaseClient, "rpc">): PasswordAttempts {
  return {
    async begin(loginKey) {
      const { data, error } = await admin.rpc("password_attempt_begin", { p_login_key: passwordLoginKey(loginKey) });
      if (error) throw new Error(`비밀번호 확인 횟수를 읽지 못했다: ${error.code}`);
      if (data === null) return null;
      if (typeof data !== "number") throw new Error("비밀번호 확인 횟수의 모양이 다르다");
      return data;
    },
    async finish(id, ok) {
      const { error } = await admin.rpc("password_attempt_finish", { p_id: id, p_ok: ok });
      if (error) throw new Error(`비밀번호 확인 결과를 적지 못했다: ${error.code}`);
    },
    async clear(loginKey) {
      const { error } = await admin.rpc("password_attempt_clear", { p_login_key: passwordLoginKey(loginKey) });
      if (error) throw new Error(`비밀번호 확인 막힘을 풀지 못했다: ${error.code}`);
    },
  };
}
