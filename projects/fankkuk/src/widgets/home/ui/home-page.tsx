import Link from "next/link";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { fanBadge } from "@/entities/order/ui/fan-stage-copy";
import { formatDate } from "@/shared/lib/format/datetime";
import { statusTagClass } from "@/shared/ui/status-tone";
import s from "./home.module.css";
import { HomeNotices, type HomeNotice } from "./home-notices";
import { HowFold } from "./how-fold";

// 팬 홈(로그인 뒤). 시안: docs/design/mockups/site/v21-addendum3/fan-home.html — 본문 틀 기본 880(design-rules 00절 「본문 틀」·12절).
// 순서는 시안대로 h1 → 진행 중인 선물 → 팔로우한 크리에이터(위아래 한 줄 목록) → 공지 → 「이렇게 도착해요」 접힘 줄. 첫 화면 문구·「새 크리에이터」 격자는 12절에서 뺐다.
// 시안 맨 앞의 프로필 구간과 「해야 할 일」 한 줄은 아직 없는 데이터가 필요해 두지 않는다 — 그 전까지 제목(h1)은 「닉네임님」.
// 팬 화면이라 선물은 팬용 모양(toFanView)만 받는다 — 크리에이터행 송장번호·주소가 여기 닿지 않는다.

export type HomeFollow = { id: string; name: string; faceTone: string; handle: string | null; approvalMinutes: number | null };

type Props = {
  nickname: string;
  /** 진행 중인 선물 전부(최신순). 홈 목록에는 앞의 MAX_GIFTS 개만 보인다. */
  gifts: readonly FanGiftView[];
  following: readonly HomeFollow[];
  /** 크리에이터 이름 → 얼굴 자리표시 색. 선물 줄의 얼굴이 크리에이터 찾기와 같은 색이 되게. */
  faceToneByName: Readonly<Record<string, string>>;
  notices: readonly HomeNotice[];
};

const MAX_GIFTS = 3;
/** 팔로우 목록에 보이는 줄 수 — 나머지는 「팔로우한 크리에이터」 화면에서 */
const MAX_FOLLOWS = 4;

function Chev() {
  return (
    <svg className={s.chev} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// 시안 fan-home.html — 진행 중인 선물·팔로우한 크리에이터는 위아래 두 구간, 구간마다 h2 + 한 줄 목록(.rows). 카드를 좌우로 늘어놓지 않는다(0000절).
function GiftsSection({ gifts, faceToneByName }: Pick<Props, "gifts" | "faceToneByName">) {
  return (
    <section aria-labelledby="gifts-title">
      <h2 className={s.secT} id="gifts-title">
        진행 중인 선물 <span className={s.secMeta}>{gifts.length}개</span>
      </h2>
      {gifts.length === 0 ? (
        <p className={`t-meta ${s.secBody}`}>지금 진행 중인 선물이 없어요.</p>
      ) : (
        <ul className={`${s.rows} ${s.secBody}`} aria-label="진행 중인 선물">
          {gifts.slice(0, MAX_GIFTS).map((g) => {
            const badge = fanBadge(g);
            return (
              <li key={g.orderNo}>
                <Link className={s.row} href={`/gifts/${g.orderNo}`} aria-label={`${g.creatorName}님께 보낸 선물, ${badge.text}`}>
                  <CreatorFace tone={faceToneByName[g.creatorName] ?? "var(--face-1)"} className={s.faceSm} />
                  <span className={s.w}>
                    <b>{g.creatorName}님께</b>
                    <span>
                      상자 {g.boxCount}개 · {formatDate(g.registeredAt)}에 보냈어요
                    </span>
                  </span>
                  <span className={statusTagClass(badge.tone)}>{badge.text}</span>
                  <Chev />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className={s.secFoot}>
        <Link className="btn btn--line btn--sm" href="/gifts">
          보낸 선물 모두 보기
        </Link>
      </p>
    </section>
  );
}

function FollowSection({ following }: Pick<Props, "following">) {
  return (
    <section aria-labelledby="follow-title">
      <h2 className={s.secT} id="follow-title">
        팔로우한 크리에이터 <span className={s.secMeta}>{following.length}명</span>
      </h2>
      {following.length === 0 ? (
        <p className={`t-meta ${s.secBody}`}>아직 팔로우한 크리에이터가 없어요.</p>
      ) : (
        <ul className={`${s.rows} ${s.secBody}`} aria-label="팔로우한 크리에이터">
          {following.slice(0, MAX_FOLLOWS).map((f) => (
            <li key={f.id}>
              <Link className={s.row} href={creatorPagePath(f)}>
                <CreatorFace tone={f.faceTone} className={s.faceSm} />
                <span className={s.w}>
                  <b>{f.name}</b>
                  <span>{approvalTimeText(f.approvalMinutes)}</span>
                </span>
                <Chev />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className={s.secFoot}>
        {following.length === 0 ? (
          <Link className="btn btn--line btn--sm" href="/creators">
            크리에이터 찾기
          </Link>
        ) : (
          <Link className="btn btn--line btn--sm" href="/me/following">
            팔로우한 크리에이터 모두 보기
          </Link>
        )}
      </p>
    </section>
  );
}

export function HomePage({ nickname, gifts, following, faceToneByName, notices }: Props) {
  return (
    <main id="main" className="page-pane">
      <div className={s.stack}>
        {/* 프로필 구간이 생기기 전까지 「닉네임님」이 h1 이다 — 시안 .pf-name 자리 */}
        <h1 className={s.homeName}>{nickname}님</h1>
        <GiftsSection gifts={gifts} faceToneByName={faceToneByName} />
        <FollowSection following={following} />
        <HomeNotices notices={notices} />
        <HowFold />
      </div>
    </main>
  );
}
