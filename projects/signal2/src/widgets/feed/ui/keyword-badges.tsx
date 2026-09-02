"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { KeywordBadge } from "@/entities/article";
import { parseBadgeKey } from "@/entities/article";

import styles from "./keyword-badges.module.css";

type Props = {
  badges: KeywordBadge[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
};

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

export function KeywordBadges({ badges, selectedKey, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  // 켠 뱃지를 줄 맨 앞으로 끌어올린다. 수십 개 중 하나를 켜면 접힌 줄 아래에 숨을 수 있다.
  // **집계 순서는 안 건드리고 그리기 직전에만** 자리를 옮긴다 —
  // "자리를 전체 건수로 고정한다"는 규칙은 읽음 숫자로 자리를 정하지 말라는 것이라 안 부딪힌다.
  const ordered = useMemo(() => {
    if (selectedKey === null) return badges;

    const picked = badges.filter((b) => b.key === selectedKey);
    if (picked.length > 0) {
      return [...picked, ...badges.filter((b) => b.key !== selectedKey)];
    }

    // **켠 키워드가 줄에 없을 수 있다.** 필터가 주소로도 들어오기 때문이다 —
    // 창(3일) 밖에만 있거나 문턱(2건) 미만인 키워드로 링크를 받으면 집계에 안 잡힌다.
    // 그때 그냥 넘어가면 켜진 칩이 하나도 없어서 **무엇으로 걸렀는지도, 어떻게 끄는지도**
    // 화면에 없다. 집계에 없으니 숫자는 0 이다.
    //
    // 축과 이름을 가르는 규칙은 entities 의 `parseBadgeKey` 하나다 — 여기서 다시 쓰면
    // 축이 늘었을 때 이 줄만 안 따라온다.
    const parsed = parseBadgeKey(selectedKey);
    if (parsed === null) return badges;

    const missing: KeywordBadge = {
      key: selectedKey,
      name: parsed.name,
      axis: parsed.axis,
      total: 0,
      unread: 0,
    };
    return [missing, ...badges];
  }, [badges, selectedKey]);

  const orderKey = ordered.map((b) => `${b.key}#${b.unread}`).join("|");

  /**
   * 넘침을 **한 자리에서 한 번만** 잰다.
   *
   * 몇 개가 가려지는지는 화면 폭이 정하므로 렌더 시점에는 알 수 없다 — 레이아웃 뒤에 재야 한다.
   * `overflow: hidden` 은 그리기만 자르고 포커스는 못 자른다: 재기 전에는 가려진 뱃지가
   * 전부 탭에 잡혔고, 390px 에서 20번째 뱃지에 포커스를 주면 줄이 144px 스크롤됐다.
   * 같은 측정값이 「더 보기」의 상태도 정한다 — 두 곳에서 따로 재면
   * "가렸다고 표시하는데 탭은 통과" 같은 어긋남이 생긴다.
   *
   * **펼친 상태에서도 잰다.** 처음에는 "펼쳤으니 가려진 것은 없다"로 건너뛰었는데,
   * 그러면 CSS 가 실제로 안 펴져도 inert 가 풀려서 화면은 가리는데 탭은 통과하는 상태가 된다.
   * 실제로 그렇게 났다(2026-09-01, 미디어쿼리 명시도). 재는 것 하나만 판정하게 둔다.
   */
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    // 펼쳐져 있으면 clientHeight 가 내용 전체 높이라 아무것도 안 넘친다 — 저절로 빈 집합이 된다.
    const limit = list.clientHeight;
    const next = new Set<string>();
    for (const node of list.children) {
      const el = node as HTMLElement;
      const key = el.dataset.badgeKey;
      if (key === undefined) continue;
      // 1px 은 소수점 반올림 여유다. 딱 맞는 뱃지를 가려진 것으로 세면 안 된다.
      if (el.offsetTop + el.offsetHeight > limit + 1) next.add(key);
    }
    setHiddenKeys((prev) => (sameKeys(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    return () => observer.disconnect();
    // orderKey 는 자리·글자 폭이 바뀌면 다시 재라는 신호다. 크기가 그대로면
    // ResizeObserver 는 안 울리므로 순서만 바뀐 경우를 이걸로 잡는다.
    // expanded 는 접힘이 풀리는 순간 다시 재려고 둔다.
  }, [measure, orderKey, expanded]);

  // **`badges` 가 아니라 `ordered` 를 본다.** 예전에는 `badges.length === 0` 이면 줄 전체를
  // 없앴는데, 그러면 문턱을 넘는 키워드가 하루도 없는 날에 필터를 켠 채로 들어오면
  // 「전체」 칩까지 같이 사라져서 필터를 끌 컨트롤이 화면에 존재하지 않는다.
  if (ordered.length === 0) return null;

  const overflowing = hiddenKeys.size > 0;
  const toggleDisabled = !expanded && !overflowing;

  return (
    <div className={styles.wrap}>
      <div
        ref={listRef}
        className={expanded ? `${styles.list} ${styles.expanded}` : styles.list}
        role="group"
        aria-label="키워드 필터"
      >
        {/* 전체 칩에는 숫자를 안 붙인다 — 붙이면 "오늘 안 읽은 소식 37건"이 되어
            개수 표시 금지 규칙이 막으려던 그 숫자가 된다. */}
        <button
          type="button"
          data-badge-key="__all__"
          className={
            selectedKey === null
              ? `${styles.badge} ${styles.all} ${styles.on}`
              : `${styles.badge} ${styles.all}`
          }
          aria-pressed={selectedKey === null}
          onClick={() => onSelect(null)}
        >
          전체
        </button>

        {ordered.map((badge) => {
          const hidden = hiddenKeys.has(badge.key);
          const on = badge.key === selectedKey;
          // 집계에 아예 없어서 세운 칩(total 0)과 다 읽어서 0 이 된 칩은 다른 것이다.
          // 취소선은 「다 읽었다」의 표식이라 앞쪽에 쓰면 두 상태가 한 모양이 된다.
          const absent = badge.total === 0;
          const classes = [
            styles.badge,
            badge.axis === "field" ? styles.field : styles.kind,
            badge.unread === 0 && !absent ? styles.zero : "",
            absent ? styles.absent : "",
            on ? styles.on : "",
            hidden ? styles.hidden : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={badge.key}
              type="button"
              data-badge-key={badge.key}
              className={classes}
              aria-pressed={on}
              // 접힘 밖으로 밀려난 뱃지는 키보드로도 닿지 않는다. 펼치면 풀린다.
              inert={hidden || undefined}
              tabIndex={hidden ? -1 : undefined}
              onClick={() => onSelect(on ? null : badge.key)}
            >
              {/* 축은 색으로만 전해지므로 스크린리더용 접두사를 둔다. */}
              <span className="sr-only">
                {badge.axis === "field" ? "분야 " : "사건종류 "}
              </span>
              {badge.name}
              <b>{badge.unread}</b>
              <span className="sr-only">
                {absent
                  ? "건 — 최근 3일 집계에는 없습니다"
                  : badge.unread === 0
                    ? "건 — 다 읽었습니다"
                    : "건 안 읽음"}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.toggle}
          aria-disabled={toggleDisabled}
          aria-expanded={expanded}
          onClick={() => {
            if (!toggleDisabled) setExpanded((v) => !v);
          }}
        >
          {expanded ? "접기" : overflowing ? "더 보기" : "모두 보임"}
        </button>

        {/* 이 줄은 최근 3일을 세는데 피드는 오늘치부터 보여준다. 그 어긋남을 화면에
            밝힐지는 아직 안 정했다(design-rules 2026-09-01 「아직 안 정한 것」) —
            승인된 시안에 표기가 없으므로 여기도 안 넣는다. */}
      </div>
    </div>
  );
}
