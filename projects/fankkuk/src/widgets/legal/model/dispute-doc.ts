import { OPERATOR_NAME } from "@/shared/config/site-copy";
import { orBlank, SITE_INFO, type SiteInfo } from "@/shared/config/site-info";
import { toCheck, type LegalDoc } from "./legal-doc";

// 분쟁 처리 안내. 이용약관 제17·18조(terms-doc.ts)를 해요체로 푼 글이다. 근거: terms-doc.ts · DECISIONS 2026-10-08 ① · payment INV-M8·M14 · office-workflow INV-W4.
// 배상 한도는 약관과 같은 site-info 값을 읽는다.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function disputeDoc(info: SiteInfo = SITE_INFO): LegalDoc {
  return {
    title: "분쟁 처리 안내",
    lead: "선물이나 환불 때문에 생긴 불만을 어디에 알리고, 어떻게 처리되는지 적었어요.",
    summary: [
      "고객센터의 1:1 문의, 「신고·문의」, 이메일 중 편한 곳으로 알려 주세요.",
      "팬꾹이 맡은 상자가 없어지거나 부서지면 신고한 물품 가액을 한도로 배상해요.",
      "팬꾹에서 해결되지 않으면 한국소비자원(상담 1372)에 도움을 요청할 수 있어요.",
    ],
    facts: [["운영", OPERATOR_NAME]],
    sections: [
      {
        id: "contact",
        title: "접수하는 곳",
        blocks: [
          {
            kind: "steps",
            items: [
              "로그인한 뒤 고객센터의 1:1 문의로 알려 주세요.",
              "사이트 아래쪽의 「신고·문의」에서도 알릴 수 있어요.",
              `이메일 ${orBlank(info.supportEmail)}로 보내셔도 돼요.`,
              "선물에 관한 문의라면 주문번호(예: FC-7K3M9)를 같이 적어 주세요.",
            ],
          },
        ],
      },
      {
        id: "process",
        title: "처리 순서",
        blocks: [
          {
            kind: "steps",
            items: [
              "팬꾹이 접수한 내용을 확인해요.",
              "확인한 결과는 접수한 곳으로 답해 드려요.",
              `처리 기한: ${toCheck("처리 기한")}`,
            ],
          },
        ],
      },
      {
        id: "refund",
        title: "환불 금액이 궁금할 때",
        blocks: [
          {
            kind: "steps",
            items: [
              "환불 금액은 선물의 상태에 따라 정해져요. 담당자가 금액을 따로 정하지 않아요.",
              "실제 환불 금액은 선물 상세의 결제 내역에 숫자로 보여요.",
              "상태마다 얼마를 돌려드리는지는 「취소·환불 규정」에 적었어요.",
            ],
          },
        ],
      },
      {
        id: "records",
        title: "확인에 쓰는 기록",
        blocks: [
          {
            kind: "steps",
            items: [
              "검수 기록(장비·시각·결과·담당자)은 상자마다 남기고 고치지 않아요.",
              "검수 사진은 공개하지 않아요.",
              "크리에이터는 주소 열람 기록 화면에서 자기 선물의 주소가 열람된 기록을 모두 볼 수 있어요.",
            ],
          },
        ],
      },
      {
        id: "compensation",
        title: "상자가 없어지거나 부서졌을 때",
        blocks: [
          {
            kind: "steps",
            items: [
              "팬꾹이 맡은 상자가 없어지거나 부서지면 보낸 사람이 신고한 물품 가액을 한도로 배상해요.",
              `신고한 가액이 없으면 ${won(info.compensationCapKrw)}을 한도로 배상해요.`,
              "이 기준은 이용약관 제17조와 같아요.",
            ],
          },
          { kind: "text", text: `배상 한도 금액: ${toCheck("금액 — 법률 검토 전 초안")}` },
          { kind: "text", text: `배상하지 않는 경우와 택배 사고의 처리: ${toCheck("면책 사유와 택배 사고 처리")}` },
        ],
      },
      {
        id: "outside",
        title: "팬꾹에서 해결되지 않을 때",
        blocks: [
          {
            kind: "steps",
            items: [
              "한국소비자원에 상담이나 피해구제를 신청할 수 있어요.",
              "상담은 전화 1372(소비자상담센터)나 소비자24 누리집에서 받을 수 있어요.",
              "이용약관에 정하지 않은 일은 소비자분쟁해결기준(공정거래위원회 고시)을 따라요.",
              "소송은 민사소송법에 따른 관할법원에서 처리해요.",
            ],
          },
          { kind: "text", text: `소비자분쟁해결기준을 따르는 문구: ${toCheck("준용 문구")}` },
        ],
      },
    ],
  };
}
