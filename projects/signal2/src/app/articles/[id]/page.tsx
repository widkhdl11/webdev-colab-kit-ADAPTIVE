import Link from "next/link";
import { notFound } from "next/navigation";

import {
  articleHref,
  DEFAULT_FEED_STATE,
  dummyArticles,
  feedHref,
  filterByKeyword,
  orderForFeed,
  parseFeedState,
} from "@/entities/article";
import { MarkReadOnView } from "@/features/read-state";
import { initialsFor } from "@/shared/lib/initials";
import { machineDate, relativeTime } from "@/shared/lib/kst";

import styles from "./article.module.css";

// 피드와 같은 이유로 렌더 시각이 필요하다(상대시간 표기).
export const dynamic = "force-dynamic";

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const asked = parseFeedState((key) => {
    const raw = sp[key];
    return typeof raw === "string" ? raw : null;
  });
  const nowIso = new Date().toISOString();

  const all = dummyArticles(nowIso);
  const article = all.find((a) => a.id === id);

  // **존재 판정은 거르기 전 목록으로 한다.** 한동안 필터를 건 목록에서 찾았는데, 그러면
  // 켠 뱃지가 안 붙은 글의 주소로 직접 들어왔을 때(손으로 고친 주소·오래된 북마크·공유 링크)
  // 있는 글이 404 가 됐다. 실제로 `/articles/a06?kw=field:MCP` 가 404 였다.
  if (!article) notFound();

  // 그 글이 필터 밖이면 필터를 놓는다 — 그 목록에 없는 글이라 지킬 이웃 약속이 없고,
  // 필터를 든 채로 두면 이전/다음이 둘 다 비어 주소만 거짓말이 된다.
  //
  // `days` 도 같이 놓는다 — 그 값은 주소에 `days` 가 없을 때 "뱃지를 켰으니 3일"으로 합성된
  // 것이라, 필터를 놓으면 근거가 사라진다. 안 놓으면 필터도 안 걸고 「더 보기」도 안 눌렀는데
  // 돌아간 피드가 3일치로 펼쳐진다. (주소에 `days` 가 명시돼 있으면 그건 사용자가 실제로
  // 펼친 값이므로 그대로 둔다.)
  const inFilter =
    asked.keyword === null ||
    filterByKeyword([article], asked.keyword).length > 0;
  const state = inFilter
    ? asked
    : {
        ...asked,
        keyword: null,
        days: typeof sp.days === "string" ? asked.days : DEFAULT_FEED_STATE.days,
      };

  // 이전/다음이 피드에서 보이던 순서와 같아야 하므로 **같은 필터를 걸고 같은 함수로** 줄을 세운다.
  // 정렬만 물려받던 동안에는 거르기 전 전체 목록에서 이웃을 찾아서, 뱃지를 켜고 들어와도
  // 「다음 글」이 필터 밖 글로 넘어갔다. 상세는 클라이언트의 토글 상태를 모르므로
  // 정렬·필터 둘 다 주소로 받는다.
  const ordered = orderForFeed(filterByKeyword(all, state.keyword), state.sort);
  const index = ordered.findIndex((a) => a.id === id);

  // 날짜 경계를 넘어간다 — 오늘 마지막 글의 「다음」은 어제 첫 글이다.
  const prev = index === -1 ? null : (ordered[index - 1] ?? null);
  const next = index === -1 ? null : (ordered[index + 1] ?? null);
  const href = (targetId: string) => articleHref(targetId, state);
  const backHref = feedHref(state);
  const mark = initialsFor(article.source);

  return (
    <article className={styles.read}>
      {/* 읽음은 여기서 기록한다 — 카드 클릭이 아니라 상세가 실제로 떴을 때. */}
      <MarkReadOnView id={article.id} />

      {/* 켜 둔 정렬·필터를 그대로 들고 돌아간다 — 안 그러면 뒤로가기와 이 링크가 다른 곳으로 간다. */}
      <Link className={styles.back} href={backHref}>
        ← 피드로 돌아가기
      </Link>

      <h1 className={styles.title}>{article.title}</h1>

      <div className={styles.metaRow}>
        <span className={styles.source}>
          {mark !== "" && (
            <span className={styles.sourceMark} aria-hidden="true">
              {mark}
            </span>
          )}
          {article.source}
        </span>
        <span>
          <time dateTime={machineDate(article.publishedAt)}>
            {relativeTime(article.publishedAt, nowIso)}
          </time>
        </span>

        {/* 번역이 없으면 이 줄은 아예 안 나온다 — 원문이 이미 제목 자리에 있다. */}
        {article.originalTitle !== null && (
          <span className={styles.originalTitle}>
            <span className={styles.originalTitleLabel}>원문 제목: </span>
            {article.originalTitle}
          </span>
        )}
      </div>

      {/* 카드는 4개까지만 보여주고 +N 으로 접지만 상세는 전부 보여준다 — 폭이 넉넉하다.
          카드와 같은 알약 언어를 쓰되 높이만 한 단계 크다(--kw-detail-chip-h). */}
      {article.keywords.length > 0 && (
        <ul className={styles.keywords} aria-label="키워드">
          {article.keywords.map((keyword) => (
            <li
              key={`${keyword.axis}:${keyword.name}`}
              className={`${styles.keyword} ${
                keyword.axis === "field" ? styles.kwField : styles.kwKind
              }`}
            >
              {/* 축은 색으로만 전해지므로 스크린리더용 접두사를 둔다(카드와 같은 문구). */}
              <span className="sr-only">
                {keyword.axis === "field" ? "분야 " : "사건종류 "}
              </span>
              {keyword.name}
            </li>
          ))}
        </ul>
      )}

      {article.summary !== null && (
        <div className={styles.summaryBox}>
          <span className={styles.summaryLabel}>AI 요약</span>
          <p className={styles.summaryText}>{article.summary}</p>
          <p className={styles.summaryNote}>
            요약은 모델이 만든 것이라 틀릴 수 있습니다. 원문이 진실입니다.
          </p>
        </div>
      )}

      <div className={styles.outbound}>
        <a
          className={styles.outboundLink}
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {article.source}에서 원문 읽기
        </a>
      </div>

      {/* 끝에 닿아도 없애지 않는다 — 사라지면 키보드 포커스가 문서 맨 위로 떨어진다.
          640px 아래에서는 이 줄이 화면 아래 고정 줄이 된다(article.module.css).

          **비활성 쪽이 `<button>` 인 이유**: `<span aria-disabled>` 은 포커스를 못 받고
          role 이 없어 aria-disabled 가 보조기술에 전달되지 않는다. 화면에는 남는데 탭
          순서에서는 사라져서, "포커스를 그대로 둔다"는 이 줄의 존재 이유가 무너진다.
          피드의 「더 보기」와 뱃지 줄의 「모두 보임」이 이미 쓰는 처리와 같게 맞춘다. */}
      <nav className={styles.readNav} aria-label="글 이동" data-dock>
        {prev ? (
          <Link className={`${styles.navButton} ${styles.navPrev}`} href={href(prev.id)}>
            <span className={styles.navRole}>← 이전 글</span>
            <span className={styles.navTitle}>{prev.title}</span>
          </Link>
        ) : (
          <button
            type="button"
            className={`${styles.navButton} ${styles.navPrev}`}
            aria-disabled="true"
          >
            <span className={styles.navRole}>← 이전 글</span>
            <span className={styles.navTitle}>첫 글입니다</span>
          </button>
        )}

        {next ? (
          <Link className={`${styles.navButton} ${styles.navNext}`} href={href(next.id)}>
            <span className={styles.navRole}>다음 글 →</span>
            <span className={styles.navTitle}>{next.title}</span>
          </Link>
        ) : (
          <button
            type="button"
            className={`${styles.navButton} ${styles.navNext}`}
            aria-disabled="true"
          >
            <span className={styles.navRole}>다음 글 →</span>
            <span className={styles.navTitle}>마지막 글입니다</span>
          </button>
        )}
      </nav>
    </article>
  );
}
