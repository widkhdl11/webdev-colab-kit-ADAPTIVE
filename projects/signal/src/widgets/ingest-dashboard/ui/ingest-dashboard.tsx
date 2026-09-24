import Link from "next/link";
import type { ReactNode } from "react";
import type { IngestRunRecord, RunSourceItem, SpendSummary } from "@/entities/ingest-run";
import {
  avgMsPerItem,
  avgTokensPerItem,
  estimateCostBreakdown,
  toKrw,
  totals,
} from "@/entities/ingest-run";
import { safeSourceUrl } from "@/features/content-render";
import styles from "./ingest-dashboard.module.css";

interface Props {
  run: IngestRunRecord | null;
  /** 오늘·최근 며칠의 요금 합계. 최신 실행 하나로는 "오늘 얼마 썼나"가 안 나온다. */
  spend: SpendSummary;
  selectedSourceId: string | null;
  sourceItems: RunSourceItem[] | null;
  /** 머리 아래 자리 — 판정 검토의 「눈여겨볼 것」이 들어온다(위젯끼리 import 하지 않으려고 자리만 연다). */
  notices?: ReactNode;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
// 소수점 둘째 자리까지 — 토큰 수만 봐서는 비용 감이 안 온다는 요청으로 추가(2026-08-17).
// 단계마다 그 단계 모델의 단가로 계산한 근사치다(entities/ingest-run/lib/estimate-cost.ts 의 MODEL_RATES).
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
// 달러도 감이 안 온다는 요청으로 원화를 같이 붙인다(2026-08-26). 환율은 고정 상수라
// 근사치다 — 정확한 청구액은 앤트로픽 콘솔의 달러 금액이 기준(lib/to-krw.ts).
const fmtMoney = (usd: number) => `${fmtUsd(usd)} · ${fmt(toKrw(usd))}원`;

/**
 * 단계 이름. 순서는 **실제로 도는 순서**다 — 어느 단계에서 시간이 떨어지는지를 보려면
 * 화면의 순서가 파이프라인의 순서와 같아야 한다.
 */
const STAGE_LABELS = [
  ["feedMs", "피드 받기"],
  ["topicMs", "주제 판정"],
  ["storeMs", "적재"],
  ["hotIssueMs", "핫이슈 판정"],
  ["extractionMs", "본문 긁기"],
  ["enrichmentMs", "요약·번역"],
  ["keywordsMs", "키워드"],
] as const;

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}초`;

/** 모델 기록이 없는 옛 실행(2026-09-22 이전)이 쓰던 모델. 그때는 네 단계가 전부 이 하나였다. */
const LEGACY_MODELS = {
  topic: "claude-sonnet-5",
  hotIssue: "claude-sonnet-5",
  enrich: "claude-sonnet-5",
  keywords: "claude-sonnet-5",
} as const;

export function IngestDashboard({ run, spend, selectedSourceId, sourceItems, notices = null }: Props) {
  if (run === null) {
    return (
      <main className={styles.wrap}>
        <div className={styles.pageHead}>
          <h1>수집 파이프라인</h1>
          <p>개발자용 — 최근 실행 1건의 소스별 통계를 보여준다.</p>
        </div>
        {notices}
        <p className={styles.empty}>아직 기록된 실행이 없습니다. `npm run ingest` 를 한 번 돌려보세요.</p>
      </main>
    );
  }

  const t = totals(run.sources);
  const avg = avgMsPerItem(run.elapsedMs, t.fetched);
  const selected = run.sources.find((s) => s.sourceId === selectedSourceId) ?? null;

  // 단가는 실행 시각에 따라 갈린다(2026-08-31 프로모션 종료). 실행을 통째로 넘긴다 —
  // 사용량과 시각을 따로 꺼내 넘기면 서로 다른 실행의 조합이 만들어질 수 있다.
  const { topicCostUsd, hotIssueCostUsd, enrichCostUsd, keywordCostUsd, totalCostUsd } =
    estimateCostBreakdown(run);
  const stageMs = run.usage.stageMs;
  // 모델 기록이 없는 옛 실행은 그때 쓰던 것을 그대로 적는다 — 지금 코드의 값을 적으면
  // 화면이 "이 실행은 haiku 로 돌았다"고 거짓말을 한다.
  const models = run.usage.models ?? LEGACY_MODELS;

  const STAGE_COST_ROWS = [
    {
      label: "주제 판정",
      modelKey: "topic",
      todayKey: "topicUsd",
      runUsd: topicCostUsd,
      tokens: (r: IngestRunRecord) => r.usage.topicInputTokens + r.usage.topicOutputTokens,
    },
    {
      label: "핫이슈 판정",
      modelKey: "hotIssue",
      todayKey: "hotIssueUsd",
      runUsd: hotIssueCostUsd,
      tokens: (r: IngestRunRecord) =>
        (r.usage.hotIssueInputTokens ?? 0) + (r.usage.hotIssueOutputTokens ?? 0),
    },
    {
      label: "요약·번역",
      modelKey: "enrich",
      todayKey: "enrichUsd",
      runUsd: enrichCostUsd,
      tokens: (r: IngestRunRecord) => r.usage.inputTokens + r.usage.outputTokens,
    },
    {
      label: "키워드",
      modelKey: "keywords",
      todayKey: "keywordUsd",
      runUsd: keywordCostUsd,
      tokens: (r: IngestRunRecord) =>
        (r.usage.keywordInputTokens ?? 0) + (r.usage.keywordOutputTokens ?? 0),
    },
  ] as const;

  return (
    <main className={styles.wrap}>
      <div className={styles.pageHead}>
        <h1>수집 파이프라인</h1>
        <p>
          최근 실행 · {new Date(run.startedAt).toLocaleString("ko-KR")}
          {run.budget.exhausted ? <span className={styles.warn}> · 시간 예산 초과</span> : null}
        </p>
        {run.budget.exhausted ? (
          // exhausted=true 만 보이면 "떨어졌다"만 알고 무엇이 잘렸는지는 모른다 —
          // 그게 바로 이 화면을 만든 이유의 절반이라 여기서 그대로 보여준다.
          <p className={styles.budgetDetail}>
            {run.budget.skippedSources.length > 0
              ? `손도 못 댄 소스: ${run.budget.skippedSources.join(", ")}`
              : null}
            {run.budget.skippedTopicChecks > 0
              ? ` · 판정 못 함 ${fmt(run.budget.skippedTopicChecks)}건`
              : null}
            {run.budget.skippedExtractions > 0
              ? ` · 본문추출 못 함 ${fmt(run.budget.skippedExtractions)}건`
              : null}
            {run.budget.skippedEnrichments > 0
              ? ` · 요약·번역 못 함 ${fmt(run.budget.skippedEnrichments)}건`
              : null}
            {/* 이 둘은 건수가 아니라 "단계가 통째로 안 돌았다"다. 2026-09-22 까지 화면이
                이 칸을 안 읽어서, 키워드가 3주간 한 건도 안 붙은 것이 어디에도 안 떴다. */}
            {run.budget.skippedHotIssue === true ? " · 핫이슈 판정 아예 못 함" : null}
            {run.budget.skippedKeywords === true ? " · 키워드 아예 못 함" : null}
          </p>
        ) : null}
      </div>

      {notices}

      {/* 단계별 시간 (2026-09-22). 총 소요시간 하나만으로는 어느 단계가 예산을 쓰는지
          알 수 없어서, 한 바퀴를 어떻게 나눌지를 추정으로 정하게 된다.
          옛 실행에는 이 값이 없다 — 그때는 절 자체를 안 그린다("0초"로 그리면
          "안 걸렸다"로 읽히는데 사실은 "안 쟀다"다). */}
      {stageMs === null ? null : (
        <>
          <h2 className={styles.sectionTitle}>단계별 소요 시간</h2>
          <dl className={styles.statGrid}>
            {STAGE_LABELS.map(([key, label]) => (
              <div key={key} className={styles.stat}>
                <dt>{label}</dt>
                <dd>{sec(stageMs[key])}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <dl className={styles.statGrid}>
        <div className={styles.stat}>
          <dt>소요시간</dt>
          <dd>{(run.elapsedMs / 1000).toFixed(1)}초</dd>
        </div>
        <div className={styles.stat}>
          <dt>글당 평균 소요시간</dt>
          <dd>{avg === null ? "—" : `${avg}ms`}</dd>
        </div>
        <div className={styles.stat}>
          <dt>검색한 글</dt>
          <dd>{fmt(t.fetched)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>통과한 글</dt>
          <dd>{fmt(t.stored)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>걸러진 글</dt>
          <dd>{fmt(t.filtered)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>본문 못 가져온 글</dt>
          <dd>{fmt(t.extractionFailed)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>이번 실행 요금</dt>
          <dd>{fmtMoney(totalCostUsd)}</dd>
        </div>
      </dl>

      {/* 요금 절 (2026-09-22 사용자 요청) — "이걸 보면서 줄일 방법을 생각한다"가 목적이라
          단계별로 나눈다. 합계만 있으면 어디를 손댈지가 안 나온다. */}
      <h2 className={styles.sectionTitle}>요금</h2>
      <dl className={styles.statGrid}>
        <div className={styles.stat}>
          <dt>오늘 쓴 요금</dt>
          <dd>
            {fmtMoney(spend.today.totalUsd)}
            <span className={styles.statSub}>
              {" "}
              {spend.todayRuns === 0 ? "오늘 아직 안 돌았음" : `실행 ${spend.todayRuns}회`}
            </span>
          </dd>
        </div>
        <div className={styles.stat}>
          <dt>하루 평균</dt>
          <dd>
            {fmtMoney(spend.dailyAverageUsd)}
            <span className={styles.statSub}>
              {" "}
              {spend.daysCounted === 0 ? "기록 없음" : `기록 있는 ${spend.daysCounted}일 기준`}
            </span>
          </dd>
        </div>
        <div className={styles.stat}>
          {/* 예측이 아니라 "지금 속도가 유지되면" 이다. 그 전제를 라벨에 적는다 —
              안 적으면 이 숫자가 약속으로 읽힌다. */}
          <dt>한 달 환산 (지금 속도면)</dt>
          <dd>{fmtMoney(spend.monthlyEstimateUsd)}</dd>
        </div>
      </dl>

      <table className={styles.table}>
        <caption>단계별 — 이번 실행과 오늘 합계</caption>
        <thead>
          <tr>
            <th scope="col">단계</th>
            <th scope="col">모델</th>
            <th scope="col">이번 실행 토큰</th>
            <th scope="col">이번 실행 요금</th>
            <th scope="col">오늘 합계</th>
          </tr>
        </thead>
        <tbody>
          {STAGE_COST_ROWS.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{models[row.modelKey]}</td>
              <td>{fmt(row.tokens(run))}</td>
              <td>{fmtMoney(row.runUsd)}</td>
              <td>{fmtMoney(spend.today[row.todayKey])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className={styles.table}>
        <caption>소스 {run.sources.length}곳</caption>
        <thead>
          <tr>
            <th scope="col">소스</th>
            <th scope="col">검색</th>
            <th scope="col">통과</th>
            <th scope="col">걸러짐</th>
            <th scope="col">본문 실패</th>
            <th scope="col">토큰</th>
            <th scope="col">글당 평균 토큰</th>
            <th scope="col">오류</th>
          </tr>
        </thead>
        <tbody>
          {run.sources.map((s) => {
            const avgTokens = avgTokensPerItem(s.tokensUsed, s.fetched);
            return (
              <tr key={s.sourceId} className={s.sourceId === selectedSourceId ? styles.selected : undefined}>
                <td>
                  {/* 켜진 줄이 배경색으로만 표시돼 화면 밖으로는 신호가 안 나갔다
                      (design-rules "상태를 색으로만 알리지 않는다", 2026-08-31 리뷰 이관분).
                      `aria-current` 로 지금 보고 있는 소스가 어느 줄인지 같이 말한다. */}
                  <Link
                    href={`?source=${encodeURIComponent(s.sourceId)}`}
                    aria-current={s.sourceId === selectedSourceId ? "true" : undefined}
                  >
                    {s.sourceId}
                  </Link>
                </td>
                <td>{fmt(s.fetched)}</td>
                <td>{fmt(s.stored)}</td>
                <td>{fmt(s.filtered)}</td>
                <td>{fmt(s.extractionFailed)}</td>
                <td>{fmt(s.tokensUsed)}</td>
                <td>{avgTokens === null ? "—" : fmt(avgTokens)}</td>
                <td className={s.error ? styles.errorCell : undefined}>{s.error ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selected ? (
        <section className={styles.drilldown} aria-label={`${selected.sourceId} 이번 실행 상세`}>
          <h2>{selected.sourceId} — 이번 실행이 가져온 글</h2>
          {sourceItems === null || sourceItems.length === 0 ? (
            <p className={styles.empty}>이번 실행에서 통과한 글이 없습니다.</p>
          ) : (
            <ul className={styles.itemList}>
              {sourceItems.map((item) => {
                // INV-D6 과 같은 경계 — 이 값은 남의 RSS 가 준 문자열이다. sanitize 는 본문만
                // 훑으므로 이 필드는 렌더 직전에 여기서 직접 걸러야 한다(article-view.tsx 와 동일 패턴).
                const href = safeSourceUrl(item.originalUrl);
                const title = item.titleKo ?? item.title;
                return (
                  <li key={item.id}>
                    {href !== null ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {title}
                      </a>
                    ) : (
                      // href 를 비운 채 링크 모양만 남기면 눌러도 아무 일이 없는 버튼이 된다.
                      <span>{title}</span>
                    )}
                    <div className={styles.itemMeta}>
                      {new Date(item.publishedAt).toLocaleString("ko-KR")}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {selected.filteredTitles.length > 0 ? (
            <>
              <h2>이번 실행에서 걸러진 제목 ({fmt(selected.filtered)}건)</h2>
              <ul className={styles.filteredTitles}>
                {selected.filteredTitles.map((title, i) => (
                  // 걸러진 제목은 안정된 id 가 없다 — 실행 하나 안에서 순서가 바뀌지 않으므로 index 로 둔다.
                  <li key={i}>{title}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
