import Link from "next/link";
import { Fragment } from "react";
import { FAN_STEP_LABEL } from "@/entities/order/ui/fan-stage-copy";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./landing.module.css";

// 랜딩(비로그인). 시안: docs/design/mockups/site/v4/landing.html
// 약속 문장은 shared/config/site-copy 의 고정 문구를 그대로 읽는다(문구 v2). 첫 화면 = 약속 1·3, 크리에이터 가입 구간 = 약속 2. 「모든 상자를 열어」라고 쓰지 않는다.
// 요금 숫자는 결제와 같은 DB 요금표(서버 page 가 읽어 넘긴다)를, 구간 기준은 size-tier 를 읽는다 — 화면과 결제가 어긋나지 않게.

const TILES = [
  { href: "/gifts/new", label: "선물 보내기", icon: "icon-gift" },
  { href: "/creators", label: "크리에이터 찾기", icon: "icon-find" },
  { href: "#how", label: "배송 확인", icon: "icon-truck" },
  { href: "#price", label: "요금", icon: "icon-fee" },
  { href: "#promise", label: "승인", icon: "icon-approve" },
  { href: "#promise", label: "검수", icon: "icon-inspect" },
  { href: "#promise", label: "열람 기록", icon: "icon-log" },
  { href: "/support", label: "고객센터", icon: "icon-help" },
] as const;

const STEPS = [
  { icon: "icon-gift", num: "1. 등록", title: "선물을 등록해요", body: "결제하면 팬꾹 주소가 바로 나와요. 승인 전에도 먼저 보낼 수 있어요." },
  { icon: "icon-approve", num: "2. 승인", title: "크리에이터가 승인해요", body: PROMISE.approval },
  { icon: "icon-inspect", num: "3. 검수", title: "모든 선물을 검수해요", body: PROMISE.inspectionOpen },
  { icon: "icon-truck", num: "4. 배송", title: "팬꾹이 대신 보내요", body: "승인과 검수를 모두 통과한 선물만 출고합니다." },
] as const;

const PROMISES = [
  { title: "주소는 잠긴 채 보관합니다", body: "승인된 선물의 송장을 출력할 때만 열려요." },
  { title: "주소가 열린 기록은 모두 공개합니다", body: "언제, 어느 주문에서 열렸는지 크리에이터가 직접 볼 수 있어요." },
  { title: "모든 선물을 검수합니다", body: PROMISE.inspectionOpen },
  { title: "승인은 한 건씩, 카카오톡으로", body: "한꺼번에 승인하는 버튼은 없어요. 받지 않은 이유는 팬에게 알리지 않아요." },
] as const;

function SearchGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CheckDot() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      <path d="m5 10 3 3 7-7" fill="none" stroke="var(--on-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LandingPage({ prices }: { prices: PublicPriceTable }) {
  const stepLabels = Object.values(FAN_STEP_LABEL);
  return (
    <main id="main">
      {/* 첫 화면 — 가운데 */}
      <section className={s.hero} aria-labelledby="hero-title">
        <div className="container">
          <p className={`kicker ${s.kicker}`}>크리에이터에게 선물을 보낼 때</p>
          <h1 className="hero-title" id="hero-title">
            승인한 선물만 배송합니다
          </h1>
          <p className={`green-line ${s["green-line"]}`}>{PROMISE.inspection}</p>

          <form className={`search ${s.search}`} role="search" action="/creators">
            <label className="sr-only" htmlFor="hero-q">
              크리에이터 검색
            </label>
            <input id="hero-q" type="search" name="q" placeholder="나의 크리에이터를 찾아보세요" autoComplete="off" />
            <button className="search-go" type="submit" aria-label="크리에이터 찾기">
              <SearchGlyph />
            </button>
          </form>

          <ul className={`tiles ${s.tiles}`} aria-label="바로 알아보기">
            {TILES.map((t) => (
              <li key={t.label}>
                <a className="tile" href={t.href}>
                  <span>{t.label}</span>
                  <img className="ico asset" src={`/img/${t.icon}.png`} width={88} height={88} alt="" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>

          <div className={s["hero-actions"]}>
            <Link className="btn btn--wide" href="/gifts/new">
              지금 바로 선물 보내러 가기
            </Link>
            <Link className="btn btn--line btn--wide" href="/creators">
              나의 크리에이터 찾으러 가기
            </Link>
          </div>
        </div>
      </section>

      {/* 구간 1: 작동 방식 */}
      <section className="section" id="how" aria-labelledby="how-title">
        <div className="container">
          <div className={s["sec-head"]}>
            <h2 id="how-title">
              선물은 <span className="accent">4단계</span>로 도착해요
            </h2>
            <p>팬은 팬꾹으로 보내고, 크리에이터는 승인만 하면 돼요.</p>
          </div>
          <ol className="grid cols-4">
            {STEPS.map((st) => (
              <li key={st.num} className={s["step-col"]}>
                <img className={`asset ${s["step-ico"]}`} src={`/img/${st.icon}.png`} width={80} height={80} alt="" aria-hidden="true" />
                <p className={s.num}>{st.num}</p>
                <h3>{st.title}</h3>
                <p>{st.body}</p>
              </li>
            ))}
          </ol>
          <p className={s["steps-line"]}>
            <span className={s["steps-label"]}>상태 화면에서는</span>
            {stepLabels.map((label, i) => (
              <Fragment key={label}>
                {i > 0 && (
                  <span className={s.arrow} aria-hidden="true">
                    ›
                  </span>
                )}
                <span className="chip">{label}</span>
              </Fragment>
            ))}
          </p>
        </div>
      </section>

      {/* 구간 2: 약속 — 회색 큰 판 하나 */}
      <section id="promise" aria-labelledby="promise-title">
        <div className="container">
          <div className={`${s.panel} ${s["panel-grid"]}`}>
            <div>
              <h2 id="promise-title">
                이제 확인하고
                <br />
                <span className="accent">선물을 받으세요</span>
              </h2>
              <p className={`lead ${s["panel-lead"]}`}>{PROMISE.address}</p>
              <Link className={`btn ${s["panel-cta"]}`} href="/signup">
                크리에이터로 가입하기
              </Link>
            </div>
            <div>
              {PROMISES.map((p) => (
                <div key={p.title} className={s.promise}>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 구간 3: 요금 */}
      <section className="section" id="price" aria-labelledby="price-title">
        <div className="container">
          <div className={s["sec-head"]}>
            <h2 id="price-title">
              모든 요금에 <span className="accent">검수가</span> 포함됩니다
            </h2>
            <p>배송비를 포함한 금액이에요. 크기와 무게 중 큰 쪽으로 정해져요.</p>
          </div>
          <div className={`grid cols-3 ${s["price-grid"]}`}>
            {PRICED_TIERS.map((tier) => (
              <article key={tier} className={s.price}>
                <span className="tag">{PARCEL_TIER_GUIDE[tier].name}</span>
                <p className={s["price-amount"]}>
                  {prices[tier].priceKrw.toLocaleString("ko-KR")}
                  <span>원</span>
                </p>
                <p className={s.inc}>
                  <CheckDot />
                  검수 포함
                </p>
                <p className={s.spec}>{PARCEL_TIER_GUIDE[tier].rule}</p>
              </article>
            ))}
          </div>
          <ul className={s.notes}>
            <li>{OVERSIZE_RULE}는 받지 않아요.</li>
            <li>사무실에서 잰 크기가 더 크면, 차액은 따로 결제해요.</li>
          </ul>
        </div>
      </section>

      <div className="page-end" />
    </main>
  );
}
