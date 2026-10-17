import type { NextRequest } from "next/server";
import {
  createInvoiceDecryptor,
  createReturnLabelPrinter,
  readDecryptFile,
  type InvoiceDecryptor,
  type ReturnLabelPrinter,
} from "@/features/invoice-print/api/invoice-decryptor";
import { devWaybillNo } from "@/features/office-outbound/model/dev-waybill";
import { scanOutbound, type LabelOutcome, type ReturnLabelOutcome } from "@/features/office-outbound/model/scan-outbound";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 출고 — QR 로 불러오기·송장 출력(대표만)·출고 확정·반송 송장 출력·반송 확정 (office-workflow INV-W1·W3·W8).
// 같은 사이트의 JSON 만, 응답은 캐시하지 않는다. 로그인한 사람의 세션 클라이언트로 DB 를 부른다 —
// 관리자 키를 쓰면 DB 의 대표 판정이 서버 계정 기준이 되어 직원도 주소를 연다.
// 팬 선물의 송장 출력은 송장 출력 함수(주소를 여는 유일한 서버 코드, address-protection INV-P4)에 로그인 토큰을 넘겨 맡긴다 —
// 그 함수가 토큰을 스스로 검증하고 자기 설정의 대표 ID 로 판단한다(INV-P8). 앱 서버는 키·복호화 자격을 갖지 않는다.
// 송장번호는 택배사 API 가 아직 없어 개발용 난수(devWaybillNo)로 만든다. 택배사 API 가 붙으면 newWaybill 을 그 호출로 바꾼다.

let decryptor: InvoiceDecryptor | null = null;

/** 송장 출력 함수를 처음 쓸 때 한 번 만든다. 운영 환경·설정 파일 없음이면 만들지 못하고 출력은 실패로 답한다(INV-P12). */
function invoiceDecryptor(): InvoiceDecryptor | null {
  if (decryptor) return decryptor;
  try {
    decryptor = createInvoiceDecryptor(process.env, readDecryptFile, devWaybillNo);
  } catch (e) {
    console.error("송장 출력 함수를 만들지 못했다", e instanceof Error ? e.message : typeof e);
    return null;
  }
  return decryptor;
}

let returnPrinter: ReturnLabelPrinter | null = null;

/** 반송 송장 출력 함수를 처음 쓸 때 한 번 만든다. 만들지 못하면(운영 환경·설정 파일 없음) 실패로 답한다 — 봉투 번호 길로 넘어가지 않는다 */
function returnLabelPrinter(): ReturnLabelPrinter | null {
  if (returnPrinter) return returnPrinter;
  try {
    returnPrinter = createReturnLabelPrinter(process.env, readDecryptFile, devWaybillNo);
  } catch (e) {
    console.error("반송 송장 출력 함수를 만들지 못했다", e instanceof Error ? e.message : typeof e);
    return null;
  }
  return returnPrinter;
}

export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const client = await createRequestSupabase();
    const printLabel = async (qr: string): Promise<LabelOutcome> => {
      const run = invoiceDecryptor();
      if (!run) return { kind: "failed" };
      const { data } = await client.auth.getSession();
      return run({ qr, accessToken: data.session?.access_token ?? "" });
    };
    // 반송 송장 — 주문에 이어진 상자는 보낸 사람이 확인한 주소를 여는 반송 송장 출력 함수에 같은 방식(로그인 토큰)으로 맡긴다(address-protection INV-P18)
    const printReturnLabel = async (qr: string): Promise<ReturnLabelOutcome> => {
      const run = returnLabelPrinter();
      if (!run) return { kind: "failed" };
      const { data } = await client.auth.getSession();
      return run({ qr, accessToken: data.session?.access_token ?? "" });
    };
    return scanOutbound({ client, newWaybill: devWaybillNo, printLabel, printReturnLabel }, body);
  });
}
