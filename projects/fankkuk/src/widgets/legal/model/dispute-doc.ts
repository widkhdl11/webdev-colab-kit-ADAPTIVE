import { OPERATOR_NAME } from "@/shared/config/site-copy";
import { orBlank, SITE_INFO, type SiteInfo } from "@/shared/config/site-info";
import { toCheck, type LegalDoc } from "./legal-doc";

// 분쟁 처리 안내. 이용약관 제17·18조(terms-doc.ts)를 해요체로 푼 글이다. 근거: terms-doc.ts · DECISIONS 2026-10-08 ① · payment INV-M8·M14 · office-workflow INV-W4.
// 배상 한도는 약관과 같은 site-info 값을 읽는다.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function disputeDoc(info: SiteInfo = SITE_INFO): LegalDoc {
  return {
    title: "분쟁 처리 안내",
    lead: "선물이나 환불과 관련된 불만·분쟁의 접수 방법과 처리 절차를 안내합니다.",
    summary: [
      "고객센터의 1:1 문의, 「신고·문의」, 이메일 중 편한 곳으로 알려 주세요.",
      "팬꾹이 보관·처리하는 상자가 분실되거나 파손되면 신고한 물품 가액을 한도로 배상합니다.",
      "팬꾹에서 해결되지 않으면 한국소비자원(상담 1372)에 도움을 요청할 수 있습니다.",
    ],
    facts: [["운영", OPERATOR_NAME]],
    sections: [
      {
        id: "contact",
        title: "문의·분쟁 접수 방법",
        blocks: [
          {
            kind: "steps",
            items: [
              "로그인한 뒤 고객센터의 1:1 문의를 이용해 주세요.",
              "사이트 아래쪽의 「신고·문의」에서도 알릴 수 있습니다.",
              `이메일(${orBlank(info.supportEmail)})로도 문의할 수 있습니다.`,
              "선물에 관한 문의라면 주문번호(예: FC-7K3M9)를 같이 입력해 주세요.",
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
              "팬꾹이 접수한 내용을 확인합니다.",
              "확인 결과는 문의를 접수한 경로로 안내합니다.",
              `처리 기한: ${toCheck("처리 기한")}`,
            ],
          },
        ],
      },
      {
        id: "refund",
        title: "환불 금액 확인",
        blocks: [
          {
            kind: "steps",
            items: [
              "환불 금액은 선물의 상태에 따라 정해집니다. 담당자가 금액을 따로 정하지 않습니다.",
              "실제 환불 금액은 선물 상세의 결제 내역에서 확인할 수 있습니다.",
              "진행 상태별 환불 기준은 「취소·환불 규정」에서 확인해 주세요.",
            ],
          },
        ],
      },
      {
        id: "records",
        title: "사실 확인에 사용하는 기록",
        blocks: [
          {
            kind: "steps",
            items: [
              "검수 기록(장비·시각·결과·담당자)은 상자마다 남기며 임의로 수정하지 않습니다.",
              "검수 사진은 공개하지 않습니다.",
              "크리에이터는 「주소 열람 기록」 화면에서 자신의 선물에 관한 주소 열람 기록을 모두 확인할 수 있습니다.",
            ],
          },
        ],
      },
      {
        id: "compensation",
        title: "상자 분실·파손 시 배상",
        blocks: [
          {
            kind: "steps",
            items: [
              "팬꾹이 보관·처리하는 상자가 분실되거나 파손되면 보낸 사람이 신고한 물품 가액을 한도로 배상합니다.",
              `신고한 가액이 없으면 ${won(info.compensationCapKrw)}을 한도로 배상합니다.`,
              "이용약관 제17조와 동일한 기준입니다.",
            ],
          },
          { kind: "text", text: `배상 한도 금액: ${toCheck("금액 — 법률 검토 전 초안")}` },
          { kind: "text", text: `배상하지 않는 경우와 택배 사고의 처리: ${toCheck("면책 사유와 택배 사고 처리")}` },
        ],
      },
      {
        id: "outside",
        title: "외부 분쟁 해결 절차",
        blocks: [
          {
            kind: "steps",
            items: [
              "한국소비자원에 상담이나 피해구제를 신청할 수 있습니다.",
              "상담은 전화 1372(소비자상담센터)나 소비자24 누리집에서 받을 수 있습니다.",
              "이용약관에서 정하지 않은 사항은 소비자분쟁해결기준(공정거래위원회 고시)을 따릅니다.",
              "소송은 민사소송법에 따른 관할법원에서 처리합니다.",
            ],
          },
          { kind: "text", text: `소비자분쟁해결기준을 따르는 문구: ${toCheck("준용 문구")}` },
        ],
      },
    ],
  };
}
