import type { NextRequest } from "next/server";
import { chooseLabelPrinters } from "@/features/invoice-print/api/choose-label-printers";
import { createGatewayLabelPrinters } from "@/features/invoice-print/api/gateway-client";
import { createLocalLabelPrinters, readDecryptFile, type LabelPrinters } from "@/features/invoice-print/api/invoice-decryptor";
import { outboundWaybillSource } from "@/features/invoice-print/model/outbound-waybill-source";
import { shipGiftBox, type BoxLabelOutcome } from "@/features/office-gift-box/model/ship-gift-box";
import { devWaybillNo } from "@/features/office-outbound/model/dev-waybill";
import { UNCONTRACTED_COURIER_API } from "@/shared/api/courier/courier-api";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { INVOICE_OUTPUT_MODE } from "@/shared/config/courier";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 선물함 출고·반송 (revgift-box INV-GB19·GB20). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다(관리자 키를 쓰면 DB 의 대표 판정이 서버 계정 기준이 된다).
// 송장 출력은 출고 화면(api/admin/work/outbound)과 같은 송장 출력 함수 묶음에 로그인 토큰과 신청 번호(GB…)를 넘겨 맡긴다 —
// 그 함수가 토큰을 스스로 검증하고 자기 설정의 대표 ID 로 판단한다(address-protection INV-P8). 앱 서버는 키·복호화 자격을 갖지 않는다.

let printers: LabelPrinters | null = null;

function labelPrinters(): LabelPrinters | null {
  printers ??= chooseLabelPrinters(process.env, {
    gateway: (cfg) => createGatewayLabelPrinters(cfg),
    local: () => createLocalLabelPrinters(process.env, readDecryptFile, outboundWaybillSource(INVOICE_OUTPUT_MODE, UNCONTRACTED_COURIER_API), devWaybillNo),
  });
  return printers;
}

export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const client = await createRequestSupabase();
    const printLabel = async (label: string): Promise<BoxLabelOutcome> => {
      const run = labelPrinters()?.printLabel;
      if (!run) return { kind: "failed" };
      const { data } = await client.auth.getSession();
      return run({ qr: label, accessToken: data.session?.access_token ?? "" });
    };
    return shipGiftBox({ client, printLabel }, body);
  });
}
