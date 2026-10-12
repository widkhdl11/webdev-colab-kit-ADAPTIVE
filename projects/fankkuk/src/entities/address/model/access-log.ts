// 주소 열람 기록 — INV-P7. 기록 표에는 성공·거부 모두 시각·주문번호·요청자 계정·결과·거부 사유가 남지만,
// 크리에이터에게는 주소가 열린 줄(시각·주문번호·몇 번째)만 간다. 거부 줄과 대표·직원 구분은 운영자 내부 기록에만 있다(2026-10-12 문제집 D12).
// 주소 자체(평문·암호문)는 들어가지 않는다(INV-P10).

/** INV-P5: 상자 하나에서 주소를 여는 상한 — 첫 출력 + 재출력 2회(상자마다 따로 — 카드 d30). 기록 줄의 출력 순번(print_no)도 여기까지다. */
export const MAX_DECRYPTS_PER_BOX = 3;

/**
 * 복호화 함수가 거부한 이유. 송장 출력 판정(authorizeDecrypt)의 거부 사유와 같은 이름을 쓴다.
 * DB 의 check(public.decrypt_log.deny_reason)와 같은 목록이다 — 하나를 늘리면 둘 다 늘린다.
 */
export const ACCESS_DENY_REASONS = [
  "not_owner",
  "no_valid_approval",
  "order_mismatch",
  "order_not_printable",
  "difference_unpaid",
  "decrypt_limit_reached",
  // INV-P14: 연 봉인 속 크리에이터가 주소 칸의 크리에이터와 달라 그 주소를 쓰지 않음(연 줄 다음에 이 줄이 붙는다)
  "address_mismatch",
] as const;
export type AccessDenyReason = (typeof ACCESS_DENY_REASONS)[number];

/** 운영자 내부 기록에서 요청자 구분 — owner = 대표 계정의 요청, other = 대표가 아닌 계정의 요청(not_owner 로 거부된 줄). */
export const ACCESS_REQUESTERS = ["owner", "other"] as const;
export type AccessRequester = (typeof ACCESS_REQUESTERS)[number];

/** 크리에이터 열람 기록의 한 줄 — 주소가 열린 줄이다(INV-P7, D12). */
export type AddressAccessEntry = {
  at: string;
  orderNo: string;
  /** 그 상자의 몇 번째 출력인가(횟수는 상자마다 — 카드 d30). 2부터 재출력(INV-P5). */
  printNo: number;
  /** 주소를 연 뒤 송장이 안 나와 돌려받은 줄(INV-P15) — 주소는 열렸지만 횟수에서 빠졌다. 화면에는 「출력 실패」. */
  released: boolean;
};

/** 열람 기록 화면의 「이번 달」(서울 기준 달력 달) 숫자. DB 가 직접 센다 — 화면이 받은 줄로 세지 않는다. 거부 숫자는 없다(D12). */
export type AccessMonthSummary = { approvedCount: number; openedCount: number; reprintCount: number };

/**
 * 출력 순번 → 줄 라벨. 1 = 첫 출력, 2부터 재출력(INV-P5). 돌려받은 줄은 순번과 상관없이 「출력 실패」(INV-P15).
 * 크리에이터 메인과 열람 기록 화면이 같이 쓴다.
 */
export function printLabelOf(printNo: number, released = false): { reprint: boolean; text: string } {
  if (released) return { reprint: false, text: "출력 실패" };
  return printNo >= 2 ? { reprint: true, text: `재출력 ${printNo}번째` } : { reprint: false, text: "첫 출력" };
}

const seoulMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" });

/** 서울 기준 달 — "2026-10". 열람 기록은 서울 달력 달로 묶는다. */
export function seoulMonthKey(iso: string): string {
  const parts = seoulMonth.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

/** "2026-10" → "2026년 10월" */
export function monthLabelOf(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  return `${y}년 ${Number(m)}월`;
}
