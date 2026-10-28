import {
  invoiceDecryptorFrom,
  returnLabelPrinterFrom,
  wireDecryptorDeps,
  type InvoiceDecryptor,
  type ReturnLabelPrinter,
} from "@/features/invoice-print/api/invoice-decryptor";
import { devWaybillNo } from "@/features/office-outbound/model/dev-waybill";

// 서명 게이트웨이(sign.fankkuk.com)가 돌리는 송장 출력 함수의 진입점 — address-protection 「복호화 함수」.
// 라우트가 아니다(밑줄 폴더는 Next 가 주소로 만들지 않는다). sign-gateway/scripts/build-decryptor.mjs 가 이 파일을
// 의존 모듈까지 한 파일로 묶어 게이트웨이에 올린다. 앱 서버 코드는 이 파일을 부르지 않는다.
// 판정(대표·서명 재검증·주문번호·단계·횟수·열람 기록)은 로컬과 같은 코드다. 다른 것은 키 풀기(KMS)와 요청 통로(허용 목록)뿐이다.

export type GatewayDecryptorOptions = {
  /** 송장 출력 함수가 보는 설정 — SUPABASE_URL·SUPABASE_PUBLISHABLE_KEY·NODE_ENV·FANKKUK_TEST_SITE·APP_ORIGIN */
  env: Record<string, string | undefined>;
  dbKey: string;
  ownerUserId: string;
  /** 감싼 데이터 키(base64)를 푼다 — 게이트웨이에서는 KMS */
  unwrap: (wrappedKeyBase64: string) => Promise<Uint8Array>;
  /** 허용 목록을 거치는 요청 통로 */
  fetch: typeof fetch;
  /** 첫 출력의 송장번호. 없으면 개발용 난수(택배사 연동 전) */
  newWaybill?: () => string;
};

export function createGatewayDecryptors(o: GatewayDecryptorOptions): {
  printLabel: InvoiceDecryptor;
  printReturnLabel: ReturnLabelPrinter;
} {
  const deps = wireDecryptorDeps({
    env: o.env,
    dbKey: o.dbKey,
    ownerUserId: o.ownerUserId,
    unwrapper: { unwrap: o.unwrap },
    newWaybill: o.newWaybill ?? devWaybillNo,
    fetch: o.fetch,
  });
  return { printLabel: invoiceDecryptorFrom(deps), printReturnLabel: returnLabelPrinterFrom(deps) };
}
