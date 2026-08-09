import Link from "next/link";
import { displaySummary, type Article } from "@/entities/article";
import { ArticleBody, safeSourceUrl } from "@/features/content-render";
import { MarkReadOnView } from "@/features/read-state";
import { relativeTime } from "@/shared/lib/datetime";
import styles from "./article-view.module.css";

interface Props {
  article: Article;
  nowIso: string;
}

export function ArticleView({ article, nowIso }: Props) {
  const sourceHref = safeSourceUrl(article.sourceUrl);
  const when = relativeTime(article.publishedAt, nowIso);
  // AI 요약 → 없으면 출처가 준 요약글 (INV-S2). 고르는 규칙은 entities 한 곳에 있다.
  const summary = displaySummary(article);

  return (
    <main className={styles.read}>
      {/* 상세가 뜬 시점 = 읽은 시점 */}
      <MarkReadOnView id={article.id} />

      <Link className={styles.back} href="/">
        <span aria-hidden="true">←</span> 피드로
      </Link>

      <h1 className={styles.title}>{article.title}</h1>

      <div className={styles.metaRow}>
        <span className={styles.who}>
          {/* 발행시각을 못 읽으면 빈 문자열이 온다. 구분자까지 같이 빼지 않으면
              "출처 · " 처럼 매달린 가운뎃점만 남는다. */}
          <strong>{article.sourceName}</strong>
          {when !== "" ? ` · ${when}` : null}
        </span>
        <span className={styles.tags}>
          {article.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </span>
      </div>

      {/* 요약은 신뢰 경계 밖이다 — 원문과 분리하고, 어디서 온 글인지 문구로 드러낸다.
          AI 요약이 없으면 출처가 준 요약글을 대신 보여준다(INV-S2). 둘 다 없으면
          박스 자체를 그리지 않는다(빈 박스가 더 나쁜 정보다).
          **라벨을 값에 맞춰야 한다** — 출처 글을 "AI 요약"이라고 붙이면 표시가 거짓이 된다. */}
      {summary !== null ? (
        <section
          className={styles.aiSummary}
          aria-label={summary.isAi ? "AI 요약" : "출처가 준 요약"}
        >
          <span className={styles.aiLabel}>
            <span aria-hidden="true">{summary.isAi ? "✨" : "❞"}</span>{" "}
            {summary.isAi ? "AI 요약" : "출처가 준 요약"}
          </span>
          <p>{summary.text}</p>
          {summary.isAi && article.summaryPoints.length > 0 ? (
            <ul>
              {article.summaryPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
          <p className={styles.caveat}>
            {summary.isAi
              ? "요약은 자동으로 생성됩니다. 사실 확인이 필요하면 아래 원문을 읽어주세요."
              : "출처가 제공한 소개글입니다. 자세한 내용은 원문을 읽어주세요."}
          </p>
        </section>
      ) : null}

      {/* 원문을 안 주는 출처가 있다 — RSS 가 제목·링크만 주는 경우다(2026-08-09 실측: HN·OpenAI 둘 다).
          그때도 "아래는 원문입니다"를 띄우면 그 아래가 비어 있어 화면이 거짓말을 한다.
          없으면 없다고 말하고 출처로 보낸다. */}
      <article className={styles.prose}>
        {article.contentHtml.trim() !== "" ? (
          <>
            <p className={styles.sourceNote}>아래는 출처에서 가져온 원문입니다.</p>
            <ArticleBody html={article.contentHtml} />
          </>
        ) : (
          <p className={styles.sourceNote}>
            이 출처는 원문 전문을 제공하지 않습니다. 아래 링크로 출처에서 읽어 주세요.
          </p>
        )}
      </article>

      <div className={styles.foot}>
        <span className={styles.note}>원문의 저작권은 출처에 있습니다.</span>
        {/* INV-D6: 출처 링크는 본문 밖 필드라 sanitize 를 거치지 않는다 — 여기서 가드를 통과해야 한다.
            통과 못 하면 링크 자체를 그리지 않는다. href 만 비우고 버튼 모양을 남기면
            눌러도 아무 일이 없는 버튼이 되어 화면이 거짓말을 한다. */}
        {sourceHref !== null ? (
          <a
            className={styles.sourceButton}
            href={sourceHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            출처에서 원문 보기 <span aria-hidden="true">↗</span>
            <span className="sr-only">새 창에서 열림</span>
          </a>
        ) : null}
      </div>
    </main>
  );
}
