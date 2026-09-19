import Link from "next/link";
import {
  displaySummary,
  displayTitle,
  hostFromUrl,
  type ArticleListItem,
} from "@/entities/article";
import { relativeTime } from "@/shared/lib/datetime";
import { sourceMark } from "../lib/source-mark";
import styles from "./feed.module.css";

/**
 * 카드에 보여줄 뱃지 개수 (승인 시안 2026-08-27 · INV-KD1).
 *
 * 예전 값은 2였다 — 칩이 메타 줄 안에 있어서 폭이 안 났기 때문이다(2026-08-11 실측).
 * 뱃지가 **별도 줄**로 내려가면서 그 제약이 없어져 4로 올렸다. 넘치면 `+N` 으로 접는다.
 */
const MAX_VISIBLE_TAGS = 4;

/**
 * 공식 표시 (INV-O2, design-rules 2026-08-11 블록).
 *
 * 두 근거를 가르는 것은 **문구**다 — 포인트색은 피드에서 "아직 안 본 것" 전용이고
 * 두 번째 강조색은 만들지 않기로 했으므로, 확실성 차이를 색으로 나를 수단이 없다.
 * 채움(byUrl)과 점선(byContent)은 거들 뿐이고, 문구만 읽어도 갈려야 한다.
 */
function officialMark(basis: ArticleListItem["officialBasis"], sourceUrl: string) {
  switch (basis) {
    case "byUrl":
      return {
        label: "공식 발표",
        className: styles.official,
        // 출처 **이름**이 아니라 실제 호스트다. 이름은 주소의 한 조각을 다듬은 표시용 값이라
        // `blog.google` 이 "Blog 도메인입니다"로 읽힌다 — 화면을 못 보는 사람에게는
        // 이 문장이 근거의 전부인데 그게 도메인도 발행처도 아닌 말이 된다.
        basisText: `원문 주소가 ${hostFromUrl(sourceUrl) ?? "그 주체"} 도메인입니다`,
      };
    case "byContent":
      return {
        label: "공식 발표라고 함",
        className: styles.claimed,
        basisText: "글 내용을 보고 AI 가 판단했습니다",
      };
    default:
      return null;
  }
}

interface Props {
  article: ArticleListItem;
  isRead: boolean;
  /** 목록 전체가 공유하는 기준 시각(ISO). 카드마다 현재 시각을 따로 읽지 않는다. */
  nowIso: string;
}

// 읽음 기록은 여기서 하지 않는다 — 상세가 실제로 뜬 시점에 features/read-state 가 찍는다.
// 클릭 시점에 찍으면 이동이 실패했을 때 읽지도 않은 글이 흐릿해진다.
export function ArticleCard({ article, isRead, nowIso }: Props) {
  // AI 요약이 없으면 출처가 준 요약글 (INV-S2). 어느 쪽을 고를지는 entities 가 정한다 —
  // 카드와 상세가 각자 판단하면 두 화면이 다른 글을 보여주는 날이 온다.
  const summary = displaySummary(article);
  const title = displayTitle(article);
  const official = officialMark(article.officialBasis, article.sourceUrl);

  return (
    <Link
      className={isRead ? `${styles.card} ${styles.isRead}` : styles.card}
      href={`/articles/${article.id}`}
    >
      {/* 읽음을 색으로만 알리지 않는다 */}
      {isRead ? <span className="sr-only">읽은 글</span> : null}

      <div className={styles.cardBody}>
        {article.isTrending || official !== null ? (
          <div className={styles.badgeRow}>
            {article.isTrending ? (
              <span className={styles.badge}>
                <span aria-hidden="true">🔥</span> 뜨는 중
              </span>
            ) : null}
            {official !== null ? (
              <span className={official.className} data-official={article.officialBasis}>
                {official.label}
                {/* 무엇을 근거로 한 판단인지는 채움·점선으로 전해지지 않는다 */}
                <span className="sr-only"> — {official.basisText}</span>
              </span>
            ) : null}
          </div>
        ) : null}
        <h3 className={styles.cardTitle}>{title.text}</h3>
        {summary !== null ? (
          <p className={styles.cardSummary}>{summary.text}</p>
        ) : null}
      </div>

      {/* 뱃지 줄은 `.cardBody` **밖**이다 (승인 시안 2026-08-27) — 요약이 없는 카드에서도
          점선 발 바로 위에 붙어야 한다. */}
      {article.tags.length > 0 ? (
        <div className={styles.cardKw}>
          {article.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
            <span
              key={`${tag.axis}:${tag.name}`}
              className={`${styles.cardKwChip} ${
                tag.axis === "kind" ? styles.kwKind : styles.kwField
              }`}
            >
              {/* 축은 색으로만 전해진다 — 화면을 못 보는 사람에게는 접두사가 그 정보의 전부다.
                  접두사 앞 공백은 알약 사이를 띄운다 (상세와 같은 이유 — article-view.tsx 참고). */}
              <span className="sr-only">{tag.axis === "kind" ? " 사건종류 " : " 분야 "}</span>
              {tag.name}
            </span>
          ))}
          {/* 넘치는 뱃지를 조용히 버리지 않는다 — 붙어 있는데 안 보이면 화면이 거짓말을 한다 */}
          {article.tags.length > MAX_VISIBLE_TAGS ? (
            <span className={`${styles.cardKwChip} ${styles.kwRest}`}>
              +{article.tags.length - MAX_VISIBLE_TAGS}
              <span className="sr-only">
                개 더: {article.tags.slice(MAX_VISIBLE_TAGS).map((t) => t.name).join(", ")}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.cardFoot}>
        <span className={styles.meta}>
          {/* 표식은 출처 이름을 줄인 것뿐이라 스크린리더에는 중복이다 */}
          <span className={styles.sourceMark} aria-hidden="true">
            {sourceMark(article.sourceName)}
          </span>
          <span className={styles.metaText}>
            {/* 시각이 비면 구분자도 같이 뺀다 — 매달린 가운뎃점이 남지 않게 */}
            {[article.sourceName, relativeTime(article.publishedAt, nowIso)]
              .filter((part) => part !== "")
              .join(" · ")}
          </span>
        </span>
        {/* 태그 칩이 여기 있었다 — 뱃지 줄로 내려가면서 **메타 줄이 비워졌다**
            (승인 시안 2026-08-27). 2026-08-11 의 "메타 줄은 이미 꽉 찼다"가 풀린 자리다. */}
      </div>
    </Link>
  );
}
