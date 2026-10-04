import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { NoticeWrite } from "../model/save-notice";

// 브라우저에서 공지를 올리거나 고친다(/api/admin/notices).
export function postNotice(write: NoticeWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/notices", write);
}
