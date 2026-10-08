import { formatDeadline } from "@/shared/lib/format/datetime";

// 알림 본문 틀 (notifications INV-N1·N9). 카카오 알림톡과 이메일이 같은 틀을 쓴다(INV-N7) — 카카오 템플릿도 이 문구로 심사받는다.
// 본문은 잠금 화면·메일함·대행사 서버처럼 우리가 지킬 수 없는 곳에 남는다. 그래서 받는 칸을 아래 여섯으로 묶어
// 품목·상대방·주소·연락처·운송장 번호가 섞일 자리를 만들지 않는다. 누가 무엇을 보냈는지는 링크를 열고 로그인한 뒤에만 보인다.
// 링크는 설정의 사이트 주소 + 고정 경로(+주문번호)뿐이다. 요청 헤더로 만들지 않고, 링크 자체로는 아무것도 처리하지 않는다(INV-N9).

// box_arrived: 상자 하나가 입고됐다고 그 주문의 주인(보낸 팬 · 역조공이면 보낸 크리에이터)에게 한 번(inbound-address-code INV-C8).
//   본문에 받는 주소 6자리·사무실 주소를 넣지 않는다(INV-C2) — 이 틀에는 그 칸이 아예 없다.
// hold_fan: 추적 장치로 상자가 보관됐을 때 보낸 팬에게 「돌려보낼 상자」(INV-N13, 2026-10-08) — 무엇이 나왔는지 쓰는 칸이 없다.
// box_missing: 결제 완료 + 14일에 아직 안 온 상자가 있으면 보낸 팬에게 한 번(INV-N15, 2026-10-08 카드 d50). 6자리·주소 칸이 없다.
// gift_pending_box: 상자가 하나라도 도착한 주문이 거절·반려될 때 아직 안 온 상자가 있으면 보낸 팬에게 한 번(INV-N17, 2026-10-08 카드 d52).
//   거절·7일 반려·차단 거절 모두 같은 종류·같은 본문이다(INV-N2). 6자리·주소 칸이 없다.
export const NOTIFICATION_KINDS = [
  "approval_request",
  "arrived",
  "inspected",
  "shipped",
  "in_transit",
  "delivered",
  "hold",
  "box_arrived",
  "hold_fan",
  "box_missing",
  "gift_pending_box",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

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
const FOOTER_MUST = "승인 요청 알림은 알림을 꺼 두어도 가요.";

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

type Draft = { subject: string; lines: string[]; buttonLabel: string; path: string; must: boolean };

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
        must: true,
      };
    case "arrived":
    case "inspected":
    case "shipped": {
      const [subject, first] = FAN_STEP[kind];
      return { subject, lines: [greet, first, order], buttonLabel: "선물 보기", path: `/gifts/${orderNo}`, must: false };
    }
    case "box_arrived":
      // 상자 하나가 사무실에 도착해 입고됐다. 「제가 보낸 게 아니에요」는 링크를 열고 로그인한 뒤에만 누를 수 있다.
      return {
        subject: "[팬꾹] 보낸 상자가 팬꾹 사무실에 도착했어요",
        lines: [greet, "보내신 상자 하나가 팬꾹 사무실에 도착했어요.", order, "보낸 적 없는 상자라면 링크를 열어 알려 주세요."],
        buttonLabel: "상자 확인하기",
        path: REVGIFT_ORDER_NO.test(orderNo) ? "/creator/revgifts" : `/gifts/${orderNo}`,
        must: false,
      };
    case "hold":
      // 무엇이 나왔는지·보낸 팬은 쓰지 않는다(INV-N13)
      return { subject: "[팬꾹] 확인할 선물이 있어요", lines: [greet, "확인이 필요한 선물이 있어요.", order], buttonLabel: "확인하기", path: "/creator", must: false };
    case "hold_fan":
      // 무엇이 나왔는지·크리에이터가 알았다는 사실은 쓰지 않는다(INV-N13). 보관 상자는 168시간 뒤 반송된다(office-workflow INV-W4)
      return {
        subject: "[팬꾹] 돌려보낼 상자가 있어요",
        lines: [greet, "검수를 통과하지 못한 상자가 있어요.", "168시간 뒤 보내신 주소로 돌려보내요.", order],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
        must: false,
      };
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
        must: false,
      };
    case "gift_pending_box":
      // 거절의 종류는 쓰지 않는다(INV-N2). 늦게 온 상자는 선불 반송, 끝내 안 오면 대표가 확인한 뒤 닫는다(payment INV-M18)
      return {
        subject: "[팬꾹] 아직 도착하지 않은 상자가 있어요",
        lines: [
          greet,
          "아직 도착하지 않은 상자가 있어요.",
          "이미 보내셨다면 도착하는 대로 돌려보내고 택배비를 뺀 금액을 돌려드려요.",
          "보내지 않으셨다면 1:1 문의로 알려 주세요. 확인한 뒤 그 상자 금액을 모두 돌려드려요.",
          order,
        ],
        buttonLabel: "선물 보기",
        path: `/gifts/${orderNo}`,
        must: false,
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
    text: [...d.lines, "", link, "", FOOTER, d.must ? FOOTER_MUST : FOOTER_OPTIONAL].join("\n"),
    buttonLabel: d.buttonLabel,
    link,
  };
}

/** 받는 사람별 경로가 정해진 종류인가 — 배송중·수령은 택배사 연결 때 정한다(INV-N12) */
export function kindHasPath(kind: NotificationKind): boolean {
  return kind !== "in_transit" && kind !== "delivered";
}
