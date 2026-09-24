"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  articleHref,
  buildSegmentBadges,
  feedEmptyReason,
  feedHref,
  parseFeedState,
  selectFeed,
  withMoreDays,
  withSegment,
  withTag,
} from "@/entities/article";
import type {
  ArticleListItem,
  ArticleTag,
  FeedSegment,
  FeedState,
} from "@/entities/article";
import { useReadArticles } from "@/features/read-state";
import { dayHeading, dayKey } from "@/shared/lib/datetime";
import { DaySection } from "./day-section";
import { FeedControls } from "./feed-controls";
import { KeywordBadges } from "./keyword-badges";
import styles from "./feed.module.css";

interface Props {
  articles: ArticleListItem[];
  /** 서버에서 한 번 정한 기준 시각(ISO). 날짜 묶음·상대시각이 전부 이 값을 본다. */
  nowIso: string;
}

export function FeedScreen({ articles, nowIso }: Props) {
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState("");
  const { isRead } = useReadArticles();
  const pressedSegmentId = useId();

  /**
   * 자리·필터·펼친 날 수를 **주소에서 읽는다** (design-rules 2026-09-01 (3)).
   *
   * 2026-09-23 까지는 `useState` 로 들고 있어서, 「소식」을 보다가 글을 열고 뒤로 오면
   * 「핫이슈」 첫 화면으로 돌아갔다. 주소가 근거면 뒤로·앞으로가 저절로 맞는다.
   */
  const fromUrl = useMemo(
    () => parseFeedState((key) => searchParams.get(key)),
    [searchParams],
  );

  const state = fromUrl;
  const { segment, tag, days } = state;

  /**
   * 주소를 갈아 끼운다 — **서버에 다시 묻지 않는다.**
   *
   * 처음에는 `router.replace` 를 썼는데, 이 페이지는 요청마다 렌더(`force-dynamic`)라 칩을
   * 누를 때마다 피드 전체 조회가 다시 나가고 기준 시각까지 새로 잡혔다(2026-09-23 리뷰).
   * 화면에 필요한 글은 이미 전부 들고 있다. Next 15 는 `history.replaceState` 를
   * `useSearchParams` 와 맞춰 주므로 이것만으로 주소·화면·뒤로가기가 같이 움직인다.
   * `replace` 라 히스토리가 안 쌓이고, 스크롤도 그대로다.
   */
  const go = useCallback((next: FeedState) => {
    window.history.replaceState(null, "", feedHref(next));
  }, []);

  const { groups, shown, total, nextDay } = useMemo(
    () => selectFeed({ articles, segment, tag, days }),
    [articles, segment, tag, days],
  );
  const todayKey = useMemo(() => dayKey(nowIso), [nowIso]);
  const hrefOf = useCallback((id: string) => articleHref(id, state), [state]);

  /**
   * 지금 비어 있는 이유를 문장으로 (2026-09-21).
   *
   * **어느 것이 원인인지는 entities 가 가른다**(feedEmptyReason — 자리 → 주제 → 수집, 먼저 걸린
   * 것이 원인). 여기서는 문장만 고른다. 2026-09-24 까지는 이 판단이 여기 있었고, 핫이슈 분기가
   * 켠 키워드를 안 봐서 핫이슈가 있는데도 「오늘은 핫이슈가 없습니다」가 나왔다.
   */
  const emptyMessage = useMemo(() => {
    // 펼친 날에만 없고 옛날에는 있다 — 키워드를 켠 채 날을 좁혀 둔 경우다(뱃지 줄은 펼친 날만
    // 센다, 2026-09-24). 「아직 없습니다」라고 쓰면 더 보기 뒤에 있는 글을 없다고 말하게 된다.
    if (total > 0) return "펼친 날에는 이 주제의 글이 없습니다 — 더 보기로 이전 날을 펼쳐 보세요.";
    const reason = feedEmptyReason({ articles, segment, tag });
    if (reason.kind === "noHot") {
      return reason.newsCount > 0
        ? `오늘은 핫이슈가 없습니다 — 소식에 ${reason.newsCount}건 있습니다.`
        : "오늘은 핫이슈가 없습니다.";
    }
    if (reason.kind === "elsewhere") {
      return `이 자리에는 이 주제의 글이 없습니다 — 전체에 ${reason.allCount}건 있습니다.`;
    }
    if (segment === "hot") return "이 주제의 핫이슈가 아직 없습니다.";
    if (segment === "tools") {
      return tag === null
        ? "스킬·툴로 분류된 글이 아직 없습니다."
        : "이 주제의 스킬·툴 글이 아직 없습니다.";
    }
    // `전체` 는 「소식」이라고 쓰지 않는다 — 소식이 자리 이름이라 그 자리만 빈 것처럼 읽힌다.
    if (segment === "all") {
      return tag === null
        ? "아직 모인 글이 없습니다."
        : "이 주제로 모인 글이 아직 없습니다.";
    }
    return tag === null
      ? "아직 모인 소식이 없습니다."
      : "이 주제로 모인 소식이 아직 없습니다.";
  }, [segment, tag, articles, total]);

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

  // 뱃지 줄은 **지금 자리의 글**로 센다 — 규칙은 entities 의 buildSegmentBadges 에 있다.
  // `isRead` 는 숫자에만 쓰인다: 자리·순서·노출은 전체 건수가 정한다(design-rules 2026-08-27).
  const { badges, elsewhere } = useMemo(
    () => buildSegmentBadges({ articles, segment, isRead, days }),
    [articles, segment, isRead, days],
  );

  // 뱃지를 켜고 꺼도 펼친 날은 그대로, 자리를 바꾸면 날 수를 처음으로 돌리는
  // 규칙은 entities 에 있다(withTag · withSegment).
  const changeSegment = useCallback(
    (next: FeedSegment) => {
      setNotice("");
      go(withSegment(state, next));
    },
    [go, state],
  );
  const changeTag = useCallback(
    (next: ArticleTag | null) => {
      setNotice("");
      go(withTag(state, next));
    },
    [go, state],
  );

  return (
    <main className={styles.wrap}>
      <div className={styles.pageHead}>
        <h1>오늘의 신호</h1>
        <p>
          매일 아침 갱신 · 핫이슈는 읽어야 할 것만 골라 담고, 소식은 나머지
          전부입니다. 전체는 둘을 합친 것이고, 스킬·툴은 그중 툴 이야기만 따로 모읍니다.
        </p>
      </div>

      <FeedControls
        segment={segment}
        onSegmentChange={changeSegment}
        pressedId={pressedSegmentId}
      />

      <KeywordBadges
        badges={badges}
        selected={tag}
        onSelect={changeTag}
        elsewhere={elsewhere}
        fallbackFocusId={pressedSegmentId}
      />

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
            hrefOf={hrefOf}
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
          {/* 다 불러와도 버튼을 없애지 않는다 — 사라지는 순간 포커스가 문서 맨 위로 떨어진다.
              문구에 **넘어올 날의 건수**를 적는다(design-rules 2026-09-01) — 눌러 보기 전에
              그날이 한산한지 알 수 있다. */}
          <button
            type="button"
            aria-disabled={nextDay === null}
            onClick={() => {
              if (nextDay === null) return;
              go(withMoreDays(state));
              // 누적으로 알린다. 증가분만 쓰면 두 번째부터 같은 문자열이 되고,
              // aria-live 는 값이 안 바뀌면 아무 말도 하지 않는다. 키워드를 켠 채 0건인 날을
              // 펼치면 누적 수가 그대로라 같은 문자열이 되므로 그날 이름을 넣는다.
              setNotice(
                `${dayHeading(nextDay.dayKey, todayKey)} 펼침 · ${total}건 중 ${shown + nextDay.count}건 표시`,
              );
            }}
          >
            {nextDay === null
              ? "모두 불러왔습니다"
              : `더 보기 · ${dayHeading(nextDay.dayKey, todayKey)} ${nextDay.count}건`}
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
