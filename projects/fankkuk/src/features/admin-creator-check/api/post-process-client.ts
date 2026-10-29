import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { CreatorCheckProcessWrite } from "../model/process-check";

// 브라우저에서 크리에이터가 고른 블루투스 상자의 운영자 처리를 보낸다(/api/admin/work/creator-checks, office-workflow INV-W13).
// 보내는 값은 상자 QR 과 화면에서 본 선택뿐이다.
export function postProcessCheck(qr: string, seen: CreatorCheckProcessWrite["seen"]): Promise<PostJsonOutcome> {
  const write: CreatorCheckProcessWrite = { qr, seen };
  return postJson("/api/admin/work/creator-checks", write, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
