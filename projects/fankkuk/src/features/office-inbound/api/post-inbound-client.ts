import { postOffice, type OfficePostOutcome } from "@/entities/parcel/api/post-office-client";
import type { InboundWrite } from "../model/scan-inbound";

// 브라우저에서 입고 스캔·부착 확인·미확인 입고 기록을 보낸다(/api/admin/work/inbound).
export function postInbound(write: InboundWrite): Promise<OfficePostOutcome> {
  return postOffice("/api/admin/work/inbound", write);
}
