import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { decryptPhone, type PhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { MESSAGE_FORBIDDEN, MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 대표의 「전화번호 보기」(admin-console INV-K14). 사유 입력 없이 바로 보인다.
// - 대표인지는 로그인 토큰으로 묻고(직원이면 DB 를 부르지 않는다), DB 함수 admin_reveal_phone 이 같은 판정을 다시 하며
//   접속 기록 한 줄(누가·언제·어느 계정)을 같은 처리에서 남긴 뒤에만 그 계정 ID 와 번호 암호문을 돌려준다.
// - 앱 서버가 그 계정 ID 로 풀어(signup INV-U18) 이 응답에만 싣는다. 암호문·계정 ID 는 응답에 없다. 응답은 캐시되지 않는다(handlePrivateJsonPost).

// 아이디 꼴(signup INV-U6 — 탈퇴 처리 아이디 withdrawn_… 포함 넉넉히)
const bodyShape = z.object({ loginId: z.string().regex(/^[a-z0-9_]{4,64}$/) }).strict();
const revealRow = z.object({ account_id: z.string().uuid(), phone_sealed: z.string() });

const MESSAGES = {
  invalid: "요청을 확인해 주세요.",
  noPhone: "등록된 휴대폰 번호가 없습니다.",
  failed: "번호를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export type RevealDeps = { client: Pick<SupabaseClient, "rpc">; phoneKeys: () => PhoneKeys };

/** 01012345678 → 010-1234-5678, 0161234567 → 016-123-4567 */
function displayPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}` : `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
}

export async function revealCreatorPhone(deps: RevealDeps, body: unknown): Promise<JsonReply> {
  const access = await readAdminAccess(deps.client);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (access !== "owner") return { status: 403, body: { message: MESSAGE_FORBIDDEN } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGES.invalid } };

  const { data, error } = await deps.client.rpc("admin_reveal_phone", { p_login_id: shaped.data.loginId });
  if (error) {
    if (error.code === "42501") return { status: 403, body: { message: MESSAGE_FORBIDDEN } };
    return { status: 500, body: { message: MESSAGES.failed } };
  }
  const rows = z.array(revealRow).safeParse(data);
  if (!rows.success) return { status: 500, body: { message: MESSAGES.failed } };
  const row = rows.data[0];
  if (!row) return { status: 404, body: { message: MESSAGES.noPhone } };
  const phone = decryptPhone(deps.phoneKeys(), row.account_id, row.phone_sealed);
  if (!phone) return { status: 500, body: { message: MESSAGES.failed } };
  return { status: 200, body: { phone: displayPhone(phone) } };
}
