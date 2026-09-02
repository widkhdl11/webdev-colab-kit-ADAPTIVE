import Link from "next/link";

import type { Article, FeedState } from "@/entities/article";
import { articleHref } from "@/entities/article";
import { initialsFor } from "@/shared/lib/initials";
import { machineDate, relativeTime } from "@/shared/lib/kst";

import styles from "./feed.module.css";

/** 카드에 보이는 키워드 수. 넘으면 +N 으로 접는다. 붙을 수 있는 최대는 5(분야 3 + 사건종류 2). */
const CARD_KEYWORDS = 4;

type Props = {
  article: Article;
  nowIso: string;
  /**
   * 상세가 피드와 같은 목록을 보게 정렬·필터를 주소에 실어 보낸다.
   * 정렬만 보내던 동안 상세는 **거르기 전 전체 목록**으로 이웃을 찾았고,
   * 그래서 「다음 글」이 필터 밖 글로 넘어갔다 — 화면이 거짓말을 하는 것이다.
   * 주소를 조립하는 규칙은 `entities/article` 의 `articleHref` 하나뿐이다.
   */
  feedState: FeedState;
  isRead: boolean;
};

export function ArticleCard({ article, nowIso, feedState, isRead }: Props) {
  const mark = initialsFor(article.source);
  const hasBadgeRow = article.isTrending || article.official !== null;
  const shownKeywords = article.keywords.slice(0, CARD_KEYWORDS);
  const hiddenCount = article.keywords.length - shownKeywords.length;

  return (
    <Link
      href={articleHref(article.id, feedState)}
      className={isRead ? `${styles.card} ${styles.isRead}` : styles.card}
    >
      {/* 상태를 색으로만 알리지 않는다. */}
      {isRead && <span className="sr-only">읽은 글</span>}

      <div className={styles.cardBody}>
        {hasBadgeRow && (
          <div className={styles.badgeRow}>
            {article.isTrending && (
              <span className={styles.badge}>🔥 뜨는 중</span>
            )}

            {/* 두 표시를 가르는 것은 문구다. 무엇을 근거로 한 판단인지는 형태로는 안 전해지므로
                스크린리더용 설명을 함께 둔다. */}
            {article.official === "byUrl" && (
              <span className={styles.official}>
                공식 발표
                <span className="sr-only">
                  {` — 원문 주소가 ${article.source} 도메인입니다`}
                </span>
              </span>
            )}
            {article.official === "byContent" && (
              <span className={styles.claimed}>
                공식 발표라고 함
                <span className="sr-only">
                  {" — 글 내용을 보고 AI 가 판단했습니다"}
                </span>
              </span>
            )}
          </div>
        )}

        <h3 className={styles.cardTitle}>{article.title}</h3>

        {/* 요약이 없으면 문단을 통째로 빼고 그 빈칸을 그대로 둔다.
            없는 것을 말로 채우면 곧 채워질 것처럼 읽히는데 사실과 다르다. */}
        {article.summary !== null && (
          <p className={styles.cardSummary}>{article.summary}</p>
        )}

        {/* 키워드는 메타 줄이 아니라 여기 별도 줄에 선다. 뱃지만 보고 무슨 내용인지
            가늠할 수 있어야 제목을 하나하나 해석하는 피로가 줄어든다. */}
        {article.keywords.length > 0 && (
          <div className={styles.cardKeywords}>
            {shownKeywords.map((keyword) => (
              <span
                key={`${keyword.axis}:${keyword.name}`}
                className={`${styles.cardKeyword} ${
                  keyword.axis === "field" ? styles.kwField : styles.kwKind
                }`}
              >
                {/* 축은 색으로만 전해지므로 스크린리더용 접두사를 둔다. */}
                <span className="sr-only">
                  {keyword.axis === "field" ? "분야 " : "사건종류 "}
                </span>
                {keyword.name}
              </span>
            ))}
            {hiddenCount > 0 && (
              /* +N 은 두 축에 걸쳐 있어 축 색을 안 쓴다. */
              <span className={`${styles.cardKeyword} ${styles.kwOverflow}`}>
                +{hiddenCount}
                <span className="sr-only">
                  {` — ${article.keywords
                    .slice(CARD_KEYWORDS)
                    .map((k) => k.name)
                    .join(", ")}`}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.cardFoot}>
        <span className={styles.meta}>
          {mark !== "" && (
            /* 출처 이름을 줄인 것뿐이라 스크린리더에는 감춘다 — 옆에 전체 이름이 이미 있다. */
            <span className={styles.sourceMark} aria-hidden="true">
              {mark}
            </span>
          )}
          <span className={styles.metaText}>
            {article.source}
            {" · "}
            <time dateTime={machineDate(article.publishedAt)}>
              {relativeTime(article.publishedAt, nowIso)}
            </time>
          </span>
        </span>
      </div>
    </Link>
  );
}
