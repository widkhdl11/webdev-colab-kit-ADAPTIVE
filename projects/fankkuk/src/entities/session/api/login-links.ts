import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { newLoginLinkToken } from "../model/login-link";

// 1회용 로그인 토큰 DB 함수 (docs/specs/link-login.md INV-K1·K2). 서버 전용 키(관리자 클라이언트)로만 부른다 — 화면 쪽 키는 함수 권한이 없다.
// 발급: 보내는 중인 카카오 승인 요청 줄 id 를 넘기면 DB 가 그 줄의 받는 계정에 묶는다 — 계정을 고르는 인자는 없다(S1e).
// 쓰기: 해시를 넘기면 DB 가 행을 잠그고 한 번만 쓴다(INV-K2). 원문은 어느 함수에도 넘기지 않는다(INV-K1).

export type LoginLinks = {
  /** 그 발송 줄에 묶은 새 토큰 원문. 그 줄에 발급되지 않으면 null. DB 오류는 던진다. */
  issue(outboxId: string): Promise<string | null>;
  /** 해시를 쓴다 — 쓰였으면 계정 id, 없음·이미 씀·만료면 null(사유는 DB 가 남긴다). DB 오류는 던진다. */
  consume(hash: string): Promise<string | null>;
};

const accountId = z.guid().nullable();

export function loginLinksOf(admin: Pick<SupabaseClient, "rpc">): LoginLinks {
  return {
    async issue(outboxId) {
      const { token, hash } = newLoginLinkToken();
      const { data, error } = await admin.rpc("login_link_issue", { p_outbox_id: outboxId, p_token_hash: hash });
      if (error) throw new Error(`로그인 토큰을 발급하지 못했다: ${error.code}`);
      return data === true ? token : null;
    },
    async consume(hash) {
      const { data, error } = await admin.rpc("login_link_consume", { p_token_hash: hash });
      if (error) throw new Error(`로그인 토큰을 쓰지 못했다: ${error.code}`);
      return accountId.parse(data ?? null);
    },
  };
}
