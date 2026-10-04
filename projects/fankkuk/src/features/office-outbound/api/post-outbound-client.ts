import { postOffice, type OfficePostOutcome } from "@/entities/parcel/api/post-office-client";
import type { OutboundWrite } from "../model/scan-outbound";

// 브라우저에서 출고 화면의 요청을 보낸다(/api/admin/work/outbound). 송장번호는 보내지 않는다 — 서버가 만든다.
export function postOutbound(write: OutboundWrite): Promise<OfficePostOutcome> {
  return postOffice("/api/admin/work/outbound", write);
}
