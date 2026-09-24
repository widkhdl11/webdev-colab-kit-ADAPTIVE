import { notFound } from "next/navigation";
// INV-S4: 이 두 함수는 entities/ingest-run 의 배럴에서 일부러 안 내보낸다(secret 키로
// 읽는 server-only 조회라서) — app/ 아래(서버 전용 자리)만 파일을 직접 가리켜서 쓴다.
import {
  fetchLatestIngestRun,
  fetchRecentRuns,
  fetchRunSourceItems,
} from "@/entities/ingest-run/api/dashboard-queries";
import { summarizeSpend } from "@/entities/ingest-run";
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
  searchParams: Promise<{ source?: string | string[] }>;
}

export default async function IngestDashboardPage({ searchParams }: Props) {
  // 배포본·다른 기기·재바인딩한 주소면 없는 화면이다 (verdict-review INV-VR9, 2026-09-24 보안 리뷰)
  if (!(await localDevOnly())) notFound();

  // 요금 합계는 **최신 실행 하나로는 안 나온다** — 하루에 여러 번 돌 수 있다.
  // 7일을 받아 오늘 합계와 하루 평균을 같이 낸다(월 환산의 재료다).
  const now = new Date();
  const [run, recentRuns, params] = await Promise.all([
    fetchLatestIngestRun(),
    fetchRecentRuns(7, now),
    searchParams,
  ]);
  const spend = summarizeSpend(recentRuns, now);
  const raw = params.source;
  const source = Array.isArray(raw) ? raw[0] : raw;

  // run.sources 에 없는 소스 id 면 조회 자체를 안 한다 — 결과를 화면이 쓰지도 않는데
  // 왕복만 늘리는 조회를 낼 이유가 없다.
  const sourceExists = run !== null && source !== undefined && run.sources.some((s) => s.sourceId === source);
  const sourceItems = sourceExists ? await fetchRunSourceItems(run.id, source) : null;

  return (
    <>
      <DevNav current="ingest" />
      <IngestDashboard
        run={run}
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
