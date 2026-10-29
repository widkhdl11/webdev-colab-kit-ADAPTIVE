import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { HeldLinkCandidatesRead, HeldLinkWrite } from "../model/link-held";

// 브라우저에서 운영자 잇기의 후보 읽기·잇기를 보낸다(/api/admin/work/unmatched, inbound-address-code INV-C12).

export function postLinkCandidates(id: string, nickname: string): Promise<PostJsonOutcome> {
  const read: HeldLinkCandidatesRead = { kind: "candidates", id, nickname };
  return postJson("/api/admin/work/unmatched", read, "상자를 읽지 못했어요. 잠시 뒤 다시 해 주세요.");
}

export function postHeldLink(id: string, nickname: string, boxId: string): Promise<PostJsonOutcome> {
  const write: HeldLinkWrite = { kind: "link", id, nickname, boxId, checked: true };
  return postJson("/api/admin/work/unmatched", write, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
