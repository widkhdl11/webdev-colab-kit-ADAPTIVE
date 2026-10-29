import type { Carrier } from "./carrier";
import { parseWaybillInput } from "./waybill-no";

// 배송 조회 링크 (action-center INV-J10 — 카드 d93 ⑦, 택배사 연결 전). 크리에이터가 창에 넣은 택배사·송장번호로
// 택배사 조회 페이지 주소를 만들 뿐이다 — 송장번호를 저장하지 않고, 어느 상자에도 잇지 않는다(잇는 길은 「내 상자 찾기」뿐).
// 「그 밖의 택배사」는 조회 주소가 없어 고를 수 없다. 송장번호는 숫자만(원 송장번호 꼴, waybill-no) 넣는다.

const TRACKING_URL: Partial<Record<Carrier, (no: string) => string>> = {
  cj: (no) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${no}`,
  post: (no) => `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${no}`,
  hanjin: (no) => `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${no}`,
  lotte: (no) => `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${no}`,
  logen: (no) => `https://www.ilogen.com/web/personal/trace/${no}`,
  kd: (no) => `https://kdexp.com/service/delivery/etc/delivery.do?barcode=${no}`,
  daesin: (no) => `https://www.ds3211.co.kr/freight/internalFreightSearch.ht?billno=${no}`,
  ilyang: (no) => `https://www.ilyanglogis.com/functionality/tracking_result.asp?hawb_no=${no}`,
  cu: (no) => `https://www.cupost.co.kr/postbox/delivery/localResult.cupost?invoice_no=${no}`,
  gs: (no) => `https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no=${no}`,
};

/** 배송 조회 창에서 고를 수 있는 택배사 — 조회 주소가 있는 것만, 택배사 목록 순서 그대로 */
export const TRACKABLE_CARRIERS: readonly Carrier[] = (Object.keys(TRACKING_URL) as Carrier[]).filter((c) => TRACKING_URL[c] !== undefined);

/** 택배사 조회 페이지 주소. 송장번호 꼴이 아니거나 조회 주소가 없는 택배사면 null */
export function trackingUrlOf(carrier: Carrier, waybill: string): string | null {
  const make = TRACKING_URL[carrier];
  const parsed = parseWaybillInput(waybill);
  if (!make || !parsed.ok) return null;
  return make(encodeURIComponent(parsed.value));
}
