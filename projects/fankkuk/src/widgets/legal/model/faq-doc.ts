import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { DIFFERENCE_DEADLINE_DAYS } from "@/entities/payment/config/difference-deadline";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { PROMISE } from "@/shared/config/site-copy";
import { orBlank, SITE_INFO } from "@/shared/config/site-info";
import { toCheck } from "./legal-doc";

// 자주 묻는 질문(/faq). 답의 사실은 terms-doc·privacy-doc 과 같은 근거(specs payment·decline-block·reverse-gift·inbound-address-code)를 따른다.
// 요금 숫자는 page 가 읽어 넘긴 공개 요금표. 설계 문서에 없는 기간은 toCheck 로 둔다.

export type FaqItem = {
  /** 질문 고정 주소(#id, 원칙 ⑤) — 질문 문장이 바뀌어도 주소가 그대로이게 문장에서 만들지 않고 직접 적는다 */
  id: string;
  q: string;
  a: string;
  /** 분류 칩 이름(원칙 ②) */
  tags?: readonly string[];
  /** 「주요」 배지(원칙 ③) */
  frequent?: true;
};

export type FaqDoc = {
  summary: readonly [string, string, string];
  items: readonly FaqItem[];
  /** 요약 줄마다 이어지는 질문 id — summary 와 같은 길이 */
  summaryLinks?: readonly string[];
  /** 분류 칩 순서 — 없으면 질문에 처음 나온 차례 */
  tagOrder?: readonly string[];
  /** 최종 수정일 「YYYY-MM-DD」 */
  updated?: string;
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function faqDoc(prices: PublicPriceTable): FaqDoc {
  const giftFees = PRICED_TIERS.map((t) => `${PARCEL_TIER_GUIDE[t].name}(${PARCEL_TIER_GUIDE[t].rule}) ${won(prices[t].priceKrw)}`).join(", ");
  const revgiftFees = PRICED_TIERS.map((t) => `${PARCEL_TIER_GUIDE[t].name} ${won(prices[t].revgiftPriceKrw)}`).join(", ");
  return {
    summary: [
      "요금은 상자마다 받고, 택배비와 검수비가 들어 있어요.",
      "크리에이터가 승인한 선물만 크리에이터에게 보내요.",
      "더 궁금한 것은 고객센터의 1:1 문의로 물어봐 주세요.",
    ],
    items: [
      {
        id: "fee",
        q: "요금은 얼마인가요?",
        a: `상자마다 받아요. ${giftFees}이에요. 택배비와 검수비가 들어 있는 금액이에요. 세 변의 합과 무게 가운데 더 큰 쪽 구간으로 정하고, ${OVERSIZE_RULE}는 받지 않아요.`,
      },
      {
        id: "delivery-time",
        q: "크리에이터에게 도착하기까지 얼마나 걸리나요?",
        a: `승인과 검수가 모두 끝난 상자만 출고해요. 사무실에 도착한 뒤 출고까지 걸리는 기간은 ${toCheck("입고부터 출고까지 걸리는 기간")}이에요. 진행 상황은 선물 상세에서 볼 수 있어요.`,
      },
      {
        id: "decline",
        q: "크리에이터가 거절하면 어떻게 되나요?",
        a: `거절된 선물은 크리에이터에게 배송하지 않고, 거절한 이유는 알리지 않아요. 받는 주소가 보이기 전에 끝났다면 결제 금액을 모두 돌려드려요. 사무실에 도착한 상자는 처음 붙인 송장의 주소로 돌려보내 드리고, 반송 택배비를 뺀 금액을 돌려드려요. 검수에 걸린 상자는 돌려드리는 금액이 없어요. ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않은 선물도 같아요.`,
      },
      {
        id: "creator-waybill",
        q: "크리에이터에게 가는 송장번호를 볼 수 있나요?",
        a: `볼 수 없어요. 그 송장번호로 택배사 조회를 하면 받는 곳의 일부가 보이기 때문이에요. ${PROMISE.addressFan} 팬이 넣는 송장번호는 팬꾹 사무실로 보내는 상자의 것이에요.`,
      },
      {
        id: "address-per-box",
        q: "받는 주소가 왜 상자마다 다른가요?",
        a: "사무실 주소 끝에 상자마다 다른 6자리가 붙어 있어서예요. 사무실에서는 이 6자리로 어느 선물의 어느 상자인지 찾아요. 상자마다 그 상자의 주소를 끝 6자리까지 그대로 써 주세요.",
      },
      {
        id: "sent-without-address",
        q: "받는 주소 없이 보냈어요.",
        a: "송장의 보내는 분 칸에 팬꾹 닉네임을 썼다면, 선물 상세의 「받는 주소 없이 보냈어요」에서 택배사와 송장번호를 넣어 주세요. 닉네임을 쓰지 않았다면 1:1 문의로 송장번호와 내용물을 알려 주세요. 사무실에 도착한 지 7일 안에 주인을 찾지 못한 상자는 처음 붙인 송장의 보낸 사람 주소로 착불로 돌려보내요.",
      },
      {
        id: "creator-approve",
        q: "크리에이터는 선물을 어떻게 승인하나요?",
        a: `승인 요청이 오면 선물마다 카카오톡 인증서로 서명해서 승인해요. 한 번에 모두 승인하는 기능은 없어요. 결제한 때부터 ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않으면 자동으로 반려돼요.`,
      },
      {
        id: "size-difference",
        q: "도착해서 잰 크기가 등록한 것보다 크면요?",
        a: `차액을 따로 결제해 주셔야 해요. 차액을 결제하기 전에는 출고하지 않고, 요청한 때부터 ${DIFFERENCE_DEADLINE_DAYS}일 안에 결제하지 않으면 상자를 돌려보내 드려요. 이때는 환불 금액이 남지 않아요.`,
      },
      {
        id: "revgift-fee",
        q: "역조공을 보내는 데 얼마가 드나요?",
        a: `크리에이터가 보낼 때 상자마다 결제해요. ${revgiftFees}이에요. 팬 선물 요금에서 검수비를 뺀 금액이에요. 받는 팬은 결제하지 않아요.`,
      },
      {
        id: "refund-timing",
        q: "환불은 언제 되나요?",
        a: `돌려드리는 금액은 선물의 상태로 정해지고, 선물 상세의 결제 내역에 보여요. 결제한 수단으로 돌려받기까지 걸리는 기간은 ${toCheck("결제 수단별 환불이 들어오기까지 걸리는 기간")}이에요. 출고한 뒤에는 돌려드리는 금액이 없어요.`,
      },
      {
        id: "contact",
        q: "문의는 어디로 하나요?",
        a: `고객센터의 1:1 문의로 남겨 주세요. 이메일(${orBlank(SITE_INFO.supportEmail)})로도 받아요.`,
      },
    ],
  };
}
