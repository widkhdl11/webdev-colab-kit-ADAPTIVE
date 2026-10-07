import Link from "next/link";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { fanBadge } from "@/entities/order/ui/fan-stage-copy";
import type { SendAvailability } from "@/features/gift-register/model/sender-rule";
import { statusTagClass } from "@/shared/ui/status-tone";
import { BrandPanel } from "./brand-panel";
import s from "./home.module.css";
import { HomeNotices, type HomeNotice } from "./home-notices";
import { NewCreators } from "./new-creators";

// 메인(로그인 뒤, 팬). 시안: docs/design/mockups/site/v9-home/home-b.html
// 둘러보는 첫 화면이 주인공이고 내 것은 오른쪽 작은 카드 하나로 줄였다(사용자 「너무 내정보 페이지 같아」 → B안).
// 팬 화면이라 선물은 팬용 모양(toFanView)만 받는다 — 크리에이터행 송장번호·주소가 여기 닿지 않는다.

export type HomeFollow = { id: string; name: string; faceTone: string };

type Props = {
  nickname: string;
  /** 진행 중인 선물 전부(최신순). 내 카드에는 앞의 MAX_GIFTS 개만 보인다. */
  gifts: readonly FanGiftView[];
  following: readonly HomeFollow[];
  /** 크리에이터 이름 → 얼굴 자리표시 색. 선물 줄의 얼굴이 크리에이터 찾기와 같은 색이 되게. */
  faceToneByName: Readonly<Record<string, string>>;
  /** 찾기에 나오는 크리에이터, 최근에 들어온 순. */
  newest: readonly CreatorCard[];
  /** 태그 칩 — 숨기지 않은 선택지 가운데 위 크리에이터 1명 이상이 가진 것, 선택지 순서(creator-tags INV-T4, tagChips). */
  chips: readonly string[];
  /** 카드마다 「선물 보내기」 자리 — 라우트가 sendAvailabilityOf 로 정한다(INV-L9). */
  sendOf: Readonly<Record<string, SendAvailability>>;
  notices: readonly HomeNotice[];
};

const MAX_GIFTS = 2;
/** 내 카드의 겹친 얼굴 수 */
const MAX_FACES = 4;

const STEPS = [
  { icon: "icon-gift", label: "1단계 · 보내기", text: "크리에이터와 선물을 고르고 결제해요." },
  { icon: "icon-approve", label: "2단계 · 승인", text: "크리에이터가 승인한 선물만 배송해요." },
  { icon: "icon-inspect", label: "3단계 · 검수", text: "사무실에서 검수한 뒤 출고해요." },
  { icon: "icon-truck", label: "4단계 · 배송", text: "크리에이터의 주소는 팬에게 보이지 않아요." },
] as const;

function MyCard({ nickname, gifts, following, faceToneByName }: Pick<Props, "nickname" | "gifts" | "following" | "faceToneByName">) {
  return (
    <aside className={s["me-card"]} aria-labelledby="me-title">
      <div className={s.hi}>
        <h2 id="me-title">{nickname}님</h2>
        <Link className="link-arrow" href="/gifts">
          진행 중인 선물 {gifts.length}개 ›
        </Link>
      </div>
      {gifts.length === 0 ? (
        <p className={`${s.sub} ${s["me-empty"]}`}>지금 진행 중인 선물이 없어요.</p>
      ) : (
        <ul className={s["me-gifts"]}>
          {gifts.slice(0, MAX_GIFTS).map((g) => {
            const badge = fanBadge(g);
            return (
              <li key={g.orderNo}>
                <Link href={`/gifts/${g.orderNo}`} aria-label={`${g.creatorName}님께 보낸 선물 · ${badge.text}`}>
                  <CreatorFace tone={faceToneByName[g.creatorName] ?? "var(--face-1)"} className={`face ${s["face-sm"]}`} />
                  <span className={s.w}>{g.creatorName}님께</span>
                  <span className={statusTagClass(badge.tone)}>{badge.text}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {following.length === 0 ? (
        <Link className={s["me-fol"]} href="/creators">
          <span className={s.t}>아직 팔로우한 크리에이터가 없어요</span>
          <span className={s.accent} aria-hidden="true">
            ›
          </span>
        </Link>
      ) : (
        <Link className={s["me-fol"]} href="/me/following" aria-label={`팔로우 ${following.length}명 · 팔로우한 크리에이터 보기`}>
          <span className={s.stack}>
            {following.slice(0, MAX_FACES).map((f) => (
              <CreatorFace key={f.id} tone={f.faceTone} className={`face ${s["face-xs"]}`} />
            ))}
          </span>
          <span className={s.t}>팔로우 {following.length}명</span>
          <span className={s.accent} aria-hidden="true">
            ›
          </span>
        </Link>
      )}
    </aside>
  );
}

export function HomePage({ nickname, gifts, following, faceToneByName, newest, chips, sendOf, notices }: Props) {
  return (
    <main id="main">
      <section className={s["hero-wrap"]} aria-labelledby="hero-title">
        <div className="container">
          <div className={s.hero}>
            <BrandPanel />
            <MyCard nickname={nickname} gifts={gifts} following={following} faceToneByName={faceToneByName} />
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="new-title">
        <div className="container">
          <div className="block-head">
            <h2 id="new-title">새로 들어온 크리에이터</h2>
            <Link className="link-arrow" href="/creators">
              전체 보기 ›
            </Link>
          </div>
          <NewCreators creators={newest} chips={chips} sendOf={sendOf} />
        </div>
      </section>

      <section className="block" aria-labelledby="how-title">
        <div className="container">
          <div className={s.panel2}>
            <h2 id="how-title">선물은 이렇게 도착해요</h2>
            <ol className={s.how}>
              {STEPS.map((st) => (
                <li key={st.icon}>
                  <img className="asset" src={`/img/${st.icon}.png`} width={88} height={88} alt="" aria-hidden="true" />
                  <div>
                    <p className={s.num}>{st.label}</p>
                    <p>{st.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link className="link-arrow" href="/about">
              팬꾹 안심 약속 보기 ›
            </Link>
          </div>
        </div>
      </section>

      <HomeNotices notices={notices} />
      <div className="page-end" />
    </main>
  );
}
