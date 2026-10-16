import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { ShareMoveCandidatesRead, ShareMoveWrite } from "../model/move-share";

// 브라우저에서 운영자 몫 옮기기의 후보 읽기·옮기기를 보낸다(/api/admin/work/unmatched, inbound-address-code INV-C11).

export function postMoveCandidates(id: string): Promise<PostJsonOutcome> {
  const read: ShareMoveCandidatesRead = { kind: "move_candidates", id };
  return postJson("/api/admin/work/unmatched", read, "팬별 선물을 읽지 못했어요. 잠시 뒤 다시 해 주세요.");
}

export function postShareMove(id: string, shareId: string): Promise<PostJsonOutcome> {
  const write: ShareMoveWrite = { kind: "move", id, shareId };
  return postJson("/api/admin/work/unmatched", write, "처리하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
