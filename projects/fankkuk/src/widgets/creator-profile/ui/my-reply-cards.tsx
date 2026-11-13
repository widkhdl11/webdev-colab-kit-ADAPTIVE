"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { REPLY_PHRASE_TEXT, monthDayText } from "@/entities/gift-reply/model/reply";
import type { MyReplyCard } from "@/entities/gift-reply/model/my-reply-cards";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import s from "./creator-profile.module.css";

// 「나에게 온 감사 카드」(docs/specs/my-reply-cards.md · 시안 creator-detail-e-20261112 의 .rcard).
// 보는 팬 본인에게만 오는 목록이라 부르는 쪽(페이지)이 0장이면 그리지 않는다(INV-RC2).
// 가로로 넘기는 줄 — 자동으로 넘어가지 않는다(design-prompt 10-4·12-3). 이전·다음 버튼 44, 끝에서는 그쪽 버튼이 꺼진다. 손·키보드(줄에 초점 + 좌우 화살표)로도 넘긴다.
// 카드는 누르는 칸이 아니다 — 테두리·그림자 없이 옅은 하늘 면(design-prompt 4-6). 날짜만, 시각 없음(INV-RC4).

function Arrow({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function MyReplyCards({ cards, creatorName, photoUrl, faceTone }: { cards: readonly MyReplyCard[]; creatorName: string; photoUrl: string | null; faceTone: string }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const tr = trackRef.current;
    if (!tr) return;
    setEdge({ start: tr.scrollLeft < 2, end: tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 2 });
  }, []);

  // 상세 정보가 닫혀 있으면 줄 폭이 0 이라 처음 잰 값이 틀린다 — 줄의 크기가 바뀔 때(펼칠 때·화면 폭이 바뀔 때)마다 다시 잰다
  useEffect(() => {
    const tr = trackRef.current;
    measure();
    if (!tr || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(tr);
    return () => ro.disconnect();
  }, [measure]);

  const go = (dir: 1 | -1) => {
    const tr = trackRef.current;
    if (!tr) return;
    const card = tr.querySelector("li");
    const gap = parseFloat(getComputedStyle(tr).columnGap) || 0;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tr.scrollBy({ left: dir * ((card?.getBoundingClientRect().width ?? tr.clientWidth) + gap), behavior: calm ? "auto" : "smooth" });
  };

  return (
    <section className={s.replies} aria-labelledby="my-replies-h">
      <div className={s.secHead}>
        <h2 className={s.secTitle} id="my-replies-h">
          나에게 온 감사 카드
        </h2>
        <div className={s.secTools}>
          <button type="button" className={s.oarrow} aria-label="이전 감사 카드" aria-controls="my-replies-track" disabled={edge.start} onClick={() => go(-1)}>
            <Arrow d="m15 6-6 6 6 6" />
          </button>
          <button type="button" className={s.oarrow} aria-label="다음 감사 카드" aria-controls="my-replies-track" disabled={edge.end} onClick={() => go(1)}>
            <Arrow d="m9 6 6 6-6 6" />
          </button>
        </div>
      </div>
      <ul className={s.rtrack} id="my-replies-track" ref={trackRef} tabIndex={0} aria-label="나에게 온 감사 카드 목록" onScroll={measure}>
        {cards.map((c, i) => (
          // 이름표는 순번 — 상자 ID 를 넘기지 않는다(INV-RC4). 목록은 한 번 그려지고 순서가 바뀌지 않는다
          <li key={`${c.repliedOn}-${i}`} className={s.rcard}>
            <p className={s.rwho}>
              <CreatorPhoto photoUrl={photoUrl} tone={faceTone} className={`face ${s.rface}`} />
              <span>
                <b>{c.creatorName ?? creatorName}님이 남긴</b> 감사 답장
              </span>
            </p>
            <div className={s.rbody}>
              <p className={s.rphrase}>{REPLY_PHRASE_TEXT[c.phrase]}</p>
              {c.line ? <p className={s.rline}>{c.line}</p> : null}
            </div>
            <p className={s.rdate}>{monthDayText(c.repliedOn)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
