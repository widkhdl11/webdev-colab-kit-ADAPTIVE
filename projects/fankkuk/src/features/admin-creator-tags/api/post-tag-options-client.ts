import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { TagOptionWrite } from "../model/save-tag-options";

// 브라우저에서 운영자의 태그 선택지 관리·「선택지에 넣기」를 보낸다(/api/admin/creators/tags).
export function postTagOptions(write: TagOptionWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/creators/tags", write);
}
