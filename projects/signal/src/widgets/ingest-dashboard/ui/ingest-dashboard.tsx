import Link from "next/link";
import type { IngestRunRecord, RunSourceItem } from "@/entities/ingest-run";
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
  selectedSourceId: string | null;
  sourceItems: RunSourceItem[] | null;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
// 소수점 둘째 자리까지 — 토큰 수만 봐서는 비용 감이 안 온다는 요청으로 추가(2026-08-17).
// claude-sonnet-5 가격 기준 근사치다(entities/ingest-run/lib/estimate-cost.ts 참고).
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
// 달러도 감이 안 온다는 요청으로 원화를 같이 붙인다(2026-08-26). 환율은 고정 상수라
// 근사치다 — 정확한 청구액은 앤트로픽 콘솔의 달러 금액이 기준(lib/to-krw.ts).
const fmtMoney = (usd: number) => `${fmtUsd(usd)} · ${fmt(toKrw(usd))}원`;

export function IngestDashboard({ run, selectedSourceId, sourceItems }: Props) {
  if (run === null) {
    return (
      <main className={styles.wrap}>
        <div className={styles.pageHead}>
          <h1>수집 파이프라인</h1>
          <p>개발자용 — 최근 실행 1건의 소스별 통계를 보여준다.</p>
        </div>
        <p className={styles.empty}>아직 기록된 실행이 없습니다. `npm run ingest` 를 한 번 돌려보세요.</p>
      </main>
    );
  }

  const t = totals(run.sources);
  const avg = avgMsPerItem(run.elapsedMs, t.fetched);
  const selected = run.sources.find((s) => s.sourceId === selectedSourceId) ?? null;

  // 단가는 실행 시각에 따라 갈린다(2026-08-31 프로모션 종료). 실행을 통째로 넘긴다 —
  // 사용량과 시각을 따로 꺼내 넘기면 서로 다른 실행의 조합이 만들어질 수 있다.
  const { topicCostUsd, enrichCostUsd, totalCostUsd, rateTier } = estimateCostBreakdown(run);

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
          </p>
        ) : null}
      </div>

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
          <dt>토큰 — 주제판정</dt>
          <dd>
            {fmt(run.usage.topicInputTokens + run.usage.topicOutputTokens)}
            <span className={styles.statSub}> {fmtMoney(topicCostUsd)}</span>
          </dd>
        </div>
        <div className={styles.stat}>
          <dt>토큰 — 요약·번역</dt>
          <dd>
            {fmt(run.usage.inputTokens + run.usage.outputTokens)}
            <span className={styles.statSub}> {fmtMoney(enrichCostUsd)}</span>
          </dd>
        </div>
        <div className={styles.stat}>
          {/* 같은 토큰 수라도 실행 시각에 따라 금액이 갈리므로(2026-08-31 프로모션 종료)
              어느 단가를 썼는지 화면에 남긴다. 판단은 entities 가 이미 했고 여기서는
              그 결과로 문구만 고른다 — 날짜를 다시 재면 경계가 두 군데로 갈린다. */}
          <dt>추정 비용 (claude-sonnet-5 {rateTier === "promo" ? "프로모션가" : "정가"} 기준)</dt>
          <dd>{fmtMoney(totalCostUsd)}</dd>
        </div>
      </dl>

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
