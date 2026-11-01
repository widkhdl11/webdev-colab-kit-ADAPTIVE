import Link from "next/link";
import type { ReactNode } from "react";
import type { CardLook } from "@/entities/creator/model/card-look";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { FAN_STEP_LABEL } from "@/entities/order/ui/fan-stage-copy";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import { PROMISE } from "@/shared/config/site-copy";
import { CreatorCardsSlot, guestTiles, NoticesSlot, PriceSlot, STEPS, type FrontNotice } from "./front-slots";
import f from "./front.module.css";
import s from "./landing.module.css";

// 로그인 전 첫 화면 — 시안 4(docs/design/mockups/home-landing-d-20261101/, 2026-11-01 사용자 「메인도 시안 4로 가자」, design-rules 34절).
// 순서는 배포본 그대로: ① 첫 화면 → 바로가기 넷 → ② 소개 배너 → ③ 소개(띠) → ④ 신규 크리에이터 → ⑥ 요금 → ⑦ 공지 → 끝 검색 띠.
// 로그인 후 세 역할 홈(RoleHome)과 칸 모양이 달라져 따로 짠다. 신규 크리에이터·요금·공지 칸은 같은 부품을 쓴다(카드 모양·넘김·요금표가 한 곳에서 오게).
// 채움 버튼은 검색 하나 — 첫 화면의 「선물 보내기」「크리에이터 찾기」 버튼은 바로가기·검색과 같은 일이라 뺐다.

type Props = {
  prices: PublicPriceTable;
  /** 새로 들어온 크리에이터 — 최근에 들어온 순서로 최대 열둘을 넘겨 본다 */
  newest: readonly CreatorCard[];
  looks: Readonly<Record<string, CardLook>>;
  notices: readonly FrontNotice[];
  /** 칸 ② 소개 배너 — 라우트가 사용자 선택 이미지를 넣는다. */
  banner?: ReactNode;
};

function SearchGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** 크리에이터 검색 — 첫 화면과 끝 띠에 같은 모양으로 둔다(id 만 다르다) */
function LandingSearch({ id }: { id: string }) {
  return (
    <form className={s.search} role="search" action="/creators">
      <label className="sr-only" htmlFor={id}>
        크리에이터 검색
      </label>
      <input id={id} type="search" name="q" placeholder="크리에이터 이름 또는 채널 이름" autoComplete="off" />
      <button className={s.searchGo} type="submit" aria-label="검색">
        <SearchGlyph />
        <span className={s.searchLabel}>검색</span>
      </button>
    </form>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m5 12 5 5L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ③ 소개 — 화면 끝까지 칠한 띠. 무엇이 좋은가(제목) → 어떻게 작동하는가(그림 칸 공통 높이의 가로 흐름, 767 이하 세로) */
function IntroBand() {
  const stepLabels = Object.values(FAN_STEP_LABEL);
  return (
    <section className={s.band} id="how" aria-labelledby="how-title">
      <div className={f.col}>
        <h2 id="how-title" className={s.bandTitle}>
          주소 공개 없이 <span className={s.accent}>전하는 선물</span>
        </h2>
        <p className={s.lede}>{PROMISE.approval}</p>
        <ol className={s.flow}>
          {STEPS.map((st, i) => (
            <li key={st.num}>
              <div className={s.art} aria-hidden="true">
                <img src={`/images/home/${st.icon}.webp`} width={64} height={64} alt="" loading="lazy" />
                {i === 0 ? <span className={s.addrChip}>팬꾹 주소</span> : null}
                {i === 1 ? (
                  <span className={s.okBadge}>
                    <CheckGlyph />
                  </span>
                ) : null}
              </div>
              <div className={s.cap}>
                {/* 장식 번호 — 순서는 ol 이 전한다 */}
                <span className={s.no} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{st.title}</h3>
                <p>{st.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className={s.stages}>
          <p id="stages-label">선물 진행 단계</p>
          <ol aria-labelledby="stages-label">
            {stepLabels.map((label) => (
              <li key={label}>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function LandingPage({ prices, newest, looks, notices, banner = null }: Props) {
  return (
    <main id="main" className={`${f.landing} ${s.page}`}>
      {/* ① 첫 화면 — 문구 묶음과 그림의 세로 중심을 맞춘다 */}
      <section className={`${f.heroBand} ${s.hero}`} aria-labelledby="hero-title">
        <div className={`${f.col} ${s.heroIn}`}>
          <div className={s.heroCopy}>
            <p className={s.eyebrow}>크리에이터에게 선물을 보낼 때</p>
            <h1 className="t-hero" id="hero-title">
              선물을 보낼
              <br /> 크리에이터 찾기
            </h1>
            <LandingSearch id="hero-q" />
          </div>
          <img className={s.heroArt} src="/images/home/creator-cat.webp" width={240} height={240} alt="" aria-hidden="true" fetchPriority="high" />
        </div>
      </section>

      <div className={f.col}>
        {/* 바로가기 넷 — 첫 화면 아래에 걸친 한 단계 낮은 줄 */}
        <ul className={s.tiles} aria-label="바로가기">
          {guestTiles(prices).map((t) => (
            <li key={t.label}>
              <Link className={`card ${s.tile}`} href={t.href}>
                <span className={s.ico} aria-hidden="true">
                  <img src={`/images/home/${t.icon}.webp`} width={28} height={28} alt="" loading="lazy" />
                </span>
                <span className={s.tileLabel}>{t.label}</span>
                <span className={s.tileNote}>{t.note}</span>
              </Link>
            </li>
          ))}
        </ul>
        {banner ? <div className={s.banner}>{banner}</div> : null}
      </div>

      <IntroBand />

      <div className={f.col}>
        {newest.length > 0 ? <CreatorCardsSlot id="newest" title="신규 크리에이터" more={{ href: "/creators", label: "크리에이터 찾기" }} creators={newest} looks={looks} scroll /> : null}
        <PriceSlot prices={prices} joined />
        <NoticesSlot notices={notices} />
      </div>

      {/* 끝 검색 띠 — 긴 페이지 끝에서 메인 행동을 한 번 더 */}
      <section className={s.end} aria-labelledby="end-title">
        <div className={f.col}>
          <h2 id="end-title">크리에이터 검색</h2>
          <LandingSearch id="end-q" />
        </div>
      </section>
    </main>
  );
}
