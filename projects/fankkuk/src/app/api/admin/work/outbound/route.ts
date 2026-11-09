import { after, type NextRequest } from "next/server";
import { subscribePendingQuietly } from "@/features/delivery-tracking/api/server-deps";
import { chooseLabelPrinters } from "@/features/invoice-print/api/choose-label-printers";
import { createGatewayLabelPrinters } from "@/features/invoice-print/api/gateway-client";
import { createLocalLabelPrinters, readDecryptFile, type LabelPrinters } from "@/features/invoice-print/api/invoice-decryptor";
import { outboundWaybillSource } from "@/features/invoice-print/model/outbound-waybill-source";
import { devWaybillNo } from "@/features/office-outbound/model/dev-waybill";
import { scanOutbound, type LabelOutcome, type ReturnLabelOutcome } from "@/features/office-outbound/model/scan-outbound";
import { UNCONTRACTED_COURIER_API } from "@/shared/api/courier/courier-api";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { INVOICE_OUTPUT_MODE } from "@/shared/config/courier";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 출고 — QR 로 불러오기·송장 출력(대표만)·출고 확정·반송 송장 출력·반송 확정 (office-workflow INV-W1·W3·W8).
// 같은 사이트의 JSON 만, 응답은 캐시하지 않는다. 로그인한 사람의 세션 클라이언트로 DB 를 부른다 —
// 관리자 키를 쓰면 DB 의 대표 판정이 서버 계정 기준이 되어 직원도 주소를 연다.
// 팬 선물의 송장 출력은 송장 출력 함수(주소를 여는 유일한 서버 코드, address-protection INV-P4)에 로그인 토큰을 넘겨 맡긴다 —
// 그 함수가 토큰을 스스로 검증하고 자기 설정의 대표 ID 로 판단한다(INV-P8). 앱 서버는 키·복호화 자격을 갖지 않는다.
// 어디서 뽑을지(서명 게이트웨이·로컬)는 chooseLabelPrinters 한 곳이 정한다.
// 출고 송장의 운송장 번호는 송장 출력 방식(address-protection INV-P21)이 정한다 — 기본 「수동 입력」이면 주소를 열 때 번호가 없고 대표가 나중에 넣는다.
// 택배사 API 는 계약 전이라 연결 자리만 있다(그 방식으로 바꾸면 조립이 실패한다). 반송 송장 번호는 아직 개발용 난수(devWaybillNo)다.

let printers: LabelPrinters | null = null;

/** 송장·반송 송장 출력 함수를 처음 쓸 때 한 번 정한다. 정하지 못하면(설정 틀림·운영 환경·설정 파일 없음) 출력은 실패로 답하고 다음 요청에서 다시 본다. */
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
    const printLabel = async (qr: string): Promise<LabelOutcome> => {
      const run = labelPrinters()?.printLabel;
      if (!run) return { kind: "failed" };
      const { data } = await client.auth.getSession();
      return run({ qr, accessToken: data.session?.access_token ?? "" });
    };
    // 반송 송장 — 주문에 이어진 상자는 보낸 사람이 확인한 주소를 여는 반송 송장 출력 함수에 같은 방식(로그인 토큰)으로 맡긴다(address-protection INV-P18).
    // 만들지 못하면 실패로 답한다 — 봉투 번호 길로 넘어가지 않는다
    const printReturnLabel = async (qr: string): Promise<ReturnLabelOutcome> => {
      const run = labelPrinters()?.printReturnLabel;
      if (!run) return { kind: "failed" };
      const { data } = await client.auth.getSession();
      return run({ qr, accessToken: data.session?.access_token ?? "" });
    };
    const reply = await scanOutbound({ client, newWaybill: devWaybillNo, printLabel, printReturnLabel }, body);
    // 송장번호가 저장되면 DB 가 구독 대기 줄을 만든다 — 처리가 성공했을 때만, 응답을 보낸 뒤 그 줄을 배송 조회 서비스에 보낸다(실패해도 이 처리와 무관, delivery-status INV-DS12)
    if (reply.status === 200) after(subscribePendingQuietly);
    return reply;
  });
}
