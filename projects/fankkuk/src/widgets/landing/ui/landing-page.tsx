import Link from "next/link";
import { Fragment } from "react";
import { FAN_STEP_LABEL } from "@/entities/order/ui/fan-stage-copy";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./landing.module.css";

// 랜딩(비로그인). 시안: docs/design/mockups/site/v18/landing.html — 가운데 틀(1152 선) 안에 히어로·바로가기 넷·4단계·옅은 빨강 둥근 상자(열람 기록 화면 모형)·요금.
// 광고 배너 자리는 다음 기능 작업이라 이번에 두지 않는다. 화면 전용 모양은 landing.module.css.
// 약속 문장은 shared/config/site-copy 의 고정 문구를 그대로 읽는다(문구 v2). 첫 화면 = 약속 1·3, 크리에이터 가입 구간 = 약속 2. 「모든 상자를 열어」라고 쓰지 않는다.
// 요금 숫자는 결제와 같은 DB 요금표(서버 page 가 읽어 넘긴다)를, 구간 기준은 size-tier 를 읽는다 — 화면과 결제가 어긋나지 않게.

// 바로가기 넷(design-rules 00절). 그림 아래 짧은 설명은 시안 v18 그대로
const TILES = [
  { href: "/gifts/new", label: "선물 보내기", caption: "팬꾹 주소로 먼저 보내요", icon: "icon-gift" },
  { href: "#promise", label: "승인", caption: "크리에이터가 직접 승인해요", icon: "icon-approve" },
  { href: "#promise", label: "검수", caption: "모든 선물을 검수해요", icon: "icon-inspect" },
  { href: "#promise", label: "열람 기록", caption: "주소가 열린 기록을 공개해요", icon: "icon-log" },
] as const;

const STEPS = [
  { icon: "icon-gift", num: "1. 등록", title: "선물을 등록해요", body: "결제하면 팬꾹 주소가 바로 나와요. 승인 전에도 먼저 보낼 수 있어요." },
  { icon: "icon-approve", num: "2. 승인", title: "크리에이터가 승인해요", body: PROMISE.approval },
  { icon: "icon-inspect", num: "3. 검수", title: "모든 선물을 검수해요", body: PROMISE.inspectionOpen },
  { icon: "icon-truck", num: "4. 배송", title: "팬꾹이 대신 보내요", body: "승인과 검수를 모두 통과한 선물만 출고합니다." },
] as const;

// 약속 카드 아이콘 — lucide 선 아이콘(lock·eye·package-search·message-circle) 경로 그대로
const ICON_PATHS = {
  lock: ["M7 11V7a5 5 0 0 1 10 0v4"],
  eye: ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"],
  inspect: ["M12 22V12", "M20.27 18.27 22 20", "M21 10.498V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.98-.559", "M3.29 7 12 12l8.71-5", "m7.5 4.27 8.997 5.148"],
  message: ["M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"],
  unlock: ["M7 11V7a5 5 0 0 1 9.9-1"],
  check: ["m16 9-5.5 5.5L8 12"],
} as const;
type IconName = keyof typeof ICON_PATHS;

function LineIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {(name === "lock" || name === "unlock") && <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />}
      {name === "eye" && <circle cx="12" cy="12" r="3" />}
      {name === "inspect" && <circle cx="18.5" cy="16.5" r="2.5" />}
      {name === "check" && <circle cx="12" cy="12" r="10" />}
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const PROMISES = [
  { icon: "lock", title: "주소는 잠긴 채 보관합니다", body: "승인된 선물의 송장을 출력할 때만 열려요." },
  { icon: "eye", title: "주소가 열린 기록은 모두 공개합니다", body: "언제, 어느 주문에서 열렸는지 크리에이터가 직접 볼 수 있어요." },
  { icon: "inspect", title: "모든 선물을 검수합니다", body: PROMISE.inspectionOpen },
  { icon: "message", title: "승인은 한 건씩, 카카오톡으로", body: "한꺼번에 승인하는 버튼은 없어요. 받지 않은 이유는 팬에게 알리지 않아요." },
] as const satisfies readonly { icon: IconName; title: string; body: string }[];

// 열람 기록 화면 모형(누를 수 없는 예시 화면, 시안 v18 .mock--log) — 줄 값은 예시다
const LOG_EXAMPLE = [
  { at: "10월 14일 14:02", order: "주문 FK-2410" },
  { at: "10월 12일 09:41", order: "주문 FK-2398" },
  { at: "10월 9일 18:20", order: "주문 FK-2377" },
] as const;

function SearchGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}


export function LandingPage({ prices }: { prices: PublicPriceTable }) {
  const stepLabels = Object.values(FAN_STEP_LABEL);
  return (
    <main id="main" className={`page-centered ${s.root}`}>
      {/* 첫 화면 — 가운데, 글자 칸 바깥 좌우에 3D 장식 둘(767 이하 숨김) */}
      <section className={`hero ${s.hero}`} aria-labelledby="hero-title">
        <img className={`${s.deco} ${s.decoL}`} src="/img/icon-gift.png" width={160} height={160} alt="" aria-hidden="true" />
        <img className={`${s.deco} ${s.decoR}`} src="/img/icon-truck.png" width={160} height={160} alt="" aria-hidden="true" />
        <div className={s.heroText}>
          <p className="t-lead">크리에이터에게 선물을 보낼 때</p>
          <h1 className="t-hero" id="hero-title">
            승인한 선물만 배송합니다
          </h1>
          <p className="hero-line">{PROMISE.inspection}</p>

          <form className="search" role="search" action="/creators">
            <label className="sr-only" htmlFor="hero-q">
              크리에이터 검색
            </label>
            <input id="hero-q" type="search" name="q" placeholder="나의 크리에이터를 찾아보세요" autoComplete="off" />
            <button className="search-go" type="submit" aria-label="크리에이터 찾기">
              <SearchGlyph />
            </button>
          </form>
        </div>

        <div className="hero-actions">
          <Link className="btn" href="/gifts/new">
            지금 바로 선물 보내러 가기
          </Link>
          <Link className="btn btn--line" href="/creators">
            나의 크리에이터 찾으러 가기
          </Link>
        </div>

        <ul className={s.tiles} aria-label="바로 알아보기">
          {TILES.map((t) => (
            <li key={t.label}>
              <a className={`card ${s.tile}`} href={t.href}>
                <img src={`/img/${t.icon}.png`} width={64} height={64} alt="" aria-hidden="true" />
                <span className={s.tileLabel}>{t.label}</span>
                <span className={s.caption}>{t.caption}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* 구간 1: 작동 방식 — 단계 카드 넷 */}
      <section className={s.block} id="how" aria-labelledby="how-title">
        <div className={s.head}>
          <h2 id="how-title">
            선물은 <span className="accent">4단계</span>로 도착해요
          </h2>
          <p className="t-lead">팬은 팬꾹으로 보내고, 크리에이터는 승인만 하면 돼요.</p>
        </div>
        <ol className={s.grid4}>
          {STEPS.map((st) => (
            <li key={st.num} className={`card ${s.stepCard}`}>
              <img src={`/img/${st.icon}.png`} width={56} height={56} alt="" aria-hidden="true" />
              <p className={s.num}>{st.num}</p>
              <h3>{st.title}</h3>
              <p className={s.muted}>{st.body}</p>
            </li>
          ))}
        </ol>
        <p className={s.stepsLine}>
          <span>상태 화면에서는</span>
          {stepLabels.map((label, i) => (
            <Fragment key={label}>
              {i > 0 && <span aria-hidden="true">›</span>}
              <span className="chip">{label}</span>
            </Fragment>
          ))}
        </p>
      </section>

      {/* 구간 2: 약속 — 옅은 빨강 둥근 상자. 제목 → 한 줄 설명 → 열람 기록 화면 모형 → 2×2 카드 → 버튼 */}
      <section className={`${s.block} ${s.promise}`} id="promise" aria-labelledby="promise-title">
        <div className={s.head}>
          <h2 id="promise-title">
            이제 확인하고 <span className="accent">선물을 받으세요</span>
          </h2>
          <p className="t-lead">{PROMISE.address}</p>
        </div>
        <figure className={s.mock} aria-label="예시 화면: 주소 열람 기록. 언제 어느 주문에서 주소가 열렸는지 한 줄씩 남습니다.">
          <div aria-hidden="true">
            <div className={s.mockBar}>
              <span>주소 열람 기록</span>
              <span className={s.mockTag}>예시</span>
            </div>
            <div className={s.mockCard}>
              {LOG_EXAMPLE.map((row) => (
                <div key={row.order} className={s.mockRow}>
                  <LineIcon name="unlock" className={s.mockIc} />
                  <b>{row.at}</b>
                  <span>{row.order}</span>
                  <span className={s.muted}>송장 출력으로 열림</span>
                </div>
              ))}
            </div>
          </div>
        </figure>
        <div className={s.grid2}>
          {PROMISES.map((p) => (
            <div key={p.title} className={`card ${s.promiseCard}`}>
              <span className={s.iconWrap}>
                <LineIcon name={p.icon} />
              </span>
              <h3>{p.title}</h3>
              <p className={s.muted}>{p.body}</p>
            </div>
          ))}
        </div>
        <div className={s.foot}>
          <Link className="btn" href="/signup">
            크리에이터로 가입하기
          </Link>
        </div>
      </section>

      {/* 구간 3: 요금 */}
      <section className={s.block} id="price" aria-labelledby="price-title">
        <div className={s.head}>
          <h2 id="price-title">
            모든 요금에 <span className="accent">검수가</span> 포함됩니다
          </h2>
          <p className="t-lead">배송비를 포함한 금액이에요. 크기와 무게 중 큰 쪽으로 정해져요.</p>
        </div>
        <div className={s.grid3}>
          {PRICED_TIERS.map((tier) => (
            <article key={tier} className={`card ${s.priceCard}`}>
              <span className="tag">{PARCEL_TIER_GUIDE[tier].name}</span>
              <p className={s.amount}>
                {prices[tier].priceKrw.toLocaleString("ko-KR")}
                <span>원</span>
              </p>
              <p className={s.inc}>
                <LineIcon name="check" />
                검수 포함
              </p>
              <p className={s.caption}>{PARCEL_TIER_GUIDE[tier].rule}</p>
            </article>
          ))}
        </div>
        <ul className={s.notes}>
          <li>{OVERSIZE_RULE}는 받지 않아요.</li>
          <li>사무실에서 잰 크기가 더 크면, 차액은 따로 결제해요.</li>
        </ul>
      </section>
    </main>
  );
}
