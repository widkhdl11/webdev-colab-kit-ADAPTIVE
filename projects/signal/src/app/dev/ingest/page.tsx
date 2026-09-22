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
  if (process.env.NODE_ENV === "production") notFound();

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
    <IngestDashboard
      run={run}
      spend={spend}
      selectedSourceId={source ?? null}
      sourceItems={sourceItems}
    />
  );
}
