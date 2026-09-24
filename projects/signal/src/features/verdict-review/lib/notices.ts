import {
  REVIEW_WINDOW_MS,
  fmtPct,
  pickReviewWeek,
  kindLabel,
  repeatedKinds,
  weekLabel,
  type ReviewItem,
  type ReviewRun,
  type ReviewWeek,
} from "@/entities/verdict-review";

/** 마지막 실행이 이만큼 지나면 「안 돌았을 수 있다」가 뜬다 (INV-VR8). 매일 돌지만 뽑기는 주 1회 + 하루. */
export const STALE_AFTER_MS = 8 * 86_400_000;

export interface Notice {
  /** warn = 사람이 손쓸 일, info = 상황 설명 */
  tone: "warn" | "info";
  text: string;
}

const SEOUL_OFFSET_MS = 9 * 3600_000;
const mmdd = (ms: number) => {
  const d = new Date(ms + SEOUL_OFFSET_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const mmddhhmm = (iso: string) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t + SEOUL_OFFSET_MS);
  return `${mmdd(t)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/**
 * 개발자 대시보드 위쪽 「눈여겨볼 것」 (INV-VR8). 해당하는 것이 없으면 빈 배열 — 화면은 절을 안 그린다.
 * weeks: 최근 주들(순서 무관). openItems: 답을 받는 주의 표본(없으면 null).
 */
export function reviewNotices(input: {
  weeks: readonly ReviewWeek[];
  openItems: readonly Pick<ReviewItem, "answer">[] | null;
  lastRun: ReviewRun | null;
  nowMs: number;
}): Notice[] {
  const { weeks, openItems, lastRun, nowMs } = input;
  const rows: Notice[] = [];
  // 기록이 한 번도 없으면 「8일째 없다」도 못 센다 — 주간 실행이 아직 한 번도 안 돌았다고 따로 알린다
  if (lastRun === null) {
    rows.push({ tone: "info", text: "판정 검토 실행 기록이 아직 없다 — 다음 수집 실행(매일 아침 7시)이 첫 표본을 뽑는다" });
  }
  if (lastRun !== null && !lastRun.ok) {
    rows.push({ tone: "warn", text: `판정 검토 실행 실패 (${mmddhhmm(lastRun.ranAt)}) — ${lastRun.message}` });
  }
  if (lastRun !== null && nowMs - Date.parse(lastRun.ranAt) > STALE_AFTER_MS) {
    const days = Math.floor((nowMs - Date.parse(lastRun.ranAt)) / 86_400_000);
    rows.push({ tone: "warn", text: `판정 검토 실행 기록이 ${days}일째 없다 — 수집 실행이 안 돌았을 수 있다` });
  }
  const picked = pickReviewWeek(weeks, nowMs);
  const open = picked.open ? picked.week : null;
  if (open && openItems !== null) {
    const left = openItems.filter((i) => i.answer === null).length;
    if (left > 0) {
      const until = Date.parse(open.extractedAt) + REVIEW_WINDOW_MS;
      rows.push({
        tone: "warn",
        text: `${weekLabel(open.week)} 판정 표본 ${openItems.length}건 중 ${left}건이 답을 기다린다 (${mmdd(until)}까지) — 판정 검토 탭`,
      });
    }
  }
  const reviewed = weeks.filter((w) => w.status === "reviewed" && w.summary !== null).sort((a, b) => a.week.localeCompare(b.week));
  const last = reviewed[reviewed.length - 1];
  if (last?.summary) {
    const s = last.summary;
    rows.push({ tone: "info", text: `${weekLabel(last.week)} 판정 정확도 ${fmtPct(s.accuracy)} (${s.correct + s.wrong}건 검토)` });
  }
  for (const r of repeatedKinds(weeks)) {
    rows.push({
      tone: "warn",
      text: `판정 수정안 필요 — 「${kindLabel(r.kind)}」 오류가 ${r.weeks.map(weekLabel).join("·")}에 이어서 나왔다`,
    });
  }
  return rows;
}
