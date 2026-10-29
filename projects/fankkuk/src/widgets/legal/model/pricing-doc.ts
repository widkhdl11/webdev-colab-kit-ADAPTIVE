import { DIFFERENCE_DEADLINE_DAYS } from "@/entities/payment/config/difference-deadline";
import { INTAKE_LIMIT_TEXT, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { OPERATOR_NAME, SERVICE_PERIOD } from "@/shared/config/site-copy";
import type { LegalDoc } from "./legal-doc";

// 요금 안내(/pricing). 결제대행사 가맹 심사에서 상품·가격을 공개 페이지로 확인한다(2026-10-22 사용자).
// 문장은 이용 안내(guide-fan-doc·guide-creator-doc)에 이미 있는 것을 그대로 쓴다 — 두 글과 이 글이 다른 말을 하지 않게.
// 요금 숫자는 page 가 읽어 넘긴 공개 요금표(결제와 같은 DB 값).
// 역조공 요금 열은 2026-10-24 카드사 심사 때 뺐다(사용자) — 역조공 요금은 크리에이터 이용 안내에 남아 있다.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function pricingDoc(prices: PublicPriceTable): LegalDoc {
  return {
    title: "요금 안내",
    lead: "상자별 요금·접수 한도·추가 결제 기준을 확인해 주세요.",
    summary: [
      "상자별 요금 적용 · 크리에이터에게 보내는 배송비·검수비·서비스료 포함",
      "받는 크리에이터의 비용 부담 없음",
      "실측 요금 구간이 선택한 구간을 초과하면 차액을 결제해야 합니다.",
    ],
    facts: [["운영", OPERATOR_NAME]],
    sections: [
      {
        id: "fee",
        title: "상자 요금",
        blocks: [
          {
            kind: "prices",
            columns: ["선물"],
            rows: PRICED_TIERS.map((t) => ({
              name: PARCEL_TIER_GUIDE[t].name,
              rule: PARCEL_TIER_GUIDE[t].rule,
              amounts: [won(prices[t].priceKrw)],
            })),
          },
          {
            kind: "list",
            items: [
              "크기·무게 중 더 높은 요금 구간 적용",
              `접수 한도: ${INTAKE_LIMIT_TEXT}`,
              SERVICE_PERIOD,
              "변경된 요금은 변경 후 등록한 선물부터 적용합니다. 이미 결제한 선물에는 결제 당시 요금을 적용합니다.",
            ],
          },
        ],
      },
      {
        id: "difference",
        title: "차액 결제",
        blocks: [
          {
            kind: "steps",
            items: [
              "사무실에서 측정한 상자의 요금 구간이 등록한 구간보다 높으면 차액 결제를 요청합니다.",
              "선물 상세의 ‘지금 할 일 > 추가 결제’에서 결제 버튼을 눌러 주세요.",
              `검수가 끝난 때부터 ${DIFFERENCE_DEADLINE_DAYS}일 안에 차액을 결제하지 않으면 상자를 반송합니다. 이때는 검수 기준에 맞지 않는 상자와 마찬가지로 환불 금액이 없습니다.`,
              "실제 측정한 요금 구간이 등록한 구간보다 낮더라도 차액은 환불하지 않습니다.",
            ],
          },
        ],
      },
      {
        id: "refund",
        title: "취소와 환불",
        blocks: [
          {
            kind: "list",
            items: [
              "선물의 진행 상태별 환불 금액은 「취소·환불 규정」에서 확인할 수 있습니다.",
              "자세한 기준은 이용약관에서 확인해 주세요.",
              "더 궁금한 점은 고객센터의 1:1 문의로 남겨 주세요.",
            ],
          },
        ],
      },
    ],
  };
}
