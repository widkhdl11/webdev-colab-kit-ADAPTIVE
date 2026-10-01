// 예시 공지 — DB 전에 공지 화면(/notices)과 메인(/home)의 공지 줄을 보기 위한 것. 지어낸 글이다.
// 문구 한계(design-rules 6절): 주소 약속은 「승인 없이는 저희 시스템이 주소를 열지 않습니다」만, 검수는 「걸린 상자만 개봉」.
// 요금 공지의 숫자는 글을 쓴 날의 요금표(entities/payment tier-pricing)와 같게 적었다 — 요금이 바뀌면 새 공지를 쓴다.

/** 본문 한 덩어리. text 의 parts 에 링크를 섞을 수 있다. */
export type NoticeBlock =
  | { type: "heading"; text: string }
  | { type: "text"; parts: readonly (string | { label: string; href: string })[] }
  | { type: "signature"; text: string }
  | { type: "list"; items: readonly string[] };

export type Notice = {
  id: string;
  title: string;
  /** YYYY-MM-DD (서울) */
  date: string;
  pinned: boolean;
  body: readonly NoticeBlock[];
};

const text = (...parts: (string | { label: string; href: string })[]): NoticeBlock => ({ type: "text", parts });

/** 고정 글이 먼저, 그다음 최신순으로 적어 둔다. */
export const SAMPLE_NOTICES: readonly Notice[] = [
  {
    id: "n-open",
    title: "팬꾹 서비스 시작 안내",
    date: "2026-10-01",
    pinned: true,
    body: [
      { type: "heading", text: "안녕하세요, 팬꾹이에요" },
      text("팬이 보낸 선물을 크리에이터가 안전하게 받을 수 있도록, 팬꾹이 문을 열어요."),
      text(
        "팬꾹에서는 크리에이터가 승인한 선물만 배송돼요. 승인 없이는 저희 시스템이 주소를 열지 않습니다. 사무실에 도착한 상자는 송장을 제거하고 겉면과 추적 장치를 검사한 뒤 출고하고, 검사에 걸린 상자만 열어서 확인해요.",
      ),
      text("서비스 이용 중 궁금한 점은 ", { label: "고객센터", href: "/support" }, "에서 확인해 주세요. 많이 사랑해 주세요."),
      { type: "signature", text: "네오코드 팬꾹 운영팀" },
    ],
  },
  {
    id: "n-size",
    title: "선물 보내기 전에 꼭 확인해 주세요 (크기·무게 기준)",
    date: "2026-10-01",
    pinned: true,
    body: [
      text(
        "소형(세 변 합 100cm · 5kg 이하)과 중형(세 변 합 100cm · 10kg 이하)까지 받아요. 크기와 무게 중 큰 쪽 기준으로 정해지고, 중형을 넘는 상자는 받지 않아요.",
      ),
      text("사무실에 도착해 실측한 크기가 등록하신 것보다 크면 차액을 따로 결제하셔야 해요."),
    ],
  },
  {
    id: "n-price",
    title: "요금 안내: 상자마다 배송비가 포함돼 있어요",
    date: "2026-09-30",
    pinned: false,
    body: [
      {
        type: "list",
        items: [
          "소형 6,900원 — 세 변 합 100cm · 5kg 이하",
          "중형 8,900원 — 세 변 합 100cm · 10kg 이하",
          "모든 요금에 추적 장치 검수가 포함돼 있어요.",
        ],
      },
    ],
  },
  {
    id: "n-holiday",
    title: "개천절·한글날 배송 일정 안내",
    date: "2026-09-29",
    pinned: false,
    body: [
      text("10월 3일 개천절과 9일 한글날에는 사무실 입고와 출고가 쉬어요. 쉬는 날 전에 도착하게 하려면 여유를 두고 보내 주세요."),
      text("휴무 기간: (출시 전 기재)"),
    ],
  },
  {
    id: "n-channel",
    title: "크리에이터 방송 채널 인증 방법 안내",
    date: "2026-09-28",
    pinned: false,
    body: [
      text(
        "크리에이터로 가입하신 뒤에는 방송 채널에 인증 코드를 올려 본인 확인을 해 주세요. 확인이 끝나면 「크리에이터 찾기」에 나타나고, 팬이 선물을 보낼 수 있어요.",
      ),
    ],
  },
  {
    id: "n-inspect",
    title: "검수는 이렇게 진행돼요: 걸린 상자만 개봉합니다",
    date: "2026-09-26",
    pinned: false,
    body: [
      text("사무실에 도착한 모든 상자는 원래 송장을 제거하고 겉면과 추적 장치를 검사해요. 검사에 걸린 상자만 열어서 확인해요."),
    ],
  },
  {
    id: "n-kakao",
    title: "카카오톡 인증 점검 안내",
    date: "2026-09-24",
    pinned: false,
    body: [
      text("점검 시간에는 가입과 승인 서명이 잠시 어려울 수 있어요. 점검이 끝나면 바로 이용하실 수 있어요."),
      text("점검 일시: (출시 전 기재)"),
    ],
  },
  {
    id: "n-privacy",
    title: "개인정보 보관 방식 안내",
    date: "2026-09-22",
    pinned: false,
    body: [
      text("휴대폰 번호는 알림톡을 보내는 데 쓰고, 실명·주소와 따로 나눠 보관해요. 자세한 내용은 개인정보처리방침에서 확인하실 수 있어요."),
    ],
  },
  {
    id: "n-early-fan",
    title: "서비스 시작 알림 신청 안내",
    date: "2026-09-18",
    pinned: false,
    body: [text("서비스가 열리면 알림톡으로 알려 드려요. 알림 신청은 회원가입 화면에서 할 수 있어요.")],
  },
  {
    id: "n-early-creator",
    title: "크리에이터 먼저 가입 안내",
    date: "2026-09-15",
    pinned: false,
    body: [text("서비스 시작 전에 크리에이터로 먼저 가입해 두시면, 문을 여는 날부터 선물 요청을 받을 수 있어요.")],
  },
  {
    id: "n-hello",
    title: "팬꾹을 소개합니다",
    date: "2026-09-12",
    pinned: false,
    body: [
      text("팬꾹은 팬이 보내는 선물을 사무실에서 받아 검수하고, 크리에이터가 승인한 선물만 대신 보내 드리는 서비스예요."),
      text("자세한 이야기는 ", { label: "팬꾹 소개", href: "/about" }, "에서 읽어 보실 수 있어요."),
    ],
  },
];
