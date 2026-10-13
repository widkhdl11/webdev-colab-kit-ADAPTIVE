import Link from "next/link";
import type { ReactNode } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { fanBadge } from "@/entities/order/ui/fan-stage-copy";
import type { SendAvailability } from "@/features/gift-register/model/sender-rule";
import { PROMISE } from "@/shared/config/site-copy";
import { statusTagClass } from "@/shared/ui/status-tone";
import s from "./home.module.css";
import { HomeHero } from "./home-hero";
import { HomeNotices, type HomeNotice } from "./home-notices";
import { NewCreators } from "./new-creators";

// 팬 홈(로그인 뒤). 시안: docs/design/mockups/site/v18/home-fan.html — 본문 가운데 틀(1200), 구간 사이 48.
// 광고 배너(시안 맨 위)는 다음 기능 작업이라 아직 두지 않는다.
// 둘러보는 첫 화면이 주인공이고 내 것은 그 아래 카드 두 장으로 줄였다(사용자 「너무 내정보 페이지 같아」 → v9 B안, v11 에서 위아래 배치로).
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
  { icon: "icon-gift", label: "1단계 · 보내기", title: "선물을 보내요", text: "크리에이터와 선물을 고르고 결제해요." },
  { icon: "icon-approve", label: "2단계 · 승인", title: "승인을 받아요", text: PROMISE.approval },
  { icon: "icon-inspect", label: "3단계 · 검수", title: "검수해요", text: PROMISE.inspection },
  { icon: "icon-truck", label: "4단계 · 배송", title: "대신 보내요", text: `팬꾹이 대신 보내요. ${PROMISE.addressFan}` },
] as const;

/** 팬 홈 구간 머리 — 시안 .sec-head--sm(제목 24) */
function SecHead({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className={s.secHead}>
      <h2 id={id}>{children}</h2>
    </div>
  );
}

function MySection({ nickname, gifts, following, faceToneByName }: Pick<Props, "nickname" | "gifts" | "following" | "faceToneByName">) {
  return (
    <section aria-labelledby="me-title">
      <SecHead id="me-title">{nickname}님</SecHead>
      <div className="grid cols-2">
        <div className={`card ${s.mine}`}>
          <h3>진행 중인 선물 {gifts.length}개</h3>
          {gifts.length === 0 ? (
            <p className="t-meta">지금 진행 중인 선물이 없어요.</p>
          ) : (
            <ul className="mine-list">
              {gifts.slice(0, MAX_GIFTS).map((g) => {
                const badge = fanBadge(g);
                return (
                  <li key={g.orderNo}>
                    <Link href={`/gifts/${g.orderNo}`} aria-label={`${g.creatorName}님께 보낸 선물 · ${badge.text}`}>
                      <CreatorFace tone={faceToneByName[g.creatorName] ?? "var(--face-1)"} className={s.faceSm} />
                      <span className="w">{g.creatorName}님께</span>
                      <span className={statusTagClass(badge.tone)}>{badge.text}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className={s.push}>
            <Link className="btn btn--line btn--sm" href="/gifts">
              보낸 선물 보기
            </Link>
          </div>
        </div>
        {following.length === 0 ? (
          <div className={`card ${s.mine}`}>
            <h3>아직 팔로우한 크리에이터가 없어요</h3>
            <div className={s.push}>
              <Link className="btn btn--line btn--sm" href="/creators">
                크리에이터 찾기
              </Link>
            </div>
          </div>
        ) : (
          <div className={`card ${s.mine}`}>
            <h3>팔로우 {following.length}명</h3>
            <div className={s.avStack} aria-hidden="true">
              {following.slice(0, MAX_FACES).map((f) => (
                <CreatorFace key={f.id} tone={f.faceTone} />
              ))}
            </div>
            <p className={`t-meta ${s.names}`}>{following.slice(0, MAX_FACES).map((f) => f.name).join(", ")}</p>
            <div className={s.push}>
              <Link className="btn btn--line btn--sm" href="/me/following" aria-label={`팔로우 ${following.length}명 · 팔로우한 크리에이터 보기`}>
                팔로우한 크리에이터 보기
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function HomePage({ nickname, gifts, following, faceToneByName, newest, chips, sendOf, notices }: Props) {
  return (
    <main id="main" className="page-centered">
      <div className={s.stack}>
        <HomeHero />
        <MySection nickname={nickname} gifts={gifts} following={following} faceToneByName={faceToneByName} />

        <section aria-labelledby="new-title">
          <SecHead id="new-title">새로 들어온 크리에이터</SecHead>
          <NewCreators creators={newest} chips={chips} sendOf={sendOf} />
          <div className={s.foot}>
            <Link className="btn btn--line" href="/creators">
              전체 보기
            </Link>
          </div>
        </section>

        <section aria-labelledby="how-title">
          <SecHead id="how-title">
            선물은 <span className="accent">이렇게</span> 도착해요
          </SecHead>
          <ol className={`grid cols-4 ${s.steps}`}>
            {STEPS.map((st) => (
              <li key={st.icon} className={`card ${s.stepCard}`}>
                <img src={`/img/${st.icon}.png`} width={56} height={56} alt="" aria-hidden="true" />
                <p className={s.num}>{st.label}</p>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
          <div className={s.foot}>
            <Link className="btn btn--line" href="/about">
              팬꾹 안심 약속 보기
            </Link>
          </div>
        </section>

        <HomeNotices notices={notices} />
      </div>
    </main>
  );
}
