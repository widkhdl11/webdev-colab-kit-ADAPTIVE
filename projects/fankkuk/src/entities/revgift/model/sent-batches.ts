import type { SentRevgift } from "./revgift-rows";

// 크리에이터의 보낸 역조공을 한 번에 보낸 묶음으로 나눈다. 한 번에 등록한 몫은 같은 시각으로 기록되므로
// 보낸 시각이 같은 몫끼리 묶는다. 상태는 크리에이터에게 보이는 세 가지만 센다(reverse-gift INV-R8).
// 사무실 주소는 사무실로 보낼 상자가 남은 묶음에만 붙인다(INV-R14 — 남았는지는 DB 가 보내기 단위로 판정한다).

export type SentBatch = { sentAt: string; shares: SentRevgift[]; officeAddress: string | null };

export type BatchStateCounts = Record<SentRevgift["state"], number>;

/** 보낸 시각이 같은 몫끼리 묶는다. 최근 묶음이 먼저, 묶음 안은 받은 순서 그대로. */
export function toSentBatches(rows: readonly SentRevgift[], officeAddress: string): SentBatch[] {
  const map = new Map<string, SentRevgift[]>();
  for (const r of rows) {
    const list = map.get(r.sentAt);
    if (list) list.push(r);
    else map.set(r.sentAt, [r]);
  }
  return [...map.entries()].map(([sentAt, shares]) => ({ sentAt, shares, officeAddress: shares.some((x) => x.shipToOffice) ? officeAddress : null })).sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
}

/** 묶음 안 몫을 상태별로 센다. */
export function countBatchStates(shares: readonly SentRevgift[]): BatchStateCounts {
  const counts: BatchStateCounts = { accepted: 0, waiting: 0, not_received: 0 };
  for (const x of shares) counts[x.state] += 1;
  return counts;
}

export type SentSummary = {
  /** 한 번에 보낸 묶음 수 — 보낸 시각이 같은 몫끼리 하나(toSentBatches 와 같은 기준) */
  batches: number;
  /** 보낸 선물(몫) 수 — 크리에이터 화면에는 팬 id 가 없어(INV-R8) 같은 팬을 가려 셀 수 없으므로 「팬 수」라 부르지 않는다 */
  shares: number;
  /** 상태별 몫 수 — 크리에이터에게 보이는 세 가지(INV-R8) */
  states: BatchStateCounts;
};

/** 보낸 역조공 화면 오른쪽 요약 칸의 숫자 — 화면에 이미 있는 몫 목록만 센다. */
export function summarizeSent(rows: readonly SentRevgift[]): SentSummary {
  return { batches: new Set(rows.map((r) => r.sentAt)).size, shares: rows.length, states: countBatchStates(rows) };
}
