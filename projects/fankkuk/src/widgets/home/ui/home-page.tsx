import Link from "next/link";
import type { ReactNode } from "react";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { fanBadge } from "@/entities/order/ui/fan-stage-copy";
import { statusTagClass } from "@/shared/ui/status-tone";
import s from "./home.module.css";
import { HomeNotices, type HomeNotice } from "./home-notices";
import { HowFold } from "./how-fold";

// 팬 홈(로그인 뒤). 시안: docs/design/mockups/site/v21-addendum3/fan-home.html — 본문 틀 기본 880(design-rules 00절 「본문 틀」·12절).
// 순서는 시안대로 내 구간(진행 중인 선물·팔로우) → 공지 → 「이렇게 도착해요」 접힘 줄. 첫 화면 문구·「새 크리에이터」 격자는 12절에서 뺐다.
// 시안 맨 앞의 프로필 구간과 「해야 할 일」 한 줄은 아직 없는 데이터가 필요해 두지 않는다 — 그 전까지 제목(h1)은 「닉네임님」.
// 팬 화면이라 선물은 팬용 모양(toFanView)만 받는다 — 크리에이터행 송장번호·주소가 여기 닿지 않는다.

export type HomeFollow = { id: string; name: string; faceTone: string };

type Props = {
  nickname: string;
  /** 진행 중인 선물 전부(최신순). 내 카드에는 앞의 MAX_GIFTS 개만 보인다. */
  gifts: readonly FanGiftView[];
  following: readonly HomeFollow[];
  /** 크리에이터 이름 → 얼굴 자리표시 색. 선물 줄의 얼굴이 크리에이터 찾기와 같은 색이 되게. */
  faceToneByName: Readonly<Record<string, string>>;
  notices: readonly HomeNotice[];
};

const MAX_GIFTS = 2;
/** 내 카드의 겹친 얼굴 수 */
const MAX_FACES = 4;

/** 팬 홈 제목 — 시안 .sec-head--sm(제목 24). 프로필 구간이 생기기 전까지 이 「닉네임님」이 h1 이다 */
function SecHead({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className={s.secHead}>
      <h1 id={id}>{children}</h1>
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

export function HomePage({ nickname, gifts, following, faceToneByName, notices }: Props) {
  return (
    <main id="main" className="page-pane">
      <div className={s.stack}>
        <MySection nickname={nickname} gifts={gifts} following={following} faceToneByName={faceToneByName} />
        <HomeNotices notices={notices} />
        <HowFold />
      </div>
    </main>
  );
}
