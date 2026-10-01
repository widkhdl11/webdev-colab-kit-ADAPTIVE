import Link from "next/link";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { fanBadge, fanHeadline, fanProgress } from "@/entities/order/ui/fan-stage-copy";
import s from "./home.module.css";

// 메인(로그인 뒤, 팬). 시안: docs/design/mockups/site/v4/home.html
// 팬 화면이라 선물은 팬용 모양(toFanView)만 받는다 — 크리에이터행 송장번호·주소가 여기 닿지 않는다.

export type HomeFollow = { id: string; name: string; category: string; faceTone: string };
export type HomeNotice = { id: string; title: string; date: string };

type Props = {
  nickname: string;
  /** 진행 중인 선물 전부(최신순). 줄에는 앞의 MAX_ROWS 개만 보인다. */
  gifts: readonly FanGiftView[];
  following: readonly HomeFollow[];
  /** 크리에이터 이름 → 얼굴 자리표시 색. 선물 줄의 얼굴이 팔로우 줄·크리에이터 찾기와 같은 색이 되게. */
  faceToneByName: Readonly<Record<string, string>>;
  notices: readonly HomeNotice[];
};

const MAX_ROWS = 3;

const TILES = [
  { href: "/gifts/new", label: "선물 보내기", icon: "icon-gift" },
  { href: "/creators", label: "크리에이터 찾기", icon: "icon-find" },
  { href: "/gifts", label: "내 선물", icon: "icon-truck" },
  { href: "/about", label: "요금 안내", icon: "icon-fee" },
  { href: "/about", label: "안심 약속", icon: "icon-approve" },
  { href: "/support", label: "고객센터", icon: "icon-help" },
] as const;

/** "2026-09-28" → "09.28" */
const shortDate = (date: string) => date.slice(5).replace("-", ".");

export function HomePage({ nickname, gifts, following, faceToneByName, notices }: Props) {
  return (
    <main id="main">
      <section className={s.greet} aria-labelledby="hello-title">
        <div className="container">
          <h1 id="hello-title">
            {nickname}님, 오늘은 누구에게
            <br />
            선물을 보낼까요?
          </h1>
          <p className={`lead ${s["greet-lead"]}`}>
            {gifts.length > 0 ? `지금 진행 중인 선물이 ${gifts.length}개 있어요.` : "지금 진행 중인 선물이 없어요."}
          </p>
          <form className={`search ${s.search}`} role="search" action="/creators">
            <label className="sr-only" htmlFor="home-q">
              크리에이터 검색
            </label>
            <input id="home-q" type="search" name="q" placeholder="나의 크리에이터를 찾아보세요" autoComplete="off" />
            <button className="search-go" type="submit" aria-label="크리에이터 찾기">
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
                <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </button>
          </form>
          <ul className={`tiles tiles--6 ${s.tiles}`} aria-label="바로가기">
            {TILES.map((t) => (
              <li key={t.label}>
                <Link className="tile" href={t.href}>
                  <span>{t.label}</span>
                  <img className="ico asset" src={`/img/${t.icon}.png`} width={88} height={88} alt="" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={s.block} aria-labelledby="gifts-title">
        <div className="container">
          <div className={s["block-head"]}>
            <h2 id="gifts-title">진행 중인 선물</h2>
          </div>
          {gifts.length === 0 ? (
            <p className={s.empty}>지금 진행 중인 선물이 없어요.</p>
          ) : (
            <ul className={s["gift-rows"]}>
              {gifts.slice(0, MAX_ROWS).map((g) => {
                const badge = fanBadge(g);
                const { done, total } = fanProgress(g);
                return (
                  <li key={g.orderNo} className={s["gift-row"]}>
                    <CreatorFace tone={faceToneByName[g.creatorName] ?? "var(--face-1)"} />
                    <div>
                      <p className={s.who}>{g.creatorName}님께</p>
                      <p className={s.says}>{fanHeadline(g)}</p>
                    </div>
                    <div className={s.meter}>
                      <div
                        className="dots"
                        role="progressbar"
                        aria-label={`${g.creatorName}님께 보낸 선물 진행 단계`}
                        aria-valuemin={1}
                        aria-valuemax={total}
                        aria-valuenow={done}
                        aria-valuetext={`${total}단계 중 ${done}단계, ${badge.text}`}
                      >
                        {g.steps.map((st) => (
                          <span key={st.key} className={st.state === "done" ? "on" : undefined} />
                        ))}
                      </div>
                      <small>
                        {badge.text} · {done}/{total}
                      </small>
                    </div>
                    <Link
                      className={`link-arrow ${s.go}`}
                      href={`/gifts/${g.orderNo}`}
                      aria-label={`${g.creatorName}님께 보낸 선물 상세`}
                    >
                      상세 보기 ›
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className={s["more-wrap"]}>
            <Link className="btn btn--soft" href="/gifts">
              더 보기
            </Link>
          </div>
        </div>
      </section>

      <section className={s.block} aria-labelledby="follow-title">
        <div className="container">
          <div className={s["block-head"]}>
            <h2 id="follow-title">팔로우한 크리에이터</h2>
            <Link className="link-arrow" href="/me/following">
              전체 보기
            </Link>
          </div>
          <ul className={s["follow-row"]}>
            {following.map((f) => (
              <li key={f.id}>
                <Link className={s.follow} href="/gifts/new" aria-label={`${f.name}님께 선물 보내기`}>
                  <CreatorFace tone={f.faceTone} className="face face--lg" />
                  <span>
                    {f.name}
                    <small>{f.category}</small>
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link className={s.follow} href="/creators" aria-label="크리에이터 더 찾기">
                <span className={`face face--lg ${s["add-face"]}`}>
                  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
                    <path d="M14 5v18M5 14h18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </span>
                <span>
                  더 찾기<small>&nbsp;</small>
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </section>

      <section className={s.block} aria-labelledby="notice-title">
        <div className="container">
          <div className={s["block-head"]}>
            <h2 id="notice-title">공지사항</h2>
            <Link className="link-arrow" href="/notices">
              전체 보기
            </Link>
          </div>
          <ul className={s["notice-list"]}>
            {notices.map((n) => (
              <li key={n.id}>
                <Link href="/notices">
                  <span className={s.t}>{n.title}</span>
                  <span className={s.d}>{shortDate(n.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className={s["page-end"]} />
    </main>
  );
}
