// 주소 열람 기록 한 줄 — INV-P7: 시각, 주문번호, 요청자 계정, 결과, 거부 사유.
// 주소 자체(평문·암호문)는 들어가지 않는다(INV-P10). 크리에이터 화면은 이 모양만 받는다.

/** 복호화 함수가 거부한 이유. 송장 출력 판정(authorizeDecrypt)의 거부 사유와 같은 이름을 쓴다. */
export type AccessDenyReason =
  | "not_owner"
  | "no_valid_approval"
  | "order_mismatch"
  | "order_not_printable"
  | "difference_unpaid"
  | "decrypt_limit_reached";

export type AddressAccessEntry = {
  at: string;
  orderNo: string;
  /** 요청한 계정. 지금은 대표 계정 하나뿐이다(INV-P8). */
  requester: "owner";
  /** printNo: 이 주문의 몇 번째 출력인가. 2부터 재출력(INV-P5). */
  result: { kind: "opened"; printNo: number } | { kind: "denied"; reason: AccessDenyReason };
};

export type AccessLogSummary = { openedCount: number; reprintCount: number; deniedCount: number };

/** 기록에서 숫자를 센다. 저장하지 않고 화면을 그릴 때마다 계산한다. */
export function summarizeAccessLog(entries: readonly AddressAccessEntry[]): AccessLogSummary {
  let openedCount = 0;
  let reprintCount = 0;
  let deniedCount = 0;
  for (const e of entries) {
    if (e.result.kind === "denied") {
      deniedCount += 1;
      continue;
    }
    openedCount += 1;
    if (e.result.printNo >= 2) reprintCount += 1;
  }
  return { openedCount, reprintCount, deniedCount };
}
