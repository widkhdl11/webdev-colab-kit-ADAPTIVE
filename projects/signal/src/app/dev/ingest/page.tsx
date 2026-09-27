import { notFound } from "next/navigation";
// INV-S4: 이 두 함수는 entities/ingest-run 의 배럴에서 일부러 안 내보낸다(secret 키로
// 읽는 server-only 조회라서) — app/ 아래(서버 전용 자리)만 파일을 직접 가리켜서 쓴다.
import { fetchRecentRuns, fetchRunSourceItems } from "@/entities/ingest-run/api/dashboard-queries";
import { summarizeDays, summarizeSpend } from "@/entities/ingest-run";
import { dayKey, dayStartIso } from "@/shared/lib/datetime";
import { MAX_CHAIN_LENGTH } from "@/features/ingestion";
import { IngestDashboard } from "@/widgets/ingest-dashboard";
import { localDevOnly } from "../local-guard";
import { fetchReviewItems, fetchReviewRuns, fetchReviewWeeks } from "@/entities/verdict-review/api/review-queries";
import { pickReviewWeek } from "@/entities/verdict-review";
import { reviewNotices, type Notice } from "@/features/verdict-review";
import { DevNav } from "@/widgets/dev-nav";
import { ReviewNotices } from "@/widgets/verdict-review";

/**
 * 개발자용 파이프라인 대시보드 — 최근 실행 1건의 소스별 통계 (2026-08-17).
 *
 * **로컬 전용**: 사용자 결정으로 지금은 관리자 로그인이 없다. 실수로 배포되더라도
 * 여기서 막는다 — 관리자 로그인을 붙일 때 이 가드를 그 체크로 바꾼다.
 */
export const dynamic = "force-dynamic";

interface Props {
  // Next 는 `?source=a&source=b` 처럼 같은 키가 반복되면 배열로 준다 — string 하나로
  // 단정하면 타입은 맞는 척하지만 실제로는 배열이 넘어올 수 있다(2026-08-17 리뷰).
  searchParams: Promise<{ source?: string | string[]; day?: string | string[] }>;
}

/** 날짜 줄에 보이는 날 수 — 두 주. 그 전 날은 고를 수 없다(조회도 그만큼만 한다). */
const DAYS_SHOWN = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 요금 평균을 내는 날 수 — 날짜 줄과 따로다(2026-09-22 부터 7일). */
const SPEND_DAYS = 7;
/**
 * 조회 행 상한 = 날 수 × (하루 최대 바퀴 + 여유 1). 모자라면 오래된 날이 잘려
 * 「실행 기록 없음」 빨간불로 보인다(2026-09-27 코드 리뷰 — 200행이면 14일 × 20바퀴를 못 담는다).
 */
const ROW_LIMIT = DAYS_SHOWN * (MAX_CHAIN_LENGTH + 1);

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function IngestDashboardPage({ searchParams }: Props) {
  // 배포본·다른 기기·재바인딩한 주소면 없는 화면이다 (verdict-review INV-VR9, 2026-09-24 보안 리뷰)
  if (!(await localDevOnly())) notFound();

  // 요금 합계는 **최신 실행 하나로는 안 나온다** — 하루에 여러 번 돌 수 있다.
  // 날짜 줄용 14일을 한 번 받아, 요금은 그중 최근 7일로 오늘 합계와 하루 평균을 낸다(월 환산의 재료다).
  const now = new Date();
  const [dayRuns, params] = await Promise.all([fetchRecentRuns(DAYS_SHOWN, now, ROW_LIMIT), searchParams]);
  const spendFromMs = Date.parse(dayStartIso(dayKey(now.toISOString())) ?? now.toISOString()) - (SPEND_DAYS - 1) * DAY_MS;
  const spend = summarizeSpend(
    dayRuns.filter((r) => Date.parse(r.startedAt) >= spendFromMs),
    now,
  );
  const source = first(params.source);

  // 날짜별 처리 결과 (2026-09-27). 주소의 day 는 남이 보낸 값이라 날짜 줄에 있는 날만 받는다.
  // 고르지 않았으면 **실행이 있는 가장 최근 날** — 오늘로 두면 아침 7시 전마다 첫 화면이 빈다.
  // 아래 상세 표는 고른 날의 마지막 실행을 그린다.
  const todayKey = dayKey(now.toISOString());
  const days = summarizeDays(dayRuns, now, DAYS_SHOWN);
  const requestedDay = first(params.day);
  const selected =
    days.find((d) => d.day === requestedDay) ?? days.find((d) => d.latestRun !== null) ?? days[0]!;
  const run = selected.latestRun;

  // run.sources 에 없는 소스 id 면 조회 자체를 안 한다 — 결과를 화면이 쓰지도 않는데
  // 왕복만 늘리는 조회를 낼 이유가 없다.
  const sourceExists = run !== null && source !== undefined && run.sources.some((s) => s.sourceId === source);
  const sourceItems = sourceExists ? await fetchRunSourceItems(run.id, source) : null;

  return (
    <>
      <DevNav current="ingest" />
      <IngestDashboard
        run={run}
        days={days}
        selectedDay={selected.day}
        todayKey={todayKey}
        spend={spend}
        selectedSourceId={source ?? null}
        sourceItems={sourceItems}
        notices={<ReviewNotices notices={await loadReviewNotices(now)} />}
      />
    </>
  );
}

/**
 * 판정 검토의 「눈여겨볼 것」(verdict-review INV-VR8). 판정 검토 테이블을 못 읽어도(마이그레이션 전 등)
 * 수집 대시보드는 그대로 그린다 — 대신 못 읽었다는 줄 하나를 띄운다.
 */
async function loadReviewNotices(now: Date): Promise<Notice[]> {
  try {
    const nowMs = now.getTime();
    const [weeks, runs] = await Promise.all([fetchReviewWeeks(60), fetchReviewRuns()]);
    const { week, open } = pickReviewWeek(weeks, nowMs);
    const openItems = open && week ? await fetchReviewItems(week.week) : null;
    return reviewNotices({ weeks, openItems, lastRun: runs.last, nowMs });
  } catch {
    return [{ tone: "warn", text: "판정 검토 기록을 읽지 못했다 — 마이그레이션 0012(판정 검토 테이블)를 적용했는지 본다" }];
  }
}
