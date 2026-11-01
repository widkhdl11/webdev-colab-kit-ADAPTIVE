import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { NO_CARD_LOOK, type CardLook } from "@/entities/creator/model/card-look";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { CreatorCardActions, CreatorCardFoot, CreatorCardHead, CreatorCardLine, creatorCardClass } from "@/entities/creator/ui/creator-card-head";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { FAN_STEP_LABEL, fanBadge } from "@/entities/order/ui/fan-stage-copy";
import { INTAKE_LIMIT_TEXT, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { lowestPriceKrw, PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { PROMISE } from "@/shared/config/site-copy";
import { formatDate } from "@/shared/lib/format/datetime";
import type { StatusTone } from "@/shared/ui/status-tone";
import { CardRowScroller } from "./card-row-scroller";
import s from "./front.module.css";
import h from "./home.module.css";
import l from "./landing.module.css";

// 홈 칸(design-rules 16절, 시안 docs/design/mockups/site/v27-home-airy/ · 로그인 전 모양은 v29-landing-fix/). 로그인 전 첫 화면과 로그인 후 팬 홈이 같은 칸 순서를 쓰고,
// 로그인 후에 바뀌는 칸만 「-2」 부품으로 바꾼다 — 두 화면이 같은 부품을 써야 순서와 모양이 어긋나지 않는다.
// ② 광고 배너는 스펙 승인 뒤에 만든다(DECISIONS 2026-10-18) — 그때까지 칸을 두지 않는다.
// 약속 문장은 shared/config/site-copy 의 고정 문구를 그대로 읽는다. 요금 숫자는 결제와 같은 DB 요금표(라우트가 읽어 넘긴다).

/** 로그인 전 소개 배너 — 사용자가 고른 버튼 없는 최종 이미지 한 장. */
export function GuestIntroBanner() {
  return (
    <img
      className={s.introBanner}
      src="/images/banners/launch-01-introduction-no-button.png"
      width={2172}
      height={724}
      alt="팬꾹. 팬의 마음을, 크리에이터에게. 승인된 선물을 검수 후 전달합니다."
    />
  );
}

/** ① 바로가기 한 칸. note = 그림 아래 작은 글 */
export type FrontTile = { href: string; label: string; note: string; icon: string };

/** ① 로그인 전 바로가기 넷(용어집 12절) */
export function guestTiles(prices: PublicPriceTable): FrontTile[] {
  return [
    { href: "/gifts/new", label: "선물 보내기", note: "상자별 팬꾹 주소 안내", icon: "icon-gift" },
    { href: "/creators", label: "크리에이터 찾기", note: "채널 소유자 확인 완료", icon: "icon-find" },
    { href: "#price", label: "요금 안내", note: `검수 포함 ${lowestPriceKrw(prices).toLocaleString("ko-KR")}원부터`, icon: "icon-fee" },
    { href: "/faq", label: "자주 묻는 질문", note: "이용 방법·요금·배송", icon: "icon-help" },
  ];
}

function SearchGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** 팬 홈 첫 화면 검색 — 로그인 전 메인 검색과 같은 모양(design-rules 34·35절). 채움 버튼은 화면에 이 「검색」 하나 */
function HeroSearch() {
  return (
    <form className={l.search} role="search" action="/creators">
      <label className="sr-only" htmlFor="hero-q">
        크리에이터 검색
      </label>
      <input id="hero-q" type="search" name="q" placeholder="크리에이터 이름 또는 채널 이름 검색" autoComplete="off" />
      <button className={l.searchGo} type="submit" aria-label="검색">
        <SearchGlyph />
        <span className={l.searchLabel}>검색</span>
      </button>
    </form>
  );
}

/** ① 로그인 후 첫 화면 — 메인(34절)과 같은 띠·글·그림 자리. 머리말 → 인사 48 → 검색(팬) 또는 내 프로필·버튼(크리에이터).
 *  팬 홈의 「선물 보내기」「크리에이터 찾기」 채움 버튼은 뺐다(35절) — 바로 아래 바로가기·검색과 같은 일이다 */
export function HeroBand({ title, eyebrow, control, actions = null }: { title: string; eyebrow: string; control?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`${s.heroBand} ${l.hero}`} aria-labelledby="hero-title">
      <div className={`${s.col} ${l.heroIn}`}>
        <div className={l.heroCopy}>
          <p className={l.eyebrow}>{eyebrow}</p>
          <h1 className="t-hero" id="hero-title">
            {title}
          </h1>
          {control ?? <HeroSearch />}
          {actions}
        </div>
        <img className={l.heroArt} src="/images/home/creator-cat.webp" width={240} height={240} alt="" aria-hidden="true" fetchPriority="high" />
      </div>
    </section>
  );
}

/** 승인된 역할 홈의 공통 순서(20절) — 첫 화면 → 바로가기 넷(첫 화면 아래 걸침, 35절) → 배너 → 역할별 본문. 구간 사이는 두 홈 모두 --section-gap */
export function RoleHome({ hero, tiles, tilesLabel, banner, children }: { hero: ReactNode; tiles: readonly FrontTile[]; tilesLabel: string; banner: ReactNode; children: ReactNode }) {
  return (
    <main id="main" className={`${s.landing} ${s.roleHome}`}>
      {hero}
      <div className={s.col}>
        <HomeTiles tiles={tiles} label={tilesLabel} />
        {banner ? <div className={l.banner}>{banner}</div> : null}
        {children}
      </div>
    </main>
  );
}

/** 바로가기 넷 — 메인과 같은 카드(하늘 원 44 안 그림 28 → 이름 → 설명, 왼쪽 정렬) */
function HomeTiles({ tiles, label }: { tiles: readonly FrontTile[]; label: string }) {
  return (
    <ul className={l.tiles} aria-label={label}>
      {tiles.map((t) => (
        <li key={t.label}>
          <Link className={`card ${l.tile}`} href={t.href}>
            <span className={l.ico} aria-hidden="true">
              <img src={`/images/home/${t.icon}.webp`} width={28} height={28} alt="" loading="lazy" />
            </span>
            <span className={l.tileLabel}>{t.label}</span>
            {t.note ? <span className={l.tileNote}>{t.note}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 진행 상태 뱃지 — 색만이 아니라 점 + 글자(35절). 색 갈래는 각 도메인이 정한 tone 그대로 */
export function StatusBadge({ tone, text }: { tone: StatusTone; text: string }) {
  return (
    <span className={`tag tag--dot ${h.stt}`} data-tone={tone}>
      {text}
    </span>
  );
}

const EMPTY_ICON = {
  check: "m5 12 5 5L20 7",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z",
  gift: "M4 11h16v10H4zM2 7h20v4H2zM12 7v14M12 7S10.5 3 8 3a2 2 0 0 0 0 4M12 7s1.5-4 4-4a2 2 0 0 1 0 4",
  heart: "M12 21 3.5 12.5a5.5 5.5 0 0 1 8.5-7 5.5 5.5 0 0 1 8.5 7Z",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
} as const;

/** 빈 상태·못 읽음 — 같은 문구를 흰 카드 안에(35절). 첫 줄이 상태, children 은 그 아래(안내 문장·버튼) */
export function EmptyCard({ icon, text, children }: { icon: keyof typeof EMPTY_ICON; text: string; children?: ReactNode }) {
  return (
    <div className={h.emptyCard}>
      <span className={h.emptyIco} aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          {icon === "eye" ? <circle cx="12" cy="12" r="3" /> : null}
          <path d={EMPTY_ICON[icon]} />
        </svg>
      </span>
      <div className={h.emptyText}>
        <p>{text}</p>
        {children}
      </div>
    </div>
  );
}

/** ③ 4단계 — 로그인 전 첫 화면(landing-page 의 가로 흐름)도 같은 문구를 읽는다 */
export const STEPS = [
  { icon: "icon-gift", num: "1. 등록", title: "선물 등록·결제", body: "결제 후 상자별 팬꾹 주소가 발급됩니다. 승인 전에는 ‘먼저 보내기’로 주소를 확인할 수 있습니다." },
  { icon: "icon-approve", num: "2. 승인", title: "크리에이터 승인", body: PROMISE.approval },
  { icon: "icon-inspect", num: "3. 검수", title: "팬꾹 검수", body: `팬이 보낸 모든 상자를 검사하고, ${PROMISE.inspectionOpen}` },
  { icon: "icon-truck", num: "4. 배송", title: "크리에이터에게 배송", body: "승인과 검수가 완료된 선물을 출고합니다." },
] as const;

/** ③ 사이트 소개(로그인 전만) — 흰 바탕, 왼쪽 머리 + 2×2 줄(그림 64 · 번호 · 제목 · 설명, 767 이하 한 줄에 하나) + 상태 흐름.
 *  머리말 「크리에이터에게 선물을 보낼 때」는 첫 화면으로 옮겼다(시안 v29-landing-fix) */
export function IntroSlot() {
  const stepLabels = Object.values(FAN_STEP_LABEL);
  return (
    <section className={s.intro} id="how" aria-labelledby="how-title">
      <div className={s.head}>
        <h2 id="how-title">
          주소 공개 없이 <span className="accent">전하는 선물</span>
        </h2>
        <p className="t-lead">{PROMISE.approval}</p>
      </div>
      <ol className={s.stepRows}>
        {STEPS.map((st) => (
          <li key={st.num} className={s.stepRow}>
            <img src={`/images/home/${st.icon}.webp`} width={64} height={64} alt="" aria-hidden="true" loading="lazy" />
            <div>
              <p className={s.stepNum}>{st.num}</p>
              <h3>{st.title}</h3>
              <p className={s.muted}>{st.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className={s.stepsLine}>
        <span>선물 진행 단계:</span>
        {stepLabels.map((label, i) => (
          <Fragment key={label}>
            {i > 0 && <span aria-hidden="true">›</span>}
            <span className="chip">{label}</span>
          </Fragment>
        ))}
      </p>
    </section>
  );
}

/** 구역 머리 — 제목 왼쪽 + 「모두 보기」 링크 오른쪽(767 이하는 목록 아래 오른쪽) */
export function SlotSection({ id, title, meta, more, children }: { id: string; title: string; meta?: string; more?: { href: string; label: string }; children: ReactNode }) {
  return (
    <section className={s.slot} aria-labelledby={`${id}-title`}>
      <div className={`head-row ${s.slotHead}`}>
        <h2 id={`${id}-title`}>
          {title}
          {meta ? <span className={s.slotMeta}>{meta}</span> : null}
        </h2>
        {more ? (
          <Link className={`more-link ${s.moreTop}`} href={more.href}>
            {more.label}
          </Link>
        ) : null}
      </div>
      {children}
      {/* 767 이하에서는 목록 아래 오른쪽 — 화면 순서와 Tab 순서가 같게 링크를 목록 뒤에 하나 더 두고 폭에 따라 하나만 보인다 */}
      {more ? (
        <Link className={`more-link ${s.moreBottom}`} href={more.href}>
          {more.label}
        </Link>
      ) : null}
    </section>
  );
}

const MAX_GIFTS = 3;

function Chev() {
  return (
    <svg className={h.chev} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** ③-2 진행 중인 선물 — 한 줄 목록. 팬 화면이라 팬용 모양(toFanView)만 받는다 */
export function GiftsSlot({ gifts, faceToneByName }: { gifts: readonly FanGiftView[]; faceToneByName: Readonly<Record<string, string>> }) {
  return (
    <SlotSection id="gifts" title="진행 중인 선물" meta={`${gifts.length}건`} more={{ href: "/gifts", label: "보낸 선물 모두 보기" }}>
      {gifts.length === 0 ? (
        <EmptyCard icon="gift" text="진행 중인 선물이 없습니다." />
      ) : (
        <ul className={h.rows} aria-label="진행 중인 선물">
          {gifts.slice(0, MAX_GIFTS).map((g) => {
            const badge = fanBadge(g);
            return (
              <li key={g.orderNo}>
                <Link className={h.row} href={`/gifts/${g.orderNo}`}>
                  <CreatorFace tone={faceToneByName[g.creatorName] ?? "var(--face-1)"} className={h.faceSm} />
                  <span className={h.w}>
                    <b>{g.creatorName}님께</b>
                    <span>
                      상자 {g.boxCount}개 · {formatDate(g.registeredAt)} 등록
                    </span>
                  </span>
                  <StatusBadge tone={badge.tone} text={badge.text} />
                  <Chev />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SlotSection>
  );
}

/** ④·④-2 카드 셋 — 크리에이터 찾기와 같은 카드(design-rules 17절). action = 아래 띠에 놓을 버튼(④ 는 없음 — 띠 없음, ④-2 는 카드 띠 팔로우 — 팔로우 중이면 「선물 보내기」+「팔로우 취소」) */
export const CARD_ROW_MAX = 3;
/** ④-2 넘기는 줄에 놓는 최대 수 — 넘치면 「모두 보기」(2026-10-19 사용자 「양 옆으로 화살표로」) */
export const SCROLL_ROW_MAX = 12;

/** scroll = 한 줄로 두고 양옆 화살표로 넘긴다(④-2). 아니면 카드 셋(④) */
export function CreatorCardsSlot({
  id,
  title,
  meta,
  more,
  creators,
  looks,
  action,
  empty,
  scroll = false,
}: {
  id: string;
  title: string;
  meta?: string;
  more?: { href: string; label: string };
  creators: readonly CreatorCard[];
  looks: Readonly<Record<string, CardLook>>;
  action?: (c: CreatorCard) => ReactNode;
  empty?: ReactNode;
  scroll?: boolean;
}) {
  const cards = creators.slice(0, scroll ? SCROLL_ROW_MAX : CARD_ROW_MAX).map((c) => (
    <li key={c.id} className={creatorCardClass}>
      <CreatorCardHead
        creatorId={c.id}
        name={c.name}
        href={creatorPagePath(c)}
        look={looks[c.id] ?? NO_CARD_LOOK}
        colors={c.colors}
        faceTone={c.faceTone}
      />
      <CreatorCardLine channelTitle={c.channelTitle} intro={c.intro} />
      <CreatorCardFoot tags={c.tags} />
      {/* 팔로우 버튼을 주는 화면(로그인한 홈)만 버튼 줄 — 한 줄의 카드가 모두 같은 화면이라 높이가 같다 */}
      {action ? (
        <CreatorCardActions creatorId={c.id} colors={c.colors}>
          {action(c)}
        </CreatorCardActions>
      ) : null}
    </li>
  ));
  return (
    <SlotSection id={id} title={title} meta={meta} more={creators.length > 0 ? more : undefined}>
      {creators.length === 0 ? (
        empty
      ) : scroll ? (
        <CardRowScroller id={`${id}-row`} label={title}>
          {cards}
        </CardRowScroller>
      ) : (
        <ul className={s.cardRow} aria-label={title}>
          {cards}
        </ul>
      )}
    </SlotSection>
  );
}

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
  { icon: "lock", title: "주소는 잠긴 채 보관해요", body: "승인된 선물의 송장을 출력할 때만 열려요." },
  { icon: "eye", title: "주소가 열린 기록은 모두 공개해요", body: "언제, 어느 주문에서 열렸는지 크리에이터가 직접 볼 수 있어요." },
  { icon: "inspect", title: "팬꾹 검수", body: `팬이 보낸 모든 상자를 검사하고, ${PROMISE.inspectionOpen}` },
  { icon: "message", title: "승인은 한 건씩, 카카오톡으로", body: "한꺼번에 승인하는 버튼은 없어요. 받지 않은 이유는 팬에게 알리지 않아요." },
] as const satisfies readonly { icon: IconName; title: string; body: string }[];

// 열람 기록 화면 모형(누를 수 없는 예시 화면, 시안 v18 .mock--log) — 줄 값은 예시다
const LOG_EXAMPLE = [
  { at: "10월 14일 14:02", order: "주문 FK-2410" },
  { at: "10월 12일 09:41", order: "주문 FK-2398" },
  { at: "10월 9일 18:20", order: "주문 FK-2377" },
] as const;

/** ⑤ 약속 — 옅은 하늘 둥근 판. withSignup = 「크리에이터로 가입하기」 버튼(⑤-2 는 뺀다).
 *  band = 로그인 전 — 둥근 판 대신 화면 끝까지 칠한 띠, 안은 880 기둥, 약속 카드는 아이콘 왼쪽 · 글 오른쪽 */
export function PromiseSlot({ withSignup, band = false }: { withSignup: boolean; band?: boolean }) {
  const body = (
    <>
      <div className={s.head}>
        <h2 id="promise-title">
          이제 확인하고 <span className="accent">선물을 받으세요</span>
        </h2>
        <p className="t-lead">{PROMISE.address}</p>
      </div>
      <figure className={s.mock} aria-label="예시 화면: 주소 열람 기록. 언제 어느 주문에서 주소가 열렸는지 한 줄씩 남아요.">
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
          <div key={p.title} className={`card ${band ? s.promiseRow : s.promiseCard}`}>
            {band ? (
              <img className={s.promiseArt} src={`/images/home/promise-${p.icon}.webp`} width={64} height={64} alt="" aria-hidden="true" loading="lazy" />
            ) : (
              <span className={s.iconWrap}>
                <LineIcon name={p.icon} />
              </span>
            )}
            {band ? (
              <div>
                <h3>{p.title}</h3>
                <p className={s.muted}>{p.body}</p>
              </div>
            ) : (
              <>
                <h3>{p.title}</h3>
                <p className={s.muted}>{p.body}</p>
              </>
            )}
          </div>
        ))}
      </div>
      {withSignup ? (
        <div className={s.foot}>
          <Link className="btn" href="/signup">
            크리에이터로 가입하기
          </Link>
        </div>
      ) : null}
    </>
  );
  return band ? (
    <section className={s.promiseBand} id="promise" aria-labelledby="promise-title">
      <div className={s.col}>{body}</div>
    </section>
  ) : (
    <section className={`${s.block} ${s.promise}`} id="promise" aria-labelledby="promise-title">
      {body}
    </section>
  );
}

// 제공받은 상자 그림에서 각 크기의 영역만 표시한다. 원본 이미지 파일은 그대로 유지한다.
const PARCEL_BOX_VIEW = {
  small: "20 440 510 365",
  medium: "560 300 535 515",
  large: "1120 135 645 690",
} as const;

/** ⑥ 요금 — 결제와 같은 DB 요금표, 구간 기준은 size-tier.
 *  joined = 로그인 전 — 카드 셋 대신 경계 카드 한 장을 세 칸으로(칸 사이 세로 1px 선, 767 이하 위아래로) */
export function PriceSlot({ prices, joined = false }: { prices: PublicPriceTable; joined?: boolean }) {
  return (
    <section className={s.block} id="price" aria-labelledby="price-title">
      <div className={s.head}>
        <h2 id="price-title">
          배송 요금 안내
        </h2>
        <p className="t-lead">상자 크기·무게 중 더 높은 요금 구간을 선택해 주세요.</p>
      </div>
      <div className={joined ? s.priceJoined : s.grid3}>
        {PRICED_TIERS.map((tier) => (
          <article key={tier} className={joined ? s.priceTier : `card ${s.priceCard}`}>
            <span className="tag">{PARCEL_TIER_GUIDE[tier].name}</span>
            <div className={s.priceBoxArt}>
              <svg className={s.priceBox} data-size={tier} viewBox={PARCEL_BOX_VIEW[tier]} width={144} height={136} aria-hidden="true" focusable="false">
                <image href="/images/home/parcel-boxes.png" width={1774} height={887} />
              </svg>
            </div>
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
        <li>접수 한도: {INTAKE_LIMIT_TEXT}</li>
        <li>실측 요금 구간이 선택한 구간을 초과하면 차액이 청구됩니다.</li>
      </ul>
    </section>
  );
}

export type FrontNotice = { id: string; title: string; date: string };

/** "2026-09-28" → "09.28" */
const shortDate = (date: string) => date.slice(5).replace("-", ".");

/** ⑦ 공지 최신 셋. cardEmpty: 0건일 때 같은 문구를 흰 카드 안에(35절 두 역할 홈) — 로그인 전 메인은 34절대로 기존 빈 판 */
export function NoticesSlot({ notices, cardEmpty = false }: { notices: readonly FrontNotice[]; cardEmpty?: boolean }) {
  return (
    <SlotSection id="notice" title="공지사항" more={{ href: "/notices", label: "전체 보기" }}>
      {notices.length === 0 ? (
        cardEmpty ? <EmptyCard icon="bell" text="등록된 공지사항이 없습니다." /> : <p className="empty">등록된 공지사항이 없습니다.</p>
      ) : (
        <ul className={`nlist ${s.notices}`}>
          {notices.map((n) => (
            <li key={n.id}>
              <Link href="/notices">
                <b>{n.title}</b>
                <span className="t-meta">{shortDate(n.date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SlotSection>
  );
}
