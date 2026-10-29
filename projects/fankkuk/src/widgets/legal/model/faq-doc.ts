import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { DIFFERENCE_DEADLINE_DAYS } from "@/entities/payment/config/difference-deadline";
import { INTAKE_LIMIT_TEXT, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
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
  const giftFees = PRICED_TIERS.map((t) => `• ${PARCEL_TIER_GUIDE[t].name}: ${won(prices[t].priceKrw)} · ${PARCEL_TIER_GUIDE[t].rule}`).join("\n");
  const revgiftFees = PRICED_TIERS.map((t) => `${PARCEL_TIER_GUIDE[t].name} ${won(prices[t].revgiftPriceKrw)}`).join(", ");
  return {
    summary: [
      "상자별 요금 적용 · 크리에이터에게 보내는 배송비·검수비·서비스료 포함",
      PROMISE.approval,
      "더 궁금한 점이 있다면 고객센터에 1:1 문의를 남겨 주세요.",
    ],
    items: [
      {
        id: "fee",
        q: "요금은 얼마인가요?",
        a: `상자별 요금 · 크리에이터에게 보내는 배송비·검수비·서비스료 포함\n${giftFees}\n크기·무게 중 더 높은 요금 구간을 적용합니다. 접수 한도는 ${INTAKE_LIMIT_TEXT}입니다.`,
      },
      {
        id: "delivery-time",
        q: "크리에이터에게 도착하기까지 얼마나 걸리나요?",
        a: `크리에이터의 승인과 검수가 모두 끝난 상자만 출고합니다. 사무실에 도착한 뒤 출고까지 걸리는 기간은 ${toCheck("입고부터 출고까지 걸리는 기간")}입니다. 진행 상황은 선물 상세에서 볼 수 있습니다.`,
      },
      {
        id: "decline",
        q: "크리에이터가 받지 않으면 어떻게 되나요?",
        a: `크리에이터가 거절하거나 결제 후 ${APPROVAL_DEADLINE_DAYS}일 이내에 승인하지 않으면 선물은 배송하지 않습니다. 거절 사유는 공개하지 않습니다.\n• 입고 전·팬꾹 주소 미표시: 전액 환불\n• 입고 전·팬꾹 주소 표시: 반송 택배비를 제외한 금액 우선 환불. 결제 후 30일 이내 도착하면 반송하며 추가 환불은 없음. 30일이 지나도 도착하지 않으면 보류한 택배비까지 환불\n• 입고 후: 확인한 반송 주소로 보내고, 상자별 결제 금액에서 반송 택배비를 제외해 환불\n• 검수 불합격 상자: 환불 금액 없음`,
      },
      {
        id: "creator-waybill",
        q: "크리에이터에게 보낸 상자의 송장번호를 볼 수 있나요?",
        a: "크리에이터에게 배송하는 상자의 송장번호는 공개하지 않습니다. 배송 조회 시 크리에이터 배송지 일부가 노출될 수 있기 때문입니다.\n팬이 선물 상세에 입력하는 번호는 팬꾹으로 보내는 상자의 송장번호입니다.",
      },
      {
        id: "address-per-box",
        q: "팬꾹 주소가 상자마다 다른 이유는 무엇인가요?",
        a: "팬꾹 사무실 주소 끝에 상자별 6자리를 붙여 각 상자를 구분하기 때문입니다. 팬꾹은 이 6자리로 선물과 상자를 확인합니다. 상자마다 안내된 주소를 끝 6자리까지 모두 입력해 주세요.",
      },
      {
        id: "sent-without-address",
        q: "팬꾹 주소 끝 6자리를 빠뜨렸어요. 어떻게 하나요?",
        a: "송장에 팬꾹 닉네임을 적었는지에 따라 확인 방법이 다릅니다.\n• 닉네임 있음: 선물 상세의 ‘주소 끝 6자리 없이 보낸 상자 찾기’에 택배사와 송장번호 입력\n• 닉네임 없음: ‘물품 보관소 > 내 물품 확인’에서 송장번호와 택배사로 확인 요청. 팬꾹에서 확인 후 해당 선물에 연결\n• 송장번호를 모름: 1:1 문의로 보낸 사람의 이름·주소·전화번호와 내용물 전달. 팬꾹에서 전화번호 뒤 4자리로 상자를 찾고 원래 송장과 대조한 뒤 연결\n입고 후 30일 이내에 선물과 연결되지 않은 상자는 원래 송장의 보낸 사람 주소로 착불 반송합니다.",
      },
      {
        id: "creator-approve",
        q: "크리에이터는 선물을 어떻게 승인하나요?",
        a: `승인 요청이 오면 선물마다 카카오톡 인증서로 서명해 승인해 주세요. 한꺼번에 승인하는 기능은 없습니다. 결제가 끝난 때부터 ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않으면 기한이 지나 받지 않은 선물로 처리됩니다.`,
      },
      {
        id: "size-difference",
        q: "실제 상자 크기가 등록한 크기보다 크면 어떻게 되나요?",
        a: `실측 요금 구간이 선택한 구간을 초과하면 차액을 결제해야 합니다. 차액을 결제하기 전에는 출고하지 않습니다. 검수가 끝난 때부터 ${DIFFERENCE_DEADLINE_DAYS}일 안에 결제하지 않으면 상자를 돌려보내며, 이때는 검수 기준에 맞지 않는 상자와 마찬가지로 환불 금액이 없습니다.`,
      },
      {
        id: "revgift-fee",
        q: "역조공 요금은 얼마인가요?",
        a: `크리에이터가 보낼 때 상자마다 결제합니다. ${revgiftFees}입니다. 팬 선물 요금에서 검수비를 뺀 금액입니다. 받는 팬은 결제하지 않습니다.`,
      },
      {
        id: "refund-timing",
        q: "환불은 언제 처리되나요?",
        a: `환불 금액은 진행 상태에 따라 산정하며 ‘선물 상세 > 결제 내역’에서 확인할 수 있습니다.\n결제 수단별 환불 반영 기간: ${toCheck("결제 수단별 환불이 들어오기까지 걸리는 기간")}\n출고 후에는 환불 금액이 없습니다.`,
      },
      {
        id: "contact",
        q: "문의는 어디에 남기면 되나요?",
        a: `고객센터에 1:1 문의를 남겨 주세요. 이메일(${orBlank(SITE_INFO.supportEmail)})로도 문의할 수 있습니다.`,
      },
    ],
  };
}
