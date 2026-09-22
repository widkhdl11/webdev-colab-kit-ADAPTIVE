"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildKeywordBadges, selectFeed } from "@/entities/article";
import type { ArticleListItem, ArticleTag, FeedSegment } from "@/entities/article";
import { useReadArticles } from "@/features/read-state";
import { dayKey } from "@/shared/lib/datetime";
import { DaySection } from "./day-section";
import { FeedControls } from "./feed-controls";
import { KeywordBadges } from "./keyword-badges";
import styles from "./feed.module.css";

/** 한 번에 보여줄 건수. "더 보기"를 누르면 이만큼씩 늘어난다. */
const PAGE_SIZE = 12;

interface Props {
  articles: ArticleListItem[];
  /** 서버에서 한 번 정한 기준 시각(ISO). 날짜 묶음·상대시각이 전부 이 값을 본다. */
  nowIso: string;
}

export function FeedScreen({ articles, nowIso }: Props) {
  const [segment, setSegment] = useState<FeedSegment>("hot");
  const [tag, setTag] = useState<ArticleTag | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [notice, setNotice] = useState("");
  const { isRead } = useReadArticles();

  const { groups, shown, total } = useMemo(
    () => selectFeed({ articles, segment, tag, limit }),
    [articles, segment, tag, limit],
  );
  const todayKey = useMemo(() => dayKey(nowIso), [nowIso]);

  /**
   * 지금 비어 있는 이유를 문장으로 (2026-09-21).
   *
   * 자리 → 주제 → 수집 순으로 가른다. **먼저 걸린 것이 원인이다** — 핫이슈가 0건이면
   * 주제 필터를 탓할 이유가 없고, 자리가 `소식` 인데 비었으면 그때야 수집을 말할 수 있다.
   */
  const emptyMessage = useMemo(() => {
    if (segment === "hot") {
      const rest = articles.filter((a) => a.gate === null).length;
      return rest > 0
        ? `오늘은 핫이슈가 없습니다 — 소식에 ${rest}건 있습니다.`
        : "오늘은 핫이슈가 없습니다.";
    }
    if (segment === "tools") {
      return tag === null
        ? "스킬·툴로 분류된 글이 아직 없습니다."
        : "이 주제의 스킬·툴 글이 아직 없습니다.";
    }
    return tag === null ? "아직 모인 소식이 없습니다." : "이 주제로 모인 소식이 아직 없습니다.";
  }, [segment, tag, articles]);

  /**
   * 목록 길이가 바뀐 것을 화면 밖으로도 알린다 (design-rules 「늘어난 건수는 화면 밖으로도
   * 알린다」의 반대 방향). 자리를 바꾸면 결과가 줄어드는데, 전해지는 것이 눌림
   * (`aria-pressed`) 뿐이라 화면을 못 보는 사람에게는 "줄었다"가 안 남았다.
   *
   * **첫 렌더에서는 말하지 않는다** — 페이지를 열자마자 읽어 주면 소음이다.
   */
  const announced = useRef(false);
  useEffect(() => {
    if (!announced.current) {
      announced.current = true;
      return;
    }
    setNotice(total === 0 ? emptyMessage : `${total}건 중 ${shown}건 표시`);
  }, [segment, tag, total, shown, emptyMessage]);

  // 뱃지 줄은 **필터가 걸리기 전 목록**으로 센다 — 필터를 켠 뒤에도 다른 뱃지가 그대로
  // 보여야 갈아탈 수 있다. 필터 결과로 다시 세면 켠 뱃지 하나만 남는다.
  // `isRead` 는 숫자에만 쓰인다: 자리·순서·노출은 전체 건수가 정한다(design-rules 2026-08-27).
  const badges = useMemo(
    () => buildKeywordBadges({ articles, isRead, nowIso }),
    [articles, isRead, nowIso],
  );

  // 조건이 바뀌면 다시 처음부터 — 이전에 펼쳐둔 개수가 남아 있으면 결과가 뜬금없이 길어진다.
  const changeSegment = useCallback((next: FeedSegment) => {
    setSegment(next);
    setLimit(PAGE_SIZE);
    setNotice("");
  }, []);
  const changeTag = useCallback((next: ArticleTag | null) => {
    setTag(next);
    setLimit(PAGE_SIZE);
    setNotice("");
  }, []);

  return (
    <main className={styles.wrap}>
      <div className={styles.pageHead}>
        <h1>오늘의 신호</h1>
        <p>
          매일 아침 갱신 · 핫이슈는 읽어야 할 것만 골라 담고, 소식은 나머지 전부입니다.
          스킬·툴은 그중 툴 이야기만 따로 모읍니다.
        </p>
      </div>

      <FeedControls
        segment={segment}
        tag={tag}
        onSegmentChange={changeSegment}
        onTagChange={changeTag}
      />

      <KeywordBadges badges={badges} selected={tag} onSelect={changeTag} />

      {groups.length === 0 ? (
        // **무엇 때문에 비었는지를 가려 말한다.** 화면이 엉뚱한 것을 탓하면 사용자가
        // 고칠 수 없는 쪽을 보게 된다.
        //
        // 2026-09-21 에 갈래가 하나 늘었다: 그 전에는 세그먼트가 안 걸러서 `tag` 만 보면
        // 됐는데, 이제 자리가 실제로 거른다. 기본 자리가 `핫이슈` 라 **아무것도 안 건드린
        // 첫 화면이 곧 걸러진 상태**다 — 핫이슈 0건인 날 소식에 100건이 있어도 옛 조건은
        // "아직 모인 소식이 없습니다"를 띄웠고, 그건 수집이 안 돈 날과 겉이 같다.
        // 핫이슈가 0건인 날은 정상이라고 INV-N4 가 명시했으므로 그 문장은 거짓이 된다.
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        groups.map((group) => (
          <DaySection
            key={group.dayKey}
            group={group}
            todayKey={todayKey}
            nowIso={nowIso}
            isRead={isRead}
          />
        ))
      )}

      {/* **버튼을 조건부로 없애지 않는다.** 안쪽 분기가 「모두 불러왔습니다」 + aria-disabled
          로 규칙을 지키는데 바깥 조건이 그 위에서 통째로 언마운트하고 있었다 —
          사라지는 순간 키보드 포커스가 문서 맨 위로 떨어진다. 자리가 셋이 되면서 실제로
          물렸다: 핫이슈 10건이면 total ≤ 12 라 버튼이 아예 없고, 소식에서 보이던 버튼이
          자리를 바꾸면 사라진다 (2026-09-21 리뷰). */}
      {total > 0 ? (
        <div className={styles.more}>
          {/* 다 불러와도 버튼을 없애지 않는다 — 사라지는 순간 포커스가 문서 맨 위로 떨어진다 */}
          <button
            type="button"
            aria-disabled={shown >= total}
            onClick={() => {
              if (shown >= total) return;
              const next = Math.min(total, shown + PAGE_SIZE);
              setLimit((n) => n + PAGE_SIZE);
              // 누적으로 알린다. "12건 더 불러왔습니다"처럼 증가분만 쓰면 두 번째부터
              // 같은 문자열이 되고, aria-live 는 값이 안 바뀌면 아무 말도 하지 않는다.
              setNotice(`${total}건 중 ${next}건 표시`);
            }}
          >
            {shown < total ? "더 보기" : "모두 불러왔습니다"}
          </button>
        </div>
      ) : null}

      {/* 목록이 길어진 것을 화면 밖에서도 알 수 있게 */}
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
    </main>
  );
}
