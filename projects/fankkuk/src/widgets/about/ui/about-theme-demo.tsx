"use client";

import { useState } from "react";
import { PASTEL_TONES } from "@/shared/config/pastel-tones";
import s from "./about.module.css";

// 소개 06 「테마 색으로 꾸미는 페이지」의 견본 — 시안 about-20261101 · 안 A(design-rules 36절).
// 누르면 체크·테두리·이름 글자가 함께 바뀌고(색만으로 구분하지 않는다) 아래 미리보기의 띠·팬덤 뱃지 색이 바뀐다.
// 색은 실제 테마 색 목록(파스텔 8색)에서 시안이 고른 넷이다. 저장하지 않는 그림이다.

const SWATCHES = [
  { name: "하늘색", tone: PASTEL_TONES[5] },
  { name: "분홍색", tone: PASTEL_TONES[7] },
  { name: "연두색", tone: PASTEL_TONES[3] },
  { name: "보라색", tone: PASTEL_TONES[6] },
] as const;

export function AboutThemeDemo() {
  const [picked, setPicked] = useState(0);
  const theme = SWATCHES[picked] ?? SWATCHES[0];
  return (
    <>
      <div>
        <p className={s.swatchLabel} id="swatch-label">
          테마 색 <output>{theme.name}</output>
        </p>
        <div className={s.swatches} role="group" aria-labelledby="swatch-label">
          {SWATCHES.map((sw, i) => (
            <button
              key={sw.tone}
              className={s.swatch}
              type="button"
              aria-pressed={i === picked}
              aria-label={sw.name}
              style={{ ["--c" as string]: sw.tone }}
              onClick={() => setPicked(i)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m5 12 5 5L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className={s.profile} role="img" aria-label="페이지 꾸미기 예시: 꾹냥, 팬덤 꾹냥단" style={{ ["--theme" as string]: theme.tone }}>
        <div className={s.cover} aria-hidden="true">
          <img src="/images/mascot-cat.webp" width={320} height={285} alt="" loading="lazy" />
        </div>
        <div className={s.profileBody} aria-hidden="true">
          <img className={s.avatar} src="/images/mascot-cat.webp" width={56} height={56} alt="" loading="lazy" />
          <b>꾹냥</b>
          <span className={s.fandom}>
            <img src="/images/mascot-cat.webp" width={16} height={16} alt="" loading="lazy" />
            꾹냥단
          </span>
        </div>
      </div>
    </>
  );
}
