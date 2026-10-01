import type { ChargeBreakdown } from "@/entities/payment/model/charge";
import s from "./landing.module.css";

// 메인(소개) 화면. 시각 기준: docs/design/design-rules.md, 시안: docs/design/mockups/main.html
// 문구 한계(design-rules 5절): "열지 않는다"는 쓰고 "열 수 없다"·"절대 유출되지 않는다"는 쓰지 않는다.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--brand)" />
      <path d="M16 24C12 21 7 18 7 13a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5-5 8-9 11Z" fill="var(--on-brand)" />
    </svg>
  );
}

function ParcelScene() {
  return (
    <div className={s["parcel-scene"]} aria-hidden="true">
      <svg viewBox="0 0 344 208" focusable="false">
        <circle cx="164" cy="106" r="84" fill="var(--paper)" />
        <circle cx="40" cy="56" r="12" fill="var(--spark-soft)" />
        <circle cx="300" cy="164" r="20" fill="var(--spark-soft)" />
        <circle cx="60" cy="168" r="6" fill="var(--brand)" />
        <circle cx="276" cy="32" r="4" fill="var(--spark)" />
        <g transform="rotate(-8 160 112)">
          <rect x="98" y="88" width="136" height="92" rx="16" fill="var(--accent)" />
          <path d="M162 76c-20-2-54-6-54-26 0-24 42-10 54 26Z" fill="var(--brand)" />
          <path d="M162 76c18-4 44-12 42-30-4-22-36-2-42 30Z" fill="var(--brand)" />
          <rect x="90" y="76" width="152" height="32" rx="12" fill="var(--accent-soft)" />
          <rect x="150" y="76" width="24" height="104" rx="4" fill="var(--brand)" />
          <rect x="186" y="124" width="32" height="36" rx="8" fill="var(--paper)" />
          <path d="M202 150c-4-3-10-7-10-12 0-5 7-6 10-2 3-4 10-3 10 2 0 5-6 9-10 12Z" fill="var(--brand)" />
        </g>
        <path d="M52 102c-6-6-18 0-14 8 3 6 12 12 12 12s10-6 14-12c4-8-6-14-12-8Z" fill="var(--spark)" />
      </svg>
      <span className={s.seal}>
        <svg width="24" height="24" viewBox="0 0 24 24" focusable="false">
          <path d="m5 12 5 5 10-11" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        승인 먼저
      </span>
    </div>
  );
}

const STEPS = [
  ["등록", "팬이 선물 정보와 상자 수를 등록하고 결제하면 주문번호가 생성됩니다."],
  ["승인", "크리에이터가 건별로 승인하거나 거절합니다. 승인 뒤에야 팬에게 사무실 주소가 공개됩니다."],
  [
    "검수",
    "팬이 사무실로 보낸 선물을 받아 모든 상자의 원래 송장을 떼어 파쇄하고 겉면을 검사합니다. 검사에 걸린 상자는 열어서 확인합니다.",
  ],
  ["배송", "검수가 끝난 선물만 크리에이터에게 발송합니다. 팬은 상태 화면에서 진행 상황을 확인합니다."],
] as const;

export function LandingPage({ charge }: { charge: ChargeBreakdown }) {
  return (
    <div className={`${s.root} ${s.page}`}>
      <header className={s.top}>
        <a className={s.logo} href="/" aria-label="팬꾹 홈">
          <Logo />
          팬꾹
        </a>
        <span className={s["top-note"]}>마음을 담아, 꾹.</span>
      </header>

      <main>
        <section className={s.hero} aria-labelledby="hero-title">
          <p className={s.hello}>팬의 마음에 안심을 더해요</p>
          <h1 id="hero-title">
            크리에이터가
            <br />
            승인한 선물만 배송
          </h1>
          <p className={s["hero-copy"]}>
            팬꾹 사무실에서 선물을 받아 검수하고,
            <br />
            크리에이터의 주소를 노출하지 않고
            <br />
            대신 보내 드려요.
          </p>
          <ParcelScene />
          <a className={s.button} href="/gifts/new">
            선물 보내기
          </a>
          <p className={s.assurance}>승인 전에는 아무것도 배송되지 않습니다.</p>
        </section>

        <section className={s.how} aria-labelledby="how-title">
          <h2 id="how-title">선물이 도착하기까지</h2>
          <p className={s.intro}>등록부터 배송까지, 네 단계로 확인하세요.</p>
          <ol className={s.steps} role="list">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className={s.number} aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.promises} aria-labelledby="promise-title">
          <h2 id="promise-title">안심에는 이유가 있어요</h2>
          <p className={s.intro}>팬꾹이 지키는 세 가지 약속입니다.</p>
          <ul className={s["promise-list"]} role="list">
            <li className={s["promise-card"]}>
              <span className={s["icon-tile"]} aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 32 32">
                  <path
                    fill="currentColor"
                    fillRule="evenodd"
                    d="M8 14v-4a8 8 0 0 1 16 0v4h1a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4h1Zm4 0h8v-4a4 4 0 0 0-8 0v4Z"
                  />
                  <circle cx="16" cy="22" r="3" fill="var(--paper)" />
                </svg>
              </span>
              <h3>승인 없이는 저희 시스템이 주소를 열지 않습니다</h3>
              <p>주소는 암호화되어 보관됩니다. 승인된 건만 송장을 출력하는 순간에 주소가 열립니다.</p>
            </li>
            <li className={s["promise-card"]}>
              <span className={s["icon-tile"]} aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 32 32">
                  <rect x="4" y="6" width="24" height="24" rx="6" fill="currentColor" />
                  <rect x="10" y="2" width="12" height="8" rx="4" fill="var(--accent)" />
                  <path d="m10 19 4 4 8-9" fill="none" stroke="var(--paper)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3>모든 선물을 검수합니다</h3>
              <p>
                모든 상자의 원래 송장을 떼어 파쇄하고 겉면을 검사합니다. 검사에 걸린 상자는 열어서 확인합니다. 검수를
                건너뛰는 요금제는 없습니다.
              </p>
            </li>
            <li className={s["promise-card"]}>
              <span className={s["icon-tile"]} aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 32 32">
                  <rect x="6" y="2" width="22" height="28" rx="6" fill="currentColor" />
                  <rect x="12" y="10" width="10" height="4" rx="2" fill="var(--paper)" />
                  <rect x="12" y="18" width="8" height="4" rx="2" fill="var(--paper)" />
                  <circle cx="6" cy="10" r="3" fill="var(--accent)" />
                  <circle cx="6" cy="22" r="3" fill="var(--accent)" />
                </svg>
              </span>
              <h3>주소를 연 기록을 크리에이터에게 전부 공개합니다</h3>
              <p>언제, 어느 주문의 주소를, 누가 열었는지 크리에이터가 전부 확인할 수 있습니다.</p>
            </li>
          </ul>
        </section>

        <section aria-labelledby="price-title">
          <h2 id="price-title">검수는 기본으로 담았어요</h2>
          <p className={s.intro}>검수·전달 서비스료에 배송비 실비를 더합니다.</p>
          <div className={s["price-card"]}>
            <div className={s["price-main"]}>
              <span className={s.pill}>검수 포함</span>
              <p className={s.amount}>
                {charge.totalKrw.toLocaleString("ko-KR")}
                <span>원</span>
              </p>
            </div>
            <div className={s["price-detail"]}>
              <dl>
                <div>
                  <dt>검수·전달 서비스료</dt>
                  <dd>{won(charge.serviceFeeKrw)}</dd>
                </div>
                <div>
                  <dt>배송비 실비</dt>
                  <dd>지금 {won(charge.shippingFeeKrw)}</dd>
                </div>
              </dl>
              <p className={s["price-note"]}>
                현재 배송비 기준으로 총 {won(charge.totalKrw)}입니다. 배송비는 실제 택배 요금에 따라 달라집니다.
              </p>
            </div>
          </div>
          <p className={s.included}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="10" fill="currentColor" />
              <path d="m5 10 3 3 7-7" fill="none" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            검수가 빠진 요금은 없습니다.
          </p>
        </section>

        <section className={s.creator} aria-labelledby="creator-title">
          <div className={s["creator-heading"]}>
            <span className={s.avatar} aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 32 32">
                <circle cx="16" cy="10" r="7" fill="currentColor" />
                <path d="M3 29a13 13 0 0 1 26 0Z" fill="currentColor" />
              </svg>
            </span>
            크리에이터를 위한 안내
          </div>
          <h2 id="creator-title">승인하지 않은 선물의 주소는 열리지 않습니다</h2>
          <ul className={s["creator-list"]} role="list">
            <li>
              <div>
                선물은 한 건씩 승인합니다.
                <br />
                <span>전체 승인 버튼은 없습니다.</span>
              </div>
            </li>
            <li>
              <div>거절 이유는 팬에게 공개하지 않습니다.</div>
            </li>
            <li>
              <div>원치 않는 팬은 차단할 수 있습니다.</div>
            </li>
          </ul>
          {/* 크리에이터 가입 화면이 생기면 그 주소로 바꾼다 */}
          <a className={s.button} href="#creator-title">
            크리에이터로 가입하기
          </a>
          <p className={s.free}>크리에이터는 무료입니다</p>
        </section>
      </main>

      <footer className={s.footer}>
        <p className={s["footer-logo"]}>팬꾹</p>
        <p>
          상호 네오코드
          <br />
          사업자등록번호 000-00-00000
        </p>
        <p>
          고객센터
          <br />
          (번호·운영시간 입력 예정)
        </p>
        <nav aria-label="서비스 정책">
          <a href="#">이용약관</a>
          <a href="#">개인정보처리방침</a>
        </nav>
      </footer>
    </div>
  );
}
