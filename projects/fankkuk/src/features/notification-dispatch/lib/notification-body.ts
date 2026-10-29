import { giftDetailHref } from "@/entities/action-item/model/action-items";
import { NOTIFICATION_POLICY, type NotificationAudience, type NotificationKind } from "@/entities/notification/model/delivery-policy";
import { DECLINED_PHRASE, EXPIRED_TEXT } from "@/entities/order/ui/fan-stage-copy";
import { CREATOR_ACTION_CENTER_HREF } from "@/entities/action-item/model/creator-action-items";
import { CREATOR_CHECK_DAYS } from "@/entities/parcel/model/creator-check";
import { formatDeadline, formatMonthDayKo } from "@/shared/lib/format/datetime";

// 알림 본문 틀 (notifications INV-N1·N9). 카카오 알림톡과 이메일이 같은 틀을 쓴다(INV-N7) — 카카오 템플릿도 이 문구로 심사받는다.
// 본문은 잠금 화면·메일함·대행사 서버처럼 우리가 지킬 수 없는 곳에 남는다. 그래서 받는 칸을 아래 여섯으로 묶어
// 품목·상대방·주소·연락처·운송장 번호가 섞일 자리를 만들지 않는다. 누가 무엇을 보냈는지는 링크를 열고 로그인한 뒤에만 보인다.
// 링크는 설정의 사이트 주소 + 고정 경로(+주문번호, 할 일이면 고정 조각 #todo — action-center INV-J13)뿐이다. 요청 헤더로 만들지 않고, 링크 자체로는 아무것도 처리하지 않는다(INV-N9).

// box_arrived: 상자 하나가 입고됐다고 그 주문의 주인(보낸 팬 · 역조공이면 보낸 크리에이터)에게 한 번(inbound-address-code INV-C8).
//   본문에 받는 주소 6자리·사무실 주소를 넣지 않는다(INV-C2) — 이 틀에는 그 칸이 아예 없다.
// hold_fan: 상자를 보낸 팬에게 돌려보낼 때 「돌려보낼 상자」(INV-N13) — 추적기 반송(2026-10-12 D2), 크리에이터가 돌려보냄,
//   크리에이터 확인 기한 지남(2026-10-12 (2) D3 ②)이 모두 이 종류·같은 본문이다. 무엇이 나왔는지·누가 돌려보냈는지 쓰는 칸이 없다.
// box_missing: 결제 완료 + 7·14일에 아직 안 온 상자가 있으면 보낸 팬에게 때마다 한 번, 25일에 마감 안내 한 번(INV-N15, 2026-10-21 — 차례 1·2·3).
//   6자리·주소 칸이 없다. 「아직 보내지 않음」·「1:1 문의하기」는 링크로 여는 선물 상세에 있다(본문 틀은 버튼 하나).
// gift_pending_box: 받는 주소를 본 적이 있는 주문이 거절·반려될 때 아직 안 온 상자가 있으면 보낸 팬에게 한 번(INV-N17, 2026-10-10).
//   거절·7일 반려·차단 거절 모두 같은 종류·같은 본문이다(INV-N2). 6자리·주소 칸이 없다.
// gift_undelivered: 받는 주소를 본 적이 없는(상자가 하나도 오지 않은) 주문이 거절·반려될 때 보낸 팬에게 한 번(INV-N17 ②, 2026-10-12 문제집 D11).
//   화면(C2)과 같은 뜻을 전한다(2026-10-12 (2) D11) — 직접·차단 거절은 「선물을 원하지 않아요」, 7일 반려는 「승인 기한이 지나 자동 반려되었습니다」.
//   어느 문구인지는 꺼낸 줄의 undelivered_reason(DB 가 주문 상태로 정한 값)이 정한다. 차단 거절도 declined 라 차단은 드러나지 않는다(decline-block INV-D5).
//   크리에이터 이름은 넣지 않는다(INV-N1) — 화면의 「OO님이」 대신 「크리에이터가」.
// creator_check: 추적기 아님 블루투스·RF 상자를 받을지 크리에이터에게 묻는다(2026-10-12 (2) D3 ②). 보낸 팬·검출 내용 칸이 없다(INV-N1) —
//   무엇이 나왔는지는 승인·받은 선물 화면을 열면 보인다.
// 꼭 가는 알림에는 「꺼 두어도 가요」, 나머지에는 「끌 수 있어요」를 붙인다 — 고르는 값은 꺼낸 줄의 must_deliver(DB 판정, INV-N6)다.
//   연락처를 내줄지도 같은 DB 판정이 정하므로, 앱 목록이 DB 와 어긋나도 본문 안내는 실제 발송과 같다.
//   「끌 수 있어요」는 받는 사람의 설정 자리를 가리킨다 — 팬은 내 팬꾹, 크리에이터는 내 팬꾹의 주소와 설정(design-rules 5절).
// difference_due: 사무실 실측이 신고보다 커서 차액 결제 요청이 생기면 보낸 팬에게 상자마다 한 번(INV-N18, 2026-10-09 카드 d55).
//   금액·실측 구간 칸이 없다 — 선물 상세를 열면 보인다.
// payment_canceled · difference_canceled: 「확인 필요」 결제를 대표가 전액 취소했을 때 보낸 팬에게 한 번(INV-N19, payment INV-M20, 2026-10-10).
//   첫 결제면 결제 전 주문이라 팬 화면에 없다 — 링크는 선물 등록. 차액이면 선물 상세. 금액 칸이 없다.
// gift_reply · gift_received: 크리에이터가 상자에 「받았어요」를 남길 때 보낸 팬에게 상자마다 한 번(gift-reply INV-G5, 2026-10-11).
//   답장이 있으면 「답장이 왔어요」, 확인만이면 「도착했다고 확인됐어요」. 크리에이터 이름·답장 내용 칸이 없다 — 선물 상세를 열면 보인다.
// box_no_code: 6자리 없이 온 상자가 송장 「보내는 분」으로 그 팬의 닉네임과 맞았고 결제 완료·입고 전 주문이 있으면 상자마다 한 번(INV-N21, 카드 d94).
//   본문은 「받는 주소 없이 보낸 상자가 있어요」와 「받는 주소 없이 보냈어요」 화면(선물 상세) 링크뿐 — 송장번호·택배사·도착일·크리에이터 이름·주문번호 줄은 없다.
// revgift_offer: 역조공 몫의 결제가 끝나면 받는 팬에게 한 번, 72시간 뒤 아직 받기 대기면 한 번 더(INV-N20, 2026-10-16). INV-N1 의 예외로 보낸 크리에이터
//   공개 이름 하나가 들어간다(팬이 누가 보냈는지 모르면 받을지 정할 수 없다). 링크는 그 몫 받기 화면.
// approval_request · creator_check 링크는 크리에이터 처리할 일(2026-10-16, INV-N9). 승인 요청은 그 주문의 승인 창을 여는 `?order=주문번호` 를 붙인다(2026-10-29, UX 명세 creator-actions).
// approval_request: 보낸 사람·선물 종류·개수는 적지 않는다 — 승인 화면에서만 보인다(INV-N1, 2026-10-29 카드 d2 답 ②). 알림톡 본문은 docs/copy/alimtalk-templates.md 2절.
// 종류 목록과 꼭 가는 알림 판정은 entities/notification 이 정본이다(INV-N6 표).
export { NOTIFICATION_KINDS, type NotificationKind } from "@/entities/notification/model/delivery-policy";

export type NotificationBodyInput = {
  kind: NotificationKind;
  /** 승인 요청의 재알림 차례(INV-N8). 다른 종류는 1. */
  round: 1 | 2 | 3;
  /** 받는 사람 자신의 닉네임 */
  nickname: string;
  orderNo: string;
  /** 승인 요청만 — 자동 반려 예정 시각(결제 완료 + 168시간) */
  autoRejectAt: string | null;
  /** 거절 알림(gift_undelivered)만 — 직접·차단 거절 declined · 7일 반려 expired. DB 가 정한 값이다 */
  undeliveredReason: "declined" | "expired" | null;
  /** 역조공 받기(revgift_offer)만 — 보낸 크리에이터의 공개 이름(INV-N20 · reverse-gift INV-R12). DB 가 꺼낸 줄에 넣은 값이고, 다른 종류는 본문에 쓰지 않는다 */
  senderName: string | null;
  /** 반송 주소 재알림(return_address_reminder)만 — 처분 예정 시각(반송 대기 + 720시간, INV-N22). DB 가 꺼낸 줄에 넣은 값이고, 다른 종류는 본문에 쓰지 않는다 */
  disposeDueAt: string | null;
  /** 꺼낸 줄의 꼭 가는 알림 표시(DB 판정, INV-N6) */
  mustDeliver: boolean;
  /** 설정의 사이트 주소(APP_ORIGIN) */
  appOrigin: string;
};

/** 승인 요청 알림의 링크 경로 — 처리할 일에서 그 주문의 승인 창을 연다(UX 명세 creator-actions) */
export function approvalRequestPath(orderNo: string): string {
  return `${CREATOR_ACTION_CENTER_HREF}?order=${encodeURIComponent(orderNo)}`;
}

export type NotificationBody = { subject: string; text: string; buttonLabel: string; link: string };

const ORDER_NO = /^[A-Z0-9][A-Z0-9-]{0,39}$/;

const FOOTER = "선물 상세 정보는 알림에 표시하지 않습니다. 로그인 후 위 링크에서 확인해 주세요.";
const FOOTER_OPTIONAL: Record<NotificationAudience, string> = {
  fan: "알림 수신 여부는 ‘계정 설정 > 알림’에서 변경할 수 있습니다.",
  creator: "알림 수신 여부는 ‘계정 설정 > 알림’에서 변경할 수 있습니다.",
};
const FOOTER_MUST = "서비스 이용에 필요한 필수 알림으로, 수신 설정과 관계없이 발송됩니다.";

const APPROVAL_SUBJECT = {
  1: "[팬꾹] 새 선물 승인 요청",
  2: "[팬꾹] 승인 대기 선물 도착",
  3: "[팬꾹] 선물 승인 기한 안내",
} as const;

/** 팬이 보낸 선물의 단계 알림 — 제목과 첫 문장 */
const FAN_STEP = {
  arrived: ["[팬꾹] 선물 입고 완료", "보내신 선물이 팬꾹에 도착했습니다."],
  inspected: ["[팬꾹] 선물 검수 완료", "보내신 선물의 검수가 완료되었습니다."],
  shipped: ["[팬꾹] 선물 출고 완료", "보내신 선물이 팬꾹에서 출고 처리되었습니다. 택배사 인계 후 배송이 진행됩니다."],
} as const;

/** 역조공 주문번호(RG-…)인가 — 역조공 상자 도착 알림은 보낸 크리에이터의 「보낸 역조공」 화면으로 잇는다 */
const REVGIFT_ORDER_NO = /^RG-/;

type Draft = { subject: string; lines: string[]; buttonLabel: string; path: string };

/** 알림 링크에 쓸 사이트 주소 — 경로 없는 http(s) 주소만(INV-N9). 아니면 던진다. */
export function siteOrigin(appOrigin: string): string {
  let url: URL;
  try {
    url = new URL(appOrigin);
  } catch {
    throw new Error("알림 링크의 사이트 주소가 주소가 아니다");
  }
  if (!/^https?:$/.test(url.protocol) || url.origin !== appOrigin.replace(/\/$/, "")) {
    throw new Error("알림 링크의 사이트 주소는 경로 없는 http(s) 주소여야 한다");
  }
  return url.origin;
}

function draftOf({ kind, round, nickname, orderNo, autoRejectAt, undeliveredReason, senderName, disposeDueAt }: NotificationBodyInput): Draft {
  const greet = `${nickname}님,`;
  const order = `주문번호 ${orderNo}`;
  switch (kind) {
    case "approval_request": {
      if (!autoRejectAt) throw new Error("승인 요청 알림에 자동 반려 예정 시각이 없다");
      return {
        subject: APPROVAL_SUBJECT[round],
        lines: [
          greet,
          round === 3 ? "아직 승인하지 않은 선물이 있습니다. 승인 기한을 확인해 주세요." : "승인 요청을 확인해 주세요.",
          order,
          `${formatDeadline(autoRejectAt)}까지 승인하지 않으면 자동 반려됩니다.`,
        ],
        buttonLabel: "승인 화면 열기",
        // 승인은 크리에이터 처리할 일에서 한다(2026-10-16 — 「승인 대기」 메뉴가 없어짐, INV-N9 · action-center INV-J5). 그 주문의 승인 창을 연다(2026-10-29)
        path: approvalRequestPath(orderNo),
      };
    }
    case "arrived":
    case "inspected":
    case "shipped": {
      const [subject, first] = FAN_STEP[kind];
      return { subject, lines: [greet, first, order], buttonLabel: "선물 보기", path: `/gifts/${orderNo}` };
    }
    case "box_arrived":
      // 상자 하나가 사무실에 도착해 입고됐다.
      return {
        subject: "[팬꾹] 상자 입고 완료",
        lines: [greet, "보내신 상자 하나가 팬꾹에 도착했습니다.", order],
        buttonLabel: "상자 확인하기",
        path: REVGIFT_ORDER_NO.test(orderNo) ? "/creator/revgifts" : `/gifts/${orderNo}`,
      };
    case "hold":
      // 추적 장치 발견 — 추적기 보관 상자의 신고 선택을 크리에이터에게 묻는다(INV-N13, office-workflow INV-W14, 2026-10-17 카드 d100).
      // 보낸 팬의 닉네임은 쓰지 않는다(INV-N1) — 들어간 처리할 일 화면에서 로그인한 크리에이터에게만 보인다.
      // 스펙 문장의 「보낸 분」은 용어집 2절에서 쓰지 않는 말이라 「보낸 사람」으로 쓴다. 기한은 블루투스 발견과 같은 7일(검수 완료 + 168시간)
      return {
        subject: "[팬꾹] 추적 장치 발견 안내",
        lines: [greet, "검수 중 추적 장치가 발견되었습니다.", `신고 여부를 선택해 주세요. 검수 완료 후 ${CREATOR_CHECK_DAYS}일 이내에 선택하지 않으면 반송 처리됩니다.`, order],
        buttonLabel: "확인하기",
        path: CREATOR_ACTION_CENTER_HREF,
      };
    case "hold_fan":
      // 무엇이 나왔는지·크리에이터가 알았다는 사실·신고 선택은 쓰지 않는다(INV-N13). 반송 주소를 확인해 달라는 말이 들어 있어
      // 같은 처리에서 반송 주소 알림(return_address)은 따로 가지 않는다(INV-N22)
      return {
        subject: "[팬꾹] 돌려보낼 상자가 있어요",
        lines: [greet, "검수를 통과하지 못한 상자가 있어요.", "돌려받을 주소를 확인해 주세요.", order],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
      };
    case "payment_canceled":
    case "difference_canceled": {
      const first = kind === "payment_canceled";
      return {
        subject: "[팬꾹] 결제를 취소했어요",
        lines: [
          greet,
          "결제 금액을 확인하지 못해 결제를 모두 취소했어요.",
          "카드사에 따라 돌려받기까지 며칠 걸릴 수 있어요.",
          first ? "선물을 보내시려면 다시 등록해 주세요." : "추가 결제를 다시 해 주세요.",
          order,
        ],
        buttonLabel: first ? "선물 다시 등록하기" : "선물 보기",
        path: first ? "/gifts/new" : `/gifts/${orderNo}`,
      };
    }
    case "box_missing": {
      // 30일(720시간)이 지나면 자동 처리가 그 상자를 닫는다(office-workflow INV-W10 · payment INV-M8). 25일 차례(3)는 마감 안내
      const first = round === 3 ? "5일 뒤 자동으로 취소되고 환불돼요" : "아직 선물이 팬꾹에 도착하지 않았어요";
      return {
        subject: `[팬꾹] ${first}`,
        lines: [
          greet,
          `${first}.`,
          "결제하고 30일이 지나도 도착하지 않으면 그 상자는 닫히고 그 상자 금액을 돌려드려요.",
          "상자가 하나도 도착하지 않았다면 선물이 취소되고 결제 금액을 모두 돌려드려요.",
          order,
        ],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
      };
    }
    case "gift_pending_box":
      // 거절의 종류는 쓰지 않는다(INV-N2). 상자 금액 − 배송비를 먼저 돌려주고, 늦게 오면 반송, 결제하고 30일 안에 안 오면 배송비도(payment INV-M18 ③, 2026-10-21)
      return {
        subject: "[팬꾹] 아직 도착하지 않은 상자가 있어요",
        lines: [
          greet,
          "아직 도착하지 않은 상자가 있어요.",
          "택배비를 뺀 금액을 먼저 돌려드려요.",
          "이미 보내셨다면 도착하는 대로 돌려보내 드려요. 결제하고 30일 안에 도착하지 않으면 택배비도 돌려드려요.",
          order,
        ],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
      };
    case "gift_undelivered": {
      // 거절했다는 뜻은 전하고(화면 C2 와 같은 말) 차단·크리에이터 이름은 쓰지 않는다(INV-N1·N2). 받는 주소를 본 적이 없는 주문이라 결제 금액 전부가 돌아간다(payment INV-M8)
      if (!undeliveredReason) throw new Error("거절 알림에 문구 갈래가 없다");
      const first = undeliveredReason === "expired" ? `보내신 선물의 ${EXPIRED_TEXT}` : `크리에이터가 ${DECLINED_PHRASE}`;
      return {
        subject: undeliveredReason === "expired" ? `[팬꾹] 보낸 선물의 ${EXPIRED_TEXT}` : `[팬꾹] 크리에이터가 ${DECLINED_PHRASE}`,
        lines: [greet, `${first}.`, "결제 금액은 돌려드려요.", order],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
      };
    }
    case "creator_check":
      // 받을지 정해 달라는 말과 기한뿐 — 보낸 팬·무엇이 나왔는지는 쓰지 않는다(INV-N1). 화면은 크리에이터 처리할 일의 블루투스 발견 줄(INV-N9·N13)
      return {
        subject: "[팬꾹] 선물 수령 여부 확인 요청",
        lines: [greet, "수령 여부를 확인할 상자가 있습니다.", `검수 완료 후 ${CREATOR_CHECK_DAYS}일 이내에 선택하지 않으면 반송 처리됩니다.`, order],
        buttonLabel: "확인하기",
        path: CREATOR_ACTION_CENTER_HREF,
      };
    case "revgift_offer": {
      // 보낸 크리에이터 이름과 그 몫의 선물 상세 링크뿐(INV-N20 · reverse-gift INV-R12) — 선물 내용·상자 크기·금액·주소·6자리 칸이 없다. 이름이 없으면 보내지 않는다
      // 링크는 「지금 할 일」 칸이 펼쳐진 상세(고정 조각 #todo — action-center INV-J12·J13, INV-N9). 여는 것만으로는 아무것도 처리하지 않는다
      const name = senderName?.trim();
      if (!name) throw new Error("역조공 받기 알림에 보낸 크리에이터 이름이 없다");
      return {
        subject: round === 1 ? `[팬꾹] ${name}님이 선물을 보냈어요` : `[팬꾹] ${name}님이 보낸 선물을 받을지 정해 주세요`,
        lines: [greet, round === 1 ? `${name}님이 선물을 보냈어요.` : `${name}님이 보낸 선물을 받을지 정해 주세요.`],
        buttonLabel: "선물 받기",
        path: giftDetailHref(orderNo, true),
      };
    }
    case "box_no_code":
      // 링크는 DB 가 고른 줄이 정한다(INV-N21, 카드 d96 ③): 팬 선물 주문이면 선물 상세의 「지금 할 일」 칸(#todo — 송장번호 입력, action-center INV-J13),
      // 역조공 몫(RG-)이면 보낸 역조공 화면(줄마다 「내 상자 찾기」). 몫 번호는 본문에 쓰지 않는다
      return {
        subject: "[팬꾹] 팬꾹 주소 없이 보낸 상자가 있어요",
        lines: [greet, "팬꾹 주소 없이 보낸 상자가 있어요."],
        buttonLabel: REVGIFT_ORDER_NO.test(orderNo) ? "내 상자 찾기" : "팬꾹 주소 없이 보냈어요",
        path: REVGIFT_ORDER_NO.test(orderNo) ? "/creator/revgifts" : giftDetailHref(orderNo, true),
      };
    case "difference_due":
      // 결제가 끝나야 송장이 나가고(payment INV-M12), 168시간 미납이면 반송 대상이다(INV-M13)
      return {
        subject: "[팬꾹] 추가 결제가 필요한 상자가 있어요",
        lines: [
          greet,
          "보내신 상자가 신청하신 크기보다 커서 추가 결제가 필요해요.",
          "추가 결제가 끝나면 크리에이터에게 보내 드려요.",
          "7일 안에 결제하지 않으면 보내신 주소로 돌려보내요.",
          order,
        ],
        buttonLabel: "추가 결제하기",
        path: `/gifts/${orderNo}`,
      };
    case "gift_reply":
      return {
        subject: "[팬꾹] 선물 답장 도착",
        lines: [greet, "보내신 선물에 답장이 도착했습니다.", order],
        buttonLabel: "답장 보기",
        path: `/gifts/${orderNo}`,
      };
    case "gift_received":
      return {
        subject: "[팬꾹] 크리에이터 수령 확인",
        lines: [greet, "크리에이터가 선물 수령을 확인했습니다.", order],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
      };
    case "return_address":
    case "return_address_reminder": {
      // 반송 주소 확인(INV-N22) — 반송 이유·주소·크리에이터 이름 칸이 없다(INV-N1). 문구는 용어집 return_address · dispose_due 행.
      // 링크는 팬 선물이면 선물 상세, 역조공 몫(RG-)이면 크리에이터 처리할 일(「보낸 역조공 반송 주소」 줄 — action-center INV-J5).
      // 재알림만 처분 예정 날짜(반송 대기 + 30일, 서울 날짜)를 적는다 — 날짜가 없으면 만들지 않는다
      const path = REVGIFT_ORDER_NO.test(orderNo) ? CREATOR_ACTION_CENTER_HREF : `/gifts/${orderNo}`;
      if (kind === "return_address") {
        return {
          subject: "[팬꾹] 돌려보낼 상자가 있어요",
          lines: [greet, "돌려보낼 상자가 있어요.", "돌려받을 주소를 확인해 주세요. 30일 안에 확인하지 않으면 상자를 처분해요.", order],
          buttonLabel: "반송 주소 확인하기",
          path,
        };
      }
      if (!disposeDueAt) throw new Error("반송 주소 재알림에 처분 예정 시각이 없다");
      // 7·14일(차례 1·2)은 같은 본문, 25일(차례 3)은 마감 안내(INV-N22, 2026-10-21)
      if (round === 3) {
        return {
          subject: "[팬꾹] 5일 뒤 상자를 처분해요",
          lines: [greet, "5일 뒤 상자를 처분해요.", `${formatMonthDayKo(disposeDueAt)}까지 확인하지 않으면 상자를 처분해요.`, order],
          buttonLabel: "반송 주소 확인하기",
          path,
        };
      }
      return {
        subject: "[팬꾹] 돌려받을 주소를 아직 확인하지 않았어요",
        lines: [greet, "돌려받을 주소를 아직 확인하지 않았어요.", `${formatMonthDayKo(disposeDueAt)}까지 확인하지 않으면 상자를 처분해요.`, order],
        buttonLabel: "반송 주소 확인하기",
        path,
      };
    }
    case "in_transit":
    case "delivered":
      // 팬과 크리에이터 둘 다 받는 종류인데 화면이 달라 받는 사람별 경로가 필요하다. 택배사 연결(INV-N12) 때 정한다.
      throw new Error("배송중·수령 알림은 아직 받는 사람별 경로가 없다");
  }
}

/** 받는 사람 — 종류별 표의 받는 쪽. 역조공 상자 도착은 보낸 크리에이터가 받는다 */
function audienceOf({ kind, orderNo }: NotificationBodyInput): NotificationAudience {
  if ((kind === "box_arrived" || kind === "box_no_code" || kind === "return_address" || kind === "return_address_reminder") && REVGIFT_ORDER_NO.test(orderNo)) return "creator";
  return NOTIFICATION_POLICY[kind].audience;
}

export function buildNotificationBody(input: NotificationBodyInput): NotificationBody {
  if (!ORDER_NO.test(input.orderNo)) throw new Error("알림 링크에 넣을 주문번호 형식이 아니다");
  const origin = siteOrigin(input.appOrigin);
  const d = draftOf(input);
  const link = `${origin}${d.path}`;
  return {
    subject: d.subject,
    text: [...d.lines, "", link, "", FOOTER, input.mustDeliver ? FOOTER_MUST : FOOTER_OPTIONAL[audienceOf(input)]].join("\n"),
    buttonLabel: d.buttonLabel,
    link,
  };
}

/** 받는 사람별 경로가 정해진 종류인가 — 배송중·수령은 택배사 연결 때 정한다(INV-N12) */
export function kindHasPath(kind: NotificationKind): boolean {
  return kind !== "in_transit" && kind !== "delivered";
}
