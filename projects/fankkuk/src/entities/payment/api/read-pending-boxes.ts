import type { SupabaseClient } from "@supabase/supabase-js";
import { pendingBoxesFrom, type PendingBox } from "../model/pending-boxes";

// 거절·반려 때 아직 안 온 상자 목록 읽기 (payment INV-M18). 로그인한 운영자의 세션 클라이언트로 부른다 —
// 운영자가 아니면 DB 가 빈 결과를 준다. 칸 모양이 다르면 지어내지 않고 실패한다.

export async function readPendingBoxes(client: Pick<SupabaseClient, "rpc">): Promise<PendingBox[]> {
  const { data, error } = await client.rpc("admin_pending_boxes");
  if (error) throw new Error(`아직 안 온 상자 목록을 읽지 못했다: ${error.code}`);
  const rows = pendingBoxesFrom(data);
  if (!rows) throw new Error("아직 안 온 상자 목록의 형식이 다르다");
  return rows;
}
