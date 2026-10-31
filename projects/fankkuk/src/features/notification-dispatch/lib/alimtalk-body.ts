import { CREATOR_ACTION_CENTER_HREF } from "@/entities/action-item/model/creator-action-items";
import { readLoginLinkToken } from "@/entities/session/model/login-link";
import { positiveCount, type NotificationBodyInput, type NotificationKind } from "./notification-body";

// 카카오 알림톡 변수 (notifications INV-N1·N7). 알림톡은 솔라피에 검수받은 템플릿 본문과 글자 하나까지 같아야 나간다 —
// 본문은 대행사가 템플릿에 변수를 채워 만들고, 우리는 변수만 넘긴다. 템플릿 본문의 정본은 docs/copy/alimtalk-templates.md 다.
// 변수 이름도 그 문서 그대로(`#{닉네임}` 꼴). 문서를 고치면 이 파일을 같이 고친다 — alimtalk-body.test.ts 가 문서를 읽어 대조한다.
// 넘기는 값은 이메일 본문 틀(notification-body)과 같은 칸뿐이다(INV-N1).
// 묶음 알림 셋(승인 요청·승인 재알림·하루 묶음, notification-batching INV-NB1·NB2·NB5)은 주문번호 없이 건수만 넘긴다(INV-NB3).
// 템플릿이 문서에 없는 종류는 null — 그 종류에 템플릿 ID 가 들어 있어도 보내지 않는다(검수받은 본문과 다르다).

/** 템플릿 문서에 본문이 있고 코드가 그 변수를 채우는 종류 */
export const ALIMTALK_KINDS = [
  "approval_request",
  "approval_reminder",
  "box_arrived",
  "shipped",
  "in_transit",
  "delivered",
  "gift_reply",
  "status_digest",
] as const satisfies readonly NotificationKind[];

const REVGIFT_ORDER_NO = /^RG-/;

export type AlimtalkVariables = Record<string, string>;

const v = (name: string) => `#{${name}}`;

/** 그 종류의 알림톡 변수. 템플릿이 없거나 필요한 값이 비었으면 null. */
export function buildAlimtalkVariables(input: NotificationBodyInput): AlimtalkVariables | null {
  switch (input.kind) {
    case "approval_request": {
      const waiting = positiveCount(input.waitingCount);
      return waiting === null ? null : { [v("건수")]: String(waiting) };
    }
    case "approval_reminder": {
      const waiting = positiveCount(input.waitingCount);
      const days = positiveCount(input.daysLeft);
      return waiting === null || days === null ? null : { [v("건수")]: String(waiting), [v("일수")]: String(days) };
    }
    case "status_digest": {
      // 링크는 이메일 본문과 같다 — 팬 선물 목록, 크리에이터 처리할 일(INV-NB5 ②)
      const items = positiveCount(input.itemCount);
      if (items === null) return null;
      return { [v("닉네임")]: input.nickname, [v("건수")]: String(items), [v("경로")]: input.recipientIsCreator ? CREATOR_ACTION_CENTER_HREF : "/gifts" };
    }
    default:
      break;
  }
  if (!input.orderNo) return null;
  const base = { [v("닉네임")]: input.nickname, [v("주문번호")]: input.orderNo };
  switch (input.kind) {
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

/** link-login: 템플릿 문서 10절의 키 — 승인 요청과 본문이 같고 버튼만 토큰 링크인 템플릿. 템플릿 ID 는 승인 요청 줄의 login_link_template_code */
export const LOGIN_LINK_TEMPLATE_KEY = "approval_request_login_link";
/** link-login INV-K1: 토큰을 담는 변수 — 버튼 주소 `https://fankkuk.com/login/link#t=#{token}` (# 뒤라 서버 요청 기록에 남지 않는다) */
export const LOGIN_LINK_TOKEN_VARIABLE = v("token");

/** link-login INV-K1: 로그인 링크 템플릿의 변수 — 승인 요청의 변수 + 토큰. 승인 요청이 아니거나 토큰 꼴이 아니면 null. */
export function buildLoginLinkAlimtalkVariables(input: NotificationBodyInput, token: string): AlimtalkVariables | null {
  if (input.kind !== "approval_request" || !readLoginLinkToken(token)) return null;
  const base = buildAlimtalkVariables(input);
  return base ? { ...base, [LOGIN_LINK_TOKEN_VARIABLE]: token } : null;
}
