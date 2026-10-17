"use client";

import { useEffect, useRef, useState } from "react";
import s from "./policy-page.module.css";

// 약관 왼쪽 목차 — 지금 읽는 조에 하늘 면을 칠한다(시안 v26 .toc a[aria-current]).
// 화면 위쪽 1/3 안에 머리가 들어온 마지막 조를 「지금 읽는 조」로 본다. 스크립트가 없어도 목차 링크는 그대로 동작한다.
export type TocGroup = { title: string | null; items: readonly { id: string; label: string }[] };

export function PolicyToc({ groups }: { groups: readonly TocGroup[] }) {
  // 배열은 그릴 때마다 새로 생기므로 이어 붙인 글자로 효과를 다시 걸지 정한다
  const idKey = groups.flatMap((g) => g.items.map((i) => i.id)).join(" ");
  const [current, setCurrent] = useState(idKey.split(" ")[0]);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const els = idKey
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    // 스크롤 이벤트는 한 화면 그리기에 여러 번 온다 — 그리기 한 번에 한 번만 잰다. 목차가 숨은 폭(접는 칸)에서는 재지 않는다
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (navRef.current?.offsetParent === null) return;
      const line = window.innerHeight / 3;
      let found = els[0]?.id;
      for (const el of els) if (el.getBoundingClientRect().top <= line) found = el.id;
      setCurrent(found);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [idKey]);

  // 목차가 화면보다 길면 목차 칸 안에서 스크롤된다 — 표시된 줄이 칸 밖으로 나가면 칸만 움직여 보이게 한다(페이지는 움직이지 않는다)
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>("[aria-current]");
    if (!nav || !link) return;
    const top = link.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    const bottom = top + link.offsetHeight;
    if (top < nav.scrollTop) nav.scrollTop = top - 8;
    else if (bottom > nav.scrollTop + nav.clientHeight) nav.scrollTop = bottom - nav.clientHeight + 8;
  }, [current]);

  return (
    <nav ref={navRef} className={s.side} aria-labelledby="toc-side-h">
      <h2 className={s.tocH} id="toc-side-h">
        목차
      </h2>
      {groups.map((g, gi) => (
        <div key={g.title ?? gi} className={s.tocGroup}>
          {g.title ? <p className={s.tocGroupT}>{g.title}</p> : null}
          {g.items.map((item) => (
            <a key={item.id} className={s.tocLink} href={`#${item.id}`} aria-current={current === item.id ? "true" : undefined}>
              {item.label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}
