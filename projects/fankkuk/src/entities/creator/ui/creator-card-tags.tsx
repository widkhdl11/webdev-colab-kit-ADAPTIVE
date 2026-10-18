"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CreatorTag, CreatorTagMore } from "./creator-tag";
import s from "./creator-card-head.module.css";

// 크리에이터 카드의 플랫폼 칩 한 줄 — 넘치는 칩은 「+N」 하나로 바꾼다(시안 v28-card-redesign, design-rules 17절).
// 칩 폭은 글자·로고마다 달라 서버에서 정할 수 없어, 그린 뒤 줄 폭을 재서 앞에서부터 들어가는 만큼만 보인다.
// 재는 일은 줄 안의 보이지 않는 사본(모든 칩 + 「+N」)으로 한다 — 보이는 칩 수를 바꿔도 잰 값이 흔들리지 않는다.
// 칩 사이 간격은 줄의 CSS(column-gap)에서 읽는다 — CSS 와 값이 갈라지지 않게.
// 줄 폭·글꼴이 바뀌면(ResizeObserver) 다시 잰다. 가려진 칩 이름은 화면 낭독기에는 그대로 읽히고, 「+N」은 읽지 않는다.
// 첫 칩 하나도 들어가지 않으면 「+N」만 남기지 않고 첫 칩을 말줄임으로 줄여 보인다(나머지가 있으면 그 뒤에 「+N」).
// 재기 전(서버 렌더·ResizeObserver 없는 환경)에는 모든 칩을 그린다 — 줄은 왼쪽부터 놓여(design-rules 17절) 넘치면 오른쪽만 잘린다.

export type ChipFit = {
  /** 보이는 칩 수 */
  count: number;
  /** 첫 칩을 줄 폭에 맞춰 말줄임으로 줄이는가(첫 칩 하나도 들어가지 않을 때) */
  squeeze: boolean;
};

/** 앞에서부터 줄에 들어가는 칩 수. 다 들어가면 전부, 아니면 「+N」 칩 자리를 남기고 들어가는 만큼. 하나도 안 들어가면 첫 칩을 줄여서 하나. */
export function fitChipCount(widths: readonly number[], moreWidth: number, rowWidth: number, gap: number): ChipFit {
  const all = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
  if (all <= rowWidth + 0.5) return { count: widths.length, squeeze: false };
  let used = moreWidth;
  let count = 0;
  for (const w of widths) {
    if (used + gap + w > rowWidth + 0.5) break;
    used += gap + w;
    count += 1;
  }
  return count === 0 ? { count: 1, squeeze: true } : { count, squeeze: false };
}

/** 줄의 칩 사이 간격(px) — CSS column-gap 을 읽는다. 읽을 수 없으면(normal 등) 0. */
function columnGapOf(el: Element): number {
  const gap = Number.parseFloat(getComputedStyle(el).columnGap);
  return Number.isFinite(gap) ? gap : 0;
}

export function CreatorCardTags({ tags }: { tags: readonly string[] }) {
  const rowRef = useRef<HTMLParagraphElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<ChipFit>({ count: tags.length, squeeze: false });
  const tagsKey = tags.join("\n");

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const measureNow = () => {
      const chips = Array.from(measure.children).map((el) => el.getBoundingClientRect().width);
      const more = chips.pop() ?? 0;
      if (row.clientWidth === 0) return;
      const next = fitChipCount(chips, more, row.clientWidth, columnGapOf(row));
      setFit((prev) => (prev.count === next.count && prev.squeeze === next.squeeze ? prev : next));
    };
    measureNow();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureNow);
    observer.observe(row);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [tagsKey]);

  const count = Math.min(fit.count, tags.length);
  const rest = tags.length - count;
  return (
    <p className={`ctags ${s.tags} ${fit.squeeze ? s.squeeze : ""}`} ref={rowRef}>
      {tags.map((t, i) =>
        i < count ? (
          <CreatorTag key={t} name={t} />
        ) : (
          <span key={t} className="sr-only">
            {t}
          </span>
        ),
      )}
      {rest > 0 ? (
        <span className={s.more} aria-hidden="true">
          <CreatorTagMore count={rest} />
        </span>
      ) : null}
      {tags.length > 0 ? (
        <span className={s.measure} ref={measureRef} aria-hidden="true">
          {tags.map((t) => (
            <CreatorTag key={t} name={t} />
          ))}
          <CreatorTagMore count={tags.length} />
        </span>
      ) : null}
    </p>
  );
}
