import { formatDeadline } from "@/shared/lib/format/datetime";
import type { NotificationBodyInput, NotificationKind } from "./notification-body";

// 카카오 알림톡 변수 (notifications INV-N1·N7). 알림톡은 솔라피에 검수받은 템플릿 본문과 글자 하나까지 같아야 나간다 —
// 본문은 대행사가 템플릿에 변수를 채워 만들고, 우리는 변수만 넘긴다. 템플릿 본문의 정본은 docs/copy/alimtalk-templates.md 다.
// 변수 이름도 그 문서 그대로(`#{닉네임}` 꼴). 문서를 고치면 이 파일을 같이 고친다 — alimtalk-body.test.ts 가 문서를 읽어 대조한다.
// 넘기는 값은 이메일 본문 틀(notification-body)과 같은 칸뿐이다(INV-N1).
// 승인 요청(approval_request)은 재알림 세 차례(INV-N8)가 템플릿 하나를 같이 쓴다 — 템플릿은 종류마다 하나라서, 차례는 변수로 넘기지 않는다.
// 보낸 팬·선물 종류·개수는 넘기지 않는다(2026-10-29 카드 d2 답 ②).
// 템플릿이 문서에 없는 종류는 null — 그 종류에 템플릿 ID 가 들어 있어도 보내지 않는다(검수받지 않은 본문이다).

/** 템플릿 문서에 본문이 있는 종류 */
export const ALIMTALK_KINDS = ["approval_request", "box_arrived", "shipped", "in_transit", "delivered", "gift_reply"] as const satisfies readonly NotificationKind[];

const REVGIFT_ORDER_NO = /^RG-/;

export type AlimtalkVariables = Record<string, string>;

const v = (name: string) => `#{${name}}`;

/** 그 종류의 알림톡 변수. 템플릿이 없거나 필요한 값이 비었으면 null. */
export function buildAlimtalkVariables(input: NotificationBodyInput): AlimtalkVariables | null {
  const base = { [v("닉네임")]: input.nickname, [v("주문번호")]: input.orderNo };
  switch (input.kind) {
    case "approval_request":
      // 이메일 본문과 같은 기한 줄(INV-N8) — 시각이 없으면 보내지 않는다
      return input.autoRejectAt ? { ...base, [v("반려시각")]: formatDeadline(input.autoRejectAt) } : null;
    case "box_arrived":
      // 이메일 본문과 같은 경로 — 역조공이면 보낸 역조공 화면(notification-body)
      return { ...base, [v("경로")]: REVGIFT_ORDER_NO.test(input.orderNo) ? "/creator/revgifts" : `/gifts/${input.orderNo}` };
    case "shipped":
    case "in_transit":
    case "delivered":
    case "gift_reply":
      return base;
    default:
      return null;
  }
}
