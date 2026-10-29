import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 승인 서명 연결 여부 읽기 (approval-signature INV-S16 · creator-link INV-E15).
// - 본인: 연결됐는지와 연결한 때만(my_signature_link) — 등록한 이름·생년월일·번호는 본인에게도 다시 보이지 않는다.
// - 공개: 참/거짓 하나(creator_signature_linked) — 링크 페이지가 「승인 수단 등록 전」을 정한다.
// 읽지 못하면 연결 전으로 본다(닫힌 쪽) — 선물 보내기 버튼이 숨을 뿐이고, 주문을 막는 것은 DB 의 주문 생성 함수다.

export type MySignatureLink = { linked: boolean; linkedAt: string | null };

const myRow = z.object({ linked: z.boolean(), linked_at: z.string().nullable() });

export async function readMySignatureLink(client: Pick<SupabaseClient, "rpc">): Promise<MySignatureLink> {
  const { data, error } = await client.rpc("my_signature_link");
  if (error) {
    console.error("my_signature_link 읽기 실패", error.code);
    return { linked: false, linkedAt: null };
  }
  const row = myRow.safeParse(Array.isArray(data) ? data[0] : data);
  if (!row.success) return { linked: false, linkedAt: null };
  return { linked: row.data.linked, linkedAt: row.data.linked ? row.data.linked_at : null };
}

export async function readCreatorSignatureLinked(client: Pick<SupabaseClient, "rpc">, creatorId: string): Promise<boolean> {
  const { data, error } = await client.rpc("creator_signature_linked", { p_creator: creatorId });
  if (error) {
    console.error("creator_signature_linked 읽기 실패", error.code);
    return false;
  }
  return data === true;
}

export type PendingSignatureLink = { requestId: string; expiresAt: string };

const pendingRow = z.object({ request_id: z.string().uuid(), expires_at: z.string() });

/**
 * 본인의 기한 안 대기 요청 하나(my_pending_signature_link) — 화면을 떠났다 돌아온 크리에이터가 같은 요청의 결과를 이어 묻게.
 * 요청 ID 와 기한만 온다(DB 가 로그인 토큰의 본인 것만 돌려준다). 없거나 읽지 못하면 null — 처음부터 다시 요청하면 된다.
 */
export async function readMyPendingSignatureLink(client: Pick<SupabaseClient, "rpc">): Promise<PendingSignatureLink | null> {
  const { data, error } = await client.rpc("my_pending_signature_link");
  if (error) {
    console.error("my_pending_signature_link 읽기 실패", error.code);
    return null;
  }
  const row = pendingRow.safeParse(Array.isArray(data) ? data[0] : data);
  return row.success ? { requestId: row.data.request_id, expiresAt: row.data.expires_at } : null;
}
