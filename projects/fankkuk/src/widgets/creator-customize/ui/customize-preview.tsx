"use client";

import { useState, type CSSProperties } from "react";
import { creatorColorVars, hasThemeVars, type ThemeColor } from "@/entities/creator/model/creator-color";
import type { PreviewPick } from "@/entities/creator/model/link-images";
import { CheckIcon } from "@/entities/creator/ui/check-icon";
import s from "./creator-customize.module.css";

// 내 링크 페이지 바로 미리보기(디자인 기준 10절, 시안 customize-b.html) — 편집 칸에서 고친 값을 저장 전에도 그대로 보인다.
// 그리는 것은 링크 페이지가 보이는 공개 칸뿐이다(공개 이름·링크 주소·한 줄 소개·채널 소유 확인·심볼·감사 문장, INV-E7).
// 본문 영역 폭이 1080 보다 좁으면 편집 칸 위에 붙어 따라오고 「접기」로 줄인다. 미리보기 안의 버튼은 모양만이라 읽지 않는다.

export type PreviewValues = {
  name: string;
  initial: string;
  linkText: string | null;
  intro: string;
  thanks: string;
  verified: boolean;
  photoUrl: string | null;
  backgroundUrl: string | null;
  symbolUrl: string | null;
  pick: PreviewPick;
  /** 테마 색(없으면 null) — 띠 면과 사진 테두리. 공개 페이지(creator-profile-page)와 같은 계산 */
  personalColor: ThemeColor | null;
};

function Avatar({ url, initial, className }: { url: string | null; initial: string; className: string }) {
  return <span className={className}>{url ? <img src={url} alt="" width={512} height={512} /> : initial}</span>;
}

export function CustomizePreview({ v }: { v: PreviewValues }) {
  const [open, setOpen] = useState(true);
  const colorVars = creatorColorVars({ personal: v.personalColor });
  return (
    <aside className={`${s.side} ${open ? "" : s.closed}`} aria-label="내 링크 페이지 미리보기">
      <div className={s.pvLabel}>
        <h2 className="t-card">미리보기</h2>
        <button className={`btn btn--line btn--sm ${s.toggle}`} type="button" aria-expanded={open} aria-controls="cz-body" onClick={() => setOpen((x) => !x)}>
          {open ? "접기" : "펴기"}
        </button>
      </div>
      <div className={s.pvBody} id="cz-body">
        <div
          className={`card ${s.pvCard} ${hasThemeVars(colorVars) ? s.ringed : ""}`}
          style={colorVars as CSSProperties}
          role="group"
          aria-label="링크 페이지"
          data-creator-colors=""
        >
          <div className={s.pvBg} aria-hidden="true">
            {v.backgroundUrl ? <img src={v.backgroundUrl} alt="" width={1280} height={427} /> : null}
          </div>
          <Avatar url={v.photoUrl} initial={v.initial} className={`${s.avatar} ${s.pvAvatar}`} />
          <h3 className={s.pvName}>{v.name || "이름을 입력해 주세요"}</h3>
          {v.linkText ? <p className="t-meta">{v.linkText}</p> : null}
          {v.intro ? <p className={s.pvIntro}>{v.intro}</p> : null}
          {v.verified ? (
            <span className={`tag tag--success ${s.pvTag}`}>
              <CheckIcon />
              채널 소유 확인
            </span>
          ) : null}
          {v.symbolUrl ? <img className={s.pvSym} src={v.symbolUrl} alt="팬덤 심볼" width={512} height={512} /> : null}
          <p className={s.pvThanks}>{v.thanks}</p>
          <span className={`btn ${s.pvBtn}`} aria-hidden="true">
            선물 보내기
          </span>
        </div>
        <div>
          <p className="t-meta">링크를 공유하면 이렇게 보여요</p>
          <div className={`card ${s.og}`}>
            <div className={s.ogImg} aria-hidden="true">
              {v.pick === "symbol" && v.symbolUrl ? (
                <img className={s.ogSym} src={v.symbolUrl} alt="" width={512} height={512} />
              ) : (
                <Avatar url={v.photoUrl} initial={v.initial} className={`${s.avatar} ${s.ogAvatar}`} />
              )}
            </div>
            <div className={s.ogMeta}>
              <p className={s.ogTitle}>{(v.name || "이름") + " · 팬꾹"}</p>
              {v.linkText ? <p className="t-meta">{v.linkText}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
