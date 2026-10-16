import { CREATOR_CHECK_DAYS } from "@/entities/parcel/model/creator-check";
import { OVERSIZE_RULE } from "@/entities/parcel/model/size-tier";
import { OPERATOR_NAME, PROMISE } from "@/shared/config/site-copy";
import type { LegalDoc } from "./legal-doc";

// 검수 기준. 근거: 이용약관 제8·10조(terms-doc.ts) · office-workflow INV-W4·W8 · address-protection INV-P10 · design-rules 6절·8-1.
// 상자를 여는 조건은 탐지기 반응뿐이다(docs/reference/addendum-4-vs-now.md 5절).

const WAIT = `${CREATOR_CHECK_DAYS}일`;

export const INSPECTION_DOC: LegalDoc = {
  title: "검수 기준",
  lead: `${PROMISE.inspection} ${PROMISE.inspectionOpen}`,
  summary: [
    "모든 상자는 원래 송장을 떼고 겉면을 검사해요.",
    "팬 선물은 블루투스·RF·금속 탐지기로 검사하고, 반응이 있는 상자만 열어 확인해요.",
    "탐지기가 반응하지 않는 물품까지 모두 찾아낸다고 보장하지는 않아요.",
  ],
  facts: [["운영", OPERATOR_NAME]],
  sections: [
    {
      id: "every-box",
      title: "모든 상자에 하는 일",
      blocks: [
        {
          kind: "steps",
          items: [
            "상자가 사무실에 도착하면 팬이 붙인 원래 송장을 떼어요.",
            "뗀 원래 송장은 그 상자의 내부 QR 번호가 적힌 봉투에 넣어 상자와 따로 보관해요.",
            "상자에는 팬꾹의 내부 라벨을 붙여요.",
            "내부 라벨의 QR에는 주문번호만 들어가요. 주소는 들어가지 않아요.",
            "상자의 겉면을 검사해요.",
            "팬 선물은 상자의 크기와 무게를 재요. 등록한 구간보다 크면 차액 결제를 요청해요.",
            "상자가 반송되거나 출고되면 보관하던 원래 송장을 파쇄하고, 누가 언제 파쇄했는지 기록해요.",
          ],
        },
      ],
    },
    {
      id: "detect",
      title: "팬 선물의 탐지기 검사",
      blocks: [
        {
          kind: "steps",
          items: [
            "팬 선물은 블루투스·RF·금속 탐지기로 검사해요.",
            "탐지기 반응이 없는 상자는 열지 않아요.",
            "탐지기 반응이 있는 상자만 열어 확인해요.",
            "금속 반응이 있으면 상자를 열어 보낼 수 없는 물품인지 확인해요.",
            "블루투스·RF 반응이 있으면 상자를 열어 추적 장치인지 확인해요.",
          ],
        },
      ],
    },
    {
      id: "tracker",
      title: "추적 장치가 나왔을 때",
      blocks: [
        {
          kind: "steps",
          items: [
            "추적 장치가 확인된 상자는 크리에이터에게 보내지 않아요.",
            "그 상자는 보관하지 않고 보낸 팬에게 바로 돌려보내 드려요.",
            "크리에이터와 보낸 팬에게 알림을 보내요.",
            "이때는 검수비와 반송 택배비를 빼므로 환불 금액이 남지 않아요.",
          ],
        },
      ],
    },
    {
      id: "not-tracker",
      title: "반응이 있었지만 추적 장치가 아닐 때",
      blocks: [
        {
          kind: "steps",
          items: [
            "블루투스·RF 반응이 있었지만 추적 장치가 아닌 상자는 바로 보내지 않아요.",
            "크리에이터에게 그 상자를 받을지 물어요.",
            "크리에이터가 받기를 고르면 다른 상자와 함께 출고해요.",
            `크리에이터가 돌려보내기를 고르거나 ${WAIT} 안에 답하지 않으면 팬에게 돌려보내 드려요.`,
            "이렇게 돌려보내는 상자도 검수비와 반송 택배비를 빼므로 환불 금액이 남지 않아요.",
          ],
        },
      ],
    },
    {
      id: "return",
      title: "돌려보내는 상자",
      blocks: [
        {
          kind: "steps",
          items: [
            "보낼 수 없는 물품이 나온 상자는 팬에게 돌려보내 드려요.",
            `${OVERSIZE_RULE}도 팬에게 돌려보내 드려요.`,
            "보낼 수 없는 물품 목록은 선물 보내기 화면과 크리에이터 페이지에 있어요.",
            "돌려보낼 때는 처음 상자에 붙어 있던 원래 송장의 주소로 보내요.",
          ],
        },
      ],
    },
    {
      id: "revgift",
      title: "역조공 상자",
      blocks: [
        {
          kind: "steps",
          items: [
            "역조공 상자는 추적 장치 검사를 하지 않아요.",
            "겉면과 크기·무게, 보낼 수 없는 물품이 있는지만 확인해요.",
          ],
        },
      ],
    },
    {
      id: "records",
      title: "검수 기록",
      blocks: [
        {
          kind: "steps",
          items: [
            "검수 기록(장비·시각·결과·담당자)은 상자마다 남겨요.",
            "남긴 검수 기록은 고치거나 지우지 않아요.",
            "검수 사진은 공개하지 않아요.",
          ],
        },
      ],
    },
    {
      id: "limits",
      title: "검수의 한계",
      blocks: [
        {
          kind: "steps",
          items: [
            "검수는 탐지기 반응과 겉면 검사로 해요.",
            "탐지기 반응이 없는 상자는 열지 않으므로 안에 든 물품을 하나하나 확인하지 않아요.",
            "탐지기가 반응하지 않는 물품까지 모두 찾아낸다고 보장하지는 않아요.",
          ],
        },
      ],
    },
  ],
};
