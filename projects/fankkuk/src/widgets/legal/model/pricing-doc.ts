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
    lead: "상자마다 드는 요금과 따로 결제하는 경우를 안내해 드려요.",
    summary: [
      "요금은 상자마다 받아요. 택배비와 검수비가 들어 있는 금액이에요.",
      "선물을 받는 크리에이터는 돈을 내지 않아요.",
      "사무실에서 잰 상자 크기가 등록한 크기보다 크면 차액을 따로 결제해 주세요.",
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
              "상자 크기는 세 변의 합과 무게를 각각 보고 더 큰 쪽으로 정해요.",
              `${OVERSIZE_RULE}는 받지 않아요.`,
              SERVICE_PERIOD,
              "요금이 바뀌면 바뀐 뒤에 등록한 선물부터 새 요금이 적용돼요.",
            ],
          },
        ],
      },
      {
        id: "difference",
        title: "차액(추가 결제)",
        blocks: [
          {
            kind: "steps",
            items: [
              "사무실에서 잰 상자 크기가 등록한 크기보다 크면 차액을 요청드려요.",
              "선물 상세의 「차액 결제」에서 차액을 결제해 주세요.",
              `검수가 끝난 때부터 ${DIFFERENCE_DEADLINE_DAYS}일 안에 결제하지 않으면 상자를 돌려보내 드려요. 이때는 검수에서 돌려보낼 때와 같이 환불 금액이 남지 않아요.`,
              "재 보니 등록한 크기보다 작아도 차액은 돌려드리지 않아요.",
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
              "취소한 때에 따라 돌려받는 금액은 취소·환불 규정에서 확인할 수 있어요.",
              "자세한 기준은 이용약관에서 확인해 주세요.",
              "더 궁금한 점은 고객센터의 1:1 문의로 남겨 주세요.",
            ],
          },
        ],
      },
    ],
  };
}
