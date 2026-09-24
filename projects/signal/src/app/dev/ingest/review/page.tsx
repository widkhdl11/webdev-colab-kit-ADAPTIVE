import { notFound } from "next/navigation";
// 판정 검토 테이블은 secret 키로만 읽는다(INV-VR9) — 조회 함수는 배럴에 없고 서버 전용 자리만 직접 가리킨다.
import { fetchReviewItems, fetchReviewRuns, fetchReviewWeeks } from "@/entities/verdict-review/api/review-queries";
import { pickReviewWeek, type ReviewItem, type ReviewWeek } from "@/entities/verdict-review";
import { reviewNotices } from "@/features/verdict-review";
import { DevNav } from "@/widgets/dev-nav";
import { ReviewNotices, VerdictReview } from "@/widgets/verdict-review";
import { answerVerdictAction } from "./actions";
import { localDevOnly } from "../../local-guard";
import styles from "./page.module.css";

/**
 * 판정 검토 탭 — 핫이슈 판정을 매주 표본 20건으로 채점한다 (docs/specs/verdict-review.md).
 * **로컬 전용**: 수집 대시보드와 같은 가드(관리자 로그인이 없다). 답을 받는 서버 액션도 따로 막는다.
 */
export const dynamic = "force-dynamic";

export default async function VerdictReviewPage() {
  if (!(await localDevOnly())) notFound();

  const now = Date.now();
  let weeks: ReviewWeek[] = [];
  let loadError: string | null = null;
  try {
    // 수정안 표시는 켜진 뒤 검토된 주에서 안 나올 때만 꺼진다 — 짧은 창으로 자르면 켠 두 주가 창 밖으로 나가 꺼진다
    weeks = await fetchReviewWeeks(60);
  } catch (e) {
    // 마이그레이션(0012)을 아직 안 돌렸을 때가 제일 흔하다 — 무엇을 하면 되는지까지 보여 준다.
    loadError = e instanceof Error ? e.message : String(e);
  }
  // 답을 받는 주가 있으면 그 주, 없으면 가장 최근 주 — 규칙은 entities 에 한 자리
  const { week, open } = pickReviewWeek(weeks, now);
  let items: ReviewItem[] = [];
  let lastRun = null;
  if (loadError === null) {
    try {
      [items, { last: lastRun }] = await Promise.all([week ? fetchReviewItems(week.week) : Promise.resolve([]), fetchReviewRuns()]);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }
  const notices = reviewNotices({ weeks, openItems: open ? items : null, lastRun, nowMs: now });

  return (
    <>
      <DevNav current="review" />
      <main className={styles.wrap}>
        <div className={styles.pageHead}>
          <h1>판정 검토</h1>
          <p>핫이슈 판정이 맞았는지 매주 표본 20건으로 채점한다. 정확도 목표치는 첫 4주를 본 뒤 정한다.</p>
        </div>
        {loadError !== null ? (
          <p className={styles.error}>
            판정 검토 기록을 읽지 못했다: {loadError}. 마이그레이션 0012(판정 검토 테이블)를 적용했는지 본다.
          </p>
        ) : (
          <>
            <ReviewNotices notices={notices} />
            <VerdictReview
              week={week}
              items={items}
              history={weeks}
              open={open}
              answer={answerVerdictAction}
            />
          </>
        )}
      </main>
    </>
  );
}
