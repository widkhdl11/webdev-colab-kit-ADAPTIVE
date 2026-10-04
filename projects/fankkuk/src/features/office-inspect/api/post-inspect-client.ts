import { postOffice, type OfficePostOutcome } from "@/entities/parcel/api/post-office-client";
import type { InspectWrite } from "../model/scan-inspect";

// 브라우저에서 검수 화면의 요청을 보낸다(/api/admin/work/inspect).
export function postInspect(write: InspectWrite): Promise<OfficePostOutcome> {
  return postOffice("/api/admin/work/inspect", write);
}
