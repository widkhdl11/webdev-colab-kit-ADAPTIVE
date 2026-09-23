import Link from "next/link";
import { displaySummary, displayTitle, type Article, type SignalKey } from "@/entities/article";
import { sourcePresentation } from "@/entities/source";
import { ArticleBody, safeSourceUrl } from "@/features/content-render";
import { MarkReadOnView } from "@/features/read-state";
import { relativeTime } from "@/shared/lib/datetime";
import styles from "./article-view.module.css";
import { AiSummaryBody } from "./summary-markup";

/**
 * 화면 라벨 (design-rules 2026-09-23 화면 어휘). 판정 질문(모델용 문장)과 갈라 둔다 —
 * 화면에는 이 넷 밖의 말이 나오지 않는다. 카드 뱃지로도 쓸 수 있게 두 단어 이내다.
 */
const SIGNAL_LABELS: Record<SignalKey, string> = {
  change: "실무 영향",
  direction: "흐름 변화",
  window: "시한 있음",
};

/** 이전/다음 한 칸. 주소는 피드 상태를 실어 페이지가 만든다(`articleHref`). */
export interface ArticleNavLink {
  href: string;
  title: string;
}

interface Props {
  article: Article;
  nowIso: string;
  /** 「피드로」가 돌아갈 주소 — 들어올 때의 자리·필터·펼친 날 수를 그대로 싣는다. */
  backHref?: string;
  /**
   * 하단 이전/다음 (design-rules 2026-09-01). `null` 이면 줄을 안 그린다 — 이 글이
   * 피드 목록 밖이라 이웃을 모를 때다. 칸 하나가 `null` 이면 그쪽 끝에 닿은 것이다.
   */
  nav?: { prev: ArticleNavLink | null; next: ArticleNavLink | null } | null;
}

export function ArticleView({
  article,
  nowIso,
  backHref = "/",
  nav = null,
}: Props) {
  const sourceHref = safeSourceUrl(article.sourceUrl);
  const when = relativeTime(article.publishedAt, nowIso);
  // AI 요약 → 없으면 출처가 준 요약글 (INV-S2). 고르는 규칙은 entities 한 곳에 있다.
  const summary = displaySummary(article);
  const title = displayTitle(article);
  const source = sourcePresentation(article.sourceId, article.sourceName);
  // 한 줄 요약은 AI 요약일 때만 온다(INV-S2) — 그 판단도 displaySummary 가 한다.
  const oneLine = summary?.oneLine ?? null;
  const signalPointsList = article.signalPoints ?? [];
  // 분야 먼저, 사건종류 다음 — 색이 없어진 만큼 순서가 축을 나른다.
  const orderedTags = [
    ...article.tags.filter((t) => t.axis !== "kind"),
    ...article.tags.filter((t) => t.axis === "kind"),
  ];

  return (
    <main className={styles.read}>
      {/* 상세가 뜬 시점 = 읽은 시점 */}
      <MarkReadOnView id={article.id} />

      {/* 켜 둔 자리·필터·펼친 양을 들고 돌아간다 — 안 그러면 뒤로가기와 이 링크가 다른 곳으로 간다. */}
      <Link className={styles.back} href={backHref}>
        <span aria-hidden="true">←</span> 피드로
      </Link>

      <h1 className={styles.title}>{title.text}</h1>

      {/* 한 줄 요약 — 제목 바로 아래 (design-rules 2026-09-23 「상세 화면 재구성」). 이 글을 모르는
          사람이 읽어도 서는 한 문장이다. 옛 요약에는 없다 — 다시 요약하지 않는다. */}
      {oneLine !== null ? <p className={styles.leadLine}>{oneLine}</p> : null}

      <div className={styles.metaRow}>
        {/* 메타 한 줄: 출처 · 시각 · 분야 · 사건종류. 키워드를 알약 대신 글자로 이어 쓴다 —
            상세의 알약은 눌리지 않는데 눌릴 것처럼 보였다. 분야를 먼저 쓰고, 두 축을 가르던 색 대신
            스크린리더용 접두사가 축을 나른다. 발행시각을 못 읽으면 가운뎃점까지 같이 뺀다. */}
        <span className={styles.who}>
          <strong>{source.displayName}</strong>
          {when !== "" ? ` · ${when}` : null}
          {orderedTags.map((tag) => (
            <span key={`${tag.axis}:${tag.name}`}>
              {" · "}
              <span className="sr-only">{tag.axis === "kind" ? "사건종류 " : "분야 "}</span>
              {tag.name}
            </span>
          ))}
        </span>
        {/* 원문 제목을 함께 남긴다 (INV-S6) — 번역이 틀렸을 때 대조할 것이 있어야 한다. `lang` 을
            걸지 않는다: 원문이 영어라는 보장이 없고 틀린 lang 은 발음을 잘못 바꾼다. */}
        {title.original !== null ? (
          <p className={styles.originalTitle}>원문: {title.original}</p>
        ) : null}
      </div>

      {/* signal 포인트 — 핫이슈 판정에서 참인 질문과 그 근거 (hot-issue INV-G2). 판정이 없는 글은
          절이 통째로 없다 — 「해당 없음」이라고 쓰지 않는다(절이 없는 것이 정직한 상태). */}
      {signalPointsList.length > 0 ? (
        <section className={styles.sec} aria-labelledby="signal-points-heading">
          <h2 className={styles.secHeading} id="signal-points-heading">
            <span className={styles.brand}>signal</span> 포인트
          </h2>
          <ul className={styles.points}>
            {signalPointsList.map((point) => (
              <li key={point.key}>
                <span className={styles.pointLabel}>{SIGNAL_LABELS[point.key]}</span>
                {point.reason !== null ? <span className={styles.pointText}>{point.reason}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 핵심 — 무슨 일이 있었나. signal 포인트는 그것이 왜 신호인가다(design-rules 2026-09-23). */}
      {summary !== null ? (
        <section
          className={styles.sec}
          aria-labelledby="summary-heading"
        >
          <h2 className={styles.secHeading} id="summary-heading">
            {summary.isAi ? "핵심" : "출처가 준 요약"}
          </h2>
          {summary.isAi ? (
            <AiSummaryBody
              isLegacy={summary.isLegacy}
              legacyText={summary.text}
              points={summary.points}
              table={article.summaryTable ?? null}
            />
          ) : (
            // 출처가 준 글은 문단 하나 그대로다 — 번호 목록·표를 붙이지 않는다(INV-D7 · INV-S7).
            <p className={styles.excerpt}>{summary.text}</p>
          )}
          <p className={styles.caveat}>
            {summary.isAi
              ? "요약은 자동으로 만들어집니다. 사실 확인이 필요하면 원문을 읽어주세요."
              : "출처가 제공한 소개글입니다. 자세한 내용은 원문을 읽어주세요."}
          </p>
        </section>
      ) : null}

      {/* 원문 — 기본 접힘 (design-rules 2026-09-23). 요약보다 크게 전면에 서지 않게 한다.
          펼치기 라벨에 원문의 언어·성격을 적는다(소스 설정). 원문을 안 주는 출처는 접을 것이
          없으므로 안내 한 줄만 둔다 — 빈 상자를 펼치게 하면 화면이 거짓말을 한다. */}
      {article.contentHtml.trim() !== "" ? (
        <details className={styles.orig}>
          <summary>
            <span>
              원문 보기
              {source.originalNote !== null ? (
                <span className={styles.origNote}> ({source.originalNote})</span>
              ) : null}
            </span>
            <span className={styles.origAct} aria-hidden="true">
              <span className={styles.actOpen}>펼치기 ▾</span>
              <span className={styles.actClose}>접기 ▴</span>
            </span>
          </summary>
          {/* 원문의 언어를 건다(소스 설정) — 안내 문장은 우리 말이라 ko 로 되돌린다. 설정에 없는
              소스면 lang 을 걸지 않는다: 틀린 lang 은 발음을 잘못 바꾼다. */}
          <article className={styles.prose} lang={source.originalLang ?? undefined}>
            <p className={styles.sourceNote} lang="ko">
              아래는 출처에서 가져온 원문입니다.
            </p>
            <ArticleBody html={article.contentHtml} />
          </article>
        </details>
      ) : (
        <p className={styles.noOriginal}>
          이 출처는 원문 전문을 제공하지 않습니다. 아래 링크로 출처에서 읽어 주세요.
        </p>
      )}

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

      {nav !== null ? (
        <nav className={styles.readNav} aria-label="글 이동" data-dock>
          <NavSlot side="prev" link={nav.prev} />
          <NavSlot side="next" link={nav.next} />
        </nav>
      ) : null}
    </main>
  );
}

/**
 * 이전 글 / 다음 글 한 칸.
 *
 * **끝에 닿아도 없애지 않는다.** 없애면 키보드 포커스가 문서 맨 위로 떨어진다 — 피드의
 * 「더 보기」와 같은 이유다. 비활성 쪽이 `<span>` 이 아니라 `<button>` 인 이유: `span` 은
 * 포커스를 못 받고 role 이 없어 `aria-disabled` 가 보조기술에 전해지지 않는다.
 *
 * 640px 아래에서는 이 줄이 화면 아래 고정 줄이 된다(article-view.module.css).
 */
function NavSlot({
  side,
  link,
}: {
  side: "prev" | "next";
  link: ArticleNavLink | null;
}) {
  const className = `${styles.navButton} ${side === "prev" ? styles.navPrev : styles.navNext}`;
  const role = side === "prev" ? "← 이전 글" : "다음 글 →";
  if (link === null) {
    return (
      <button type="button" className={className} aria-disabled="true">
        <span className={styles.navRole}>{role}</span>
        <span className={styles.navTitle}>
          {side === "prev" ? "첫 글입니다" : "마지막 글입니다"}
        </span>
      </button>
    );
  }
  return (
    <Link className={className} href={link.href}>
      <span className={styles.navRole}>{role}</span>
      {/* 제목을 같이 보여준다 — 「다음 글 →」만 있으면 누르기 전에 무엇인지 모른다 */}
      <span className={styles.navTitle}>{link.title}</span>
    </Link>
  );
}
