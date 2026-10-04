import type { SupabaseClient } from "@supabase/supabase-js";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { officeErrorReply } from "../model/office-error";
import { parcelDetailFromData } from "../model/office-parcel";

// 라벨 QR 로 상자 한 개를 불러온다 (office-workflow INV-W1·W8). 검수·출고 화면이 스캔 결과 카드를 그릴 때 쓴다.
// 로그인한 운영자의 세션 클라이언트로 부른다. 꼴이 다른 답은 500 — 화면이 짐작해 그리지 않는다.

const MESSAGES = { limit: "라벨 QR 꼴이 아니에요.", failed: "상자를 불러오지 못했어요. 잠시 뒤 다시 해 주세요." };

export async function lookupParcelReply(client: Pick<SupabaseClient, "rpc">, qr: string): Promise<JsonReply> {
  const { data, error } = await client.rpc("office_parcel_by_qr", { p_qr: qr });
  if (error) return officeErrorReply(error.code, MESSAGES);
  const parcel = parcelDetailFromData(data);
  if (!parcel) return { status: 500, body: { message: MESSAGES.failed } };
  return { status: 200, body: { parcel } };
}
