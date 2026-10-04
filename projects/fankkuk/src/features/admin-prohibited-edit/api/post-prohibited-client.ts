import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { ProhibitedWrite } from "../model/save-prohibited";

// 브라우저에서 금지 물품을 추가·고치기·지우기 한다(/api/admin/prohibited).
export function postProhibited(write: ProhibitedWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/prohibited", write);
}
