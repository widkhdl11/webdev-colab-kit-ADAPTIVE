import { isMustDeliver, type NotificationKind } from "@/entities/notification/model/delivery-policy";
import { formatDeadline } from "@/shared/lib/format/datetime";

// 알림 본문 틀 (notifications INV-N1·N9). 카카오 알림톡과 이메일이 같은 틀을 쓴다(INV-N7) — 카카오 템플릿도 이 문구로 심사받는다.
// 본문은 잠금 화면·메일함·대행사 서버처럼 우리가 지킬 수 없는 곳에 남는다. 그래서 받는 칸을 아래 여섯으로 묶어
// 품목·상대방·주소·연락처·운송장 번호가 섞일 자리를 만들지 않는다. 누가 무엇을 보냈는지는 링크를 열고 로그인한 뒤에만 보인다.
// 링크는 설정의 사이트 주소 + 고정 경로(+주문번호)뿐이다. 요청 헤더로 만들지 않고, 링크 자체로는 아무것도 처리하지 않는다(INV-N9).

// box_arrived: 상자 하나가 입고됐다고 그 주문의 주인(보낸 팬 · 역조공이면 보낸 크리에이터)에게 한 번(inbound-address-code INV-C8).
//   본문에 받는 주소 6자리·사무실 주소를 넣지 않는다(INV-C2) — 이 틀에는 그 칸이 아예 없다.
// hold_fan: 추적 장치로 상자가 보관됐을 때 보낸 팬에게 「돌려보낼 상자」(INV-N13, 2026-10-08) — 무엇이 나왔는지 쓰는 칸이 없다.
// box_missing: 결제 완료 + 14일에 아직 안 온 상자가 있으면 보낸 팬에게 한 번(INV-N15, 2026-10-08 카드 d50). 6자리·주소 칸이 없다.
// gift_pending_box: 받는 주소를 본 적이 있는 주문이 거절·반려될 때 아직 안 온 상자가 있으면 보낸 팬에게 한 번(INV-N17, 2026-10-10).
//   거절·7일 반려·차단 거절 모두 같은 종류·같은 본문이다(INV-N2). 6자리·주소 칸이 없다.
// gift_undelivered: 받는 주소를 본 적이 없는(상자가 하나도 오지 않은) 주문이 거절·반려될 때 보낸 팬에게 한 번(INV-N17 ②, 2026-10-12 문제집 D11).
//   거절·7일 반려·차단 거절 모두 같은 본문이다(INV-N2) — 거절 종류를 받는 칸이 없다.
// 꼭 가는 알림(INV-N6 표)에는 「꺼 두어도 가요」, 나머지에는 「끌 수 있어요」를 붙인다 — 종류별 판정은 entities/notification 하나.
// difference_due: 사무실 실측이 신고보다 커서 차액 결제 요청이 생기면 보낸 팬에게 상자마다 한 번(INV-N18, 2026-10-09 카드 d55).
//   금액·실측 구간 칸이 없다 — 선물 상세를 열면 보인다.
// payment_canceled · difference_canceled: 「확인 필요」 결제를 대표가 전액 취소했을 때 보낸 팬에게 한 번(INV-N19, payment INV-M20, 2026-10-10).
//   첫 결제면 결제 전 주문이라 팬 화면에 없다 — 링크는 선물 등록. 차액이면 선물 상세. 금액 칸이 없다.
// gift_reply · gift_received: 크리에이터가 상자에 「받았어요」를 남길 때 보낸 팬에게 상자마다 한 번(gift-reply INV-G5, 2026-10-11).
//   답장이 있으면 「답장이 왔어요」, 확인만이면 「도착했다고 확인됐어요」. 크리에이터 이름·답장 내용 칸이 없다 — 선물 상세를 열면 보인다.
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
  /** 설정의 사이트 주소(APP_ORIGIN) */
  appOrigin: string;
};

export type NotificationBody = { subject: string; text: string; buttonLabel: string; link: string };

const ORDER_NO = /^[A-Z0-9][A-Z0-9-]{0,39}$/;

const FOOTER = "이 알림에는 선물 내용과 보낸 분·받는 분 정보를 담지 않아요. 자세한 내용은 로그인한 뒤 위 링크에서 확인해 주세요.";
const FOOTER_OPTIONAL = "알림은 내 정보에서 끌 수 있어요.";
const FOOTER_MUST = "이 알림은 알림을 꺼 두어도 가요.";

const APPROVAL_SUBJECT = {
  1: "[팬꾹] 새 선물 승인 요청이 왔어요",
  2: "[팬꾹] 승인을 기다리는 선물이 사무실에 도착했어요",
  3: "[팬꾹] 아직 승인하지 않은 선물이 있어요",
} as const;

/** 팬이 보낸 선물의 단계 알림 — 제목과 첫 문장 */
const FAN_STEP = {
  arrived: ["[팬꾹] 보낸 선물이 팬꾹 사무실에 도착했어요", "보내신 선물이 팬꾹 사무실에 도착했어요."],
  inspected: ["[팬꾹] 보낸 선물의 검수가 끝났어요", "보내신 선물의 검수가 끝났어요."],
  shipped: ["[팬꾹] 보낸 선물이 출고됐어요", "보내신 선물이 크리에이터에게 출발했어요."],
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

function draftOf({ kind, round, nickname, orderNo, autoRejectAt }: NotificationBodyInput): Draft {
  const greet = `${nickname}님,`;
  const order = `주문번호 ${orderNo}`;
  switch (kind) {
    case "approval_request":
      if (!autoRejectAt) throw new Error("승인 요청 알림에 자동 반려 예정 시각이 없다");
      return {
        subject: APPROVAL_SUBJECT[round],
        lines: [
          greet,
          round === 3 ? "승인을 기다리는 선물이 아직 있어요." : "승인을 기다리는 선물이 있어요.",
          order,
          `${formatDeadline(autoRejectAt)}까지 승인하지 않으면 자동으로 반려돼요.`,
        ],
        buttonLabel: "승인 요청 보기",
        path: "/creator/requests",
      };
    case "arrived":
    case "inspected":
    case "shipped": {
      const [subject, first] = FAN_STEP[kind];
      return { subject, lines: [greet, first, order], buttonLabel: "선물 보기", path: `/gifts/${orderNo}` };
    }
    case "box_arrived":
      // 상자 하나가 사무실에 도착해 입고됐다. 「제가 보낸 게 아니에요」는 링크를 열고 로그인한 뒤에만 누를 수 있다.
      return {
        subject: "[팬꾹] 보낸 상자가 팬꾹 사무실에 도착했어요",
        lines: [greet, "보내신 상자 하나가 팬꾹 사무실에 도착했어요.", order, "보낸 적 없는 상자라면 링크를 열어 알려 주세요."],
        buttonLabel: "상자 확인하기",
        path: REVGIFT_ORDER_NO.test(orderNo) ? "/creator/revgifts" : `/gifts/${orderNo}`,
      };
    case "hold":
      // 무엇이 나왔는지·보낸 팬은 쓰지 않는다(INV-N13)
      return { subject: "[팬꾹] 확인할 선물이 있어요", lines: [greet, "확인이 필요한 선물이 있어요.", order], buttonLabel: "확인하기", path: "/creator" };
    case "hold_fan":
      // 무엇이 나왔는지·크리에이터가 알았다는 사실은 쓰지 않는다(INV-N13). 보관 상자는 168시간 뒤 반송된다(office-workflow INV-W4)
      return {
        subject: "[팬꾹] 돌려보낼 상자가 있어요",
        lines: [greet, "검수를 통과하지 못한 상자가 있어요.", "168시간 뒤 보내신 주소로 돌려보내요.", order],
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
    case "box_missing":
      // 30일(720시간)이 지나면 자동 처리가 그 상자를 닫는다(office-workflow INV-W10 · payment INV-M8)
      return {
        subject: "[팬꾹] 아직 도착하지 않은 상자가 있어요",
        lines: [
          greet,
          "아직 도착하지 않은 상자가 있어요.",
          "결제하고 30일이 지나도 도착하지 않으면 그 상자는 닫히고 그 상자 금액을 돌려드려요.",
          "상자가 하나도 도착하지 않았다면 선물이 취소되고 결제 금액을 모두 돌려드려요.",
          order,
        ],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
      };
    case "gift_pending_box":
      // 거절의 종류는 쓰지 않는다(INV-N2). 상자 금액 − 배송비를 먼저 돌려주고, 늦게 오면 반송, 168시간 안에 안 오면 배송비도(payment INV-M18)
      return {
        subject: "[팬꾹] 아직 도착하지 않은 상자가 있어요",
        lines: [
          greet,
          "아직 도착하지 않은 상자가 있어요.",
          "택배비를 뺀 금액을 먼저 돌려드려요.",
          "이미 보내셨다면 도착하는 대로 돌려보내 드려요. 7일 안에 도착하지 않으면 택배비도 돌려드려요.",
          order,
        ],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
      };
    case "gift_undelivered":
      // 거절의 종류·크리에이터는 쓰지 않는다(INV-N2). 받는 주소를 본 적이 없는 주문이라 결제 금액 전부가 돌아간다(payment INV-M8)
      return {
        subject: "[팬꾹] 선물이 전해지지 못했어요",
        lines: [greet, "선물이 전해지지 못했어요.", "결제 금액은 돌려드려요.", order],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
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
        subject: "[팬꾹] 보낸 선물에 답장이 왔어요",
        lines: [greet, "보내신 선물에 답장이 왔어요.", order],
        buttonLabel: "답장 보기",
        path: `/gifts/${orderNo}`,
      };
    case "gift_received":
      return {
        subject: "[팬꾹] 보낸 선물이 도착했다고 확인됐어요",
        lines: [greet, "보내신 선물을 크리에이터가 받았다고 확인했어요.", order],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
      };
    case "in_transit":
    case "delivered":
      // 팬과 크리에이터 둘 다 받는 종류인데 화면이 달라 받는 사람별 경로가 필요하다. 택배사 연결(INV-N12) 때 정한다.
      throw new Error("배송중·수령 알림은 아직 받는 사람별 경로가 없다");
  }
}

export function buildNotificationBody(input: NotificationBodyInput): NotificationBody {
  if (!ORDER_NO.test(input.orderNo)) throw new Error("알림 링크에 넣을 주문번호 꼴이 아니다");
  const origin = siteOrigin(input.appOrigin);
  const d = draftOf(input);
  const link = `${origin}${d.path}`;
  return {
    subject: d.subject,
    text: [...d.lines, "", link, "", FOOTER, isMustDeliver(input.kind) ? FOOTER_MUST : FOOTER_OPTIONAL].join("\n"),
    buttonLabel: d.buttonLabel,
    link,
  };
}

/** 받는 사람별 경로가 정해진 종류인가 — 배송중·수령은 택배사 연결 때 정한다(INV-N12) */
export function kindHasPath(kind: NotificationKind): boolean {
  return kind !== "in_transit" && kind !== "delivered";
}
