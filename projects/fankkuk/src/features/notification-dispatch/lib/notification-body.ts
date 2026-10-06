import { formatDeadline } from "@/shared/lib/format/datetime";

// 알림 본문 틀 (notifications INV-N1·N9). 카카오 알림톡과 이메일이 같은 틀을 쓴다(INV-N7) — 카카오 템플릿도 이 문구로 심사받는다.
// 본문은 잠금 화면·메일함·대행사 서버처럼 우리가 지킬 수 없는 곳에 남는다. 그래서 받는 칸을 아래 여섯으로 묶어
// 품목·상대방·주소·연락처·운송장 번호가 섞일 자리를 만들지 않는다. 누가 무엇을 보냈는지는 링크를 열고 로그인한 뒤에만 보인다.
// 링크는 설정의 사이트 주소 + 고정 경로(+주문번호)뿐이다. 요청 헤더로 만들지 않고, 링크 자체로는 아무것도 처리하지 않는다(INV-N9).

export const NOTIFICATION_KINDS = ["approval_request", "arrived", "inspected", "shipped", "in_transit", "delivered", "hold"] as const;
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

type Draft = { subject: string; lines: string[]; buttonLabel: string; path: string; must: boolean };

function siteOrigin(appOrigin: string): string {
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
    case "hold":
      // 무엇이 나왔는지·보낸 팬은 쓰지 않는다(INV-N13)
      return { subject: "[팬꾹] 확인할 선물이 있어요", lines: [greet, "확인이 필요한 선물이 있어요.", order], buttonLabel: "확인하기", path: "/creator", must: false };
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
