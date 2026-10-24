import { DIFFERENCE_DEADLINE_DAYS } from "@/entities/payment/config/difference-deadline";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
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
    lead: "상자별 요금과 차액 결제 기준을 안내해 드려요.",
    summary: [
      "요금은 상자마다 정해지며, 배송비·검수비·서비스료가 포함돼 있어요.",
      "선물을 받는 크리에이터는 비용을 부담하지 않아요.",
      "사무실에서 측정한 상자의 요금 구간이 등록한 구간보다 높으면 차액을 결제해야 해요.",
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
              "상자의 크기와 무게를 각각 확인해 더 높은 요금 구간을 적용해요.",
              `${OVERSIZE_RULE}는 받지 않아요.`,
              SERVICE_PERIOD,
              "요금이 바뀌면 바뀐 뒤에 등록한 선물부터 새 요금이 적용돼요.",
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
              "사무실에서 측정한 상자의 요금 구간이 등록한 구간보다 높으면 차액 결제를 요청해요.",
              "선물 상세의 「차액 결제」에서 차액을 결제해 주세요.",
              `검수가 끝난 때부터 ${DIFFERENCE_DEADLINE_DAYS}일 안에 차액을 결제하지 않으면 상자를 돌려보내요. 이때는 검수 기준에 맞지 않는 상자와 마찬가지로 환불 금액이 없어요.`,
              "실제 측정한 요금 구간이 등록한 구간보다 낮더라도 차액은 환불하지 않아요.",
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
              "선물의 진행 상태별 환불 금액은 「취소·환불 규정」에서 확인할 수 있어요.",
              "자세한 기준은 이용약관에서 확인해 주세요.",
              "더 궁금한 점은 고객센터의 1:1 문의로 남겨 주세요.",
            ],
          },
        ],
      },
    ],
  };
}
