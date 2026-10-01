import Link from "next/link";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { BILLABLE_TIERS, TIER_PRICE_KRW } from "@/entities/payment/config/tier-pricing";
import { FollowButton } from "@/features/creator-follow/ui/follow-button";
import s from "./creator-profile.module.css";

// 크리에이터 페이지. 시안: docs/design/mockups/site/v4/creator.html
// 요금은 결제와 같은 요금표(tier-pricing)·구간 기준(size-tier)을 읽는다 — 화면 숫자와 결제가 어긋나지 않게.
// 문구 한계(design-rules 6절): "승인 없이는 저희 시스템이 주소를 열지 않습니다"는 쓰고 "절대 유출되지 않는다"는 쓰지 않는다.

const NOT_ALLOWED = [
  "음식과 신선식품 (유통기한이 있는 것 모두)",
  "살아 있는 동물과 식물",
  "폭발·인화성 물질 등 위험물",
  "현금과 상품권",
] as const;

/** 받는 상자 구간 이름 — 「소형과 중형 두 가지」. 구간이 바뀌면 요금표와 같이 바뀐다. */
const COUNT_WORD = ["", "한", "두", "세", "네"] as const;
const tierNames = BILLABLE_TIERS.map((t) => PARCEL_TIER_GUIDE[t].name);
const TIER_SENTENCE = `상자는 ${tierNames.join("과 ")} ${COUNT_WORD[tierNames.length] ?? tierNames.length} 가지예요.`;

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CreatorProfilePage({ creator, others }: { creator: CreatorCard; others: readonly CreatorCard[] }) {
  const sendHref = `/gifts/new?creator=${creator.id}`;
  return (
    <main id="main">
      <div className={`container ${s.crumb}`}>
        <Link href="/creators">‹ 크리에이터 찾기로</Link>
      </div>

      <section aria-labelledby="creator-name">
        <div className={`container ${s.prof}`}>
          <CreatorFace tone={creator.faceTone} className={s["prof-face"]} />
          <div>
            <h1 className="page-h" id="creator-name">
              {creator.name}
            </h1>
            <p className={`lead ${s.intro}`}>
              {creator.intro} {creator.channelTitle}
            </p>
            <div className={s.tags}>
              <span className="tag tag--brand">
                <CheckIcon />
                본인 확인 완료
              </span>
              <span className="tag">
                {creator.category} · {creator.channelTitle}
              </span>
            </div>
            <p className={s.avg}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="currentColor" />
                <path d="M12 6.5V12l3.5 2.5" fill="none" stroke="var(--white)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {approvalTimeText(creator.approvalMinutes)} <span className="faint">(최근 30일)</span>
            </p>
          </div>
          <div className={s.acts}>
            <Link className="btn" href={sendHref}>
              선물 보내기
            </Link>
            <FollowButton creatorName={creator.name} initialFollowing={creator.following} variant="profile" />
          </div>
        </div>
      </section>

      <section aria-label="받는 선물 안내와 요금">
        <div className={`container ${s.two}`}>
          <div>
            <div className={s.part}>
              <div className={s["part-h"]}>
                <span className={s["ico-tile"]} aria-hidden="true">
                  <img className="asset" src="/img/icon-gift.png" alt="" width={44} height={44} />
                </span>
                <h2>{creator.name}님이 받는 선물</h2>
              </div>
              <p>편지, 인형, 손수건, 책, 그림 같은 작은 선물을 상자에 담아 보내 주세요. {TIER_SENTENCE}</p>
              <h3 className={s["no-h"]}>보낼 수 없는 것</h3>
              <ul className={s["no-list"]}>
                {NOT_ALLOWED.map((item) => (
                  <li key={item}>
                    <span className={s.x} aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 20 20">
                        <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className={s.part}>
              <div className={s["part-h"]}>
                <span className={s["ico-tile"]} aria-hidden="true">
                  <img className="asset" src="/img/icon-inspect.png" alt="" width={44} height={44} />
                </span>
                <h2>상자는 이렇게 확인해요</h2>
              </div>
              <ul className={s.notes}>
                <li>팬꾹 사무실에 상자가 도착하면 겉에 붙은 송장을 떼고 겉면을 검사해요.</li>
                <li>추적 장치가 의심되는 상자만 열어 확인하고, 문제가 없으면 새 송장을 붙여 크리에이터에게 보내 드려요.</li>
                <li>승인 없이는 저희 시스템이 크리에이터의 주소를 열지 않습니다.</li>
              </ul>
            </div>
          </div>

          <aside className={s.fee} aria-labelledby="fee-title">
            <h2 id="fee-title">요금 안내</h2>
            <p>상자마다 배송비가 포함돼 있어요.</p>
            <div className={s["fee-rows"]}>
              {BILLABLE_TIERS.map((tier) => (
                <div key={tier} className={s["fee-row"]}>
                  <span>
                    <strong>{PARCEL_TIER_GUIDE[tier].name} 상자</strong>
                    <small>{PARCEL_TIER_GUIDE[tier].rule}</small>
                  </span>
                  <b>{TIER_PRICE_KRW[tier].toLocaleString("ko-KR")}원</b>
                </div>
              ))}
            </div>
            <p className={s["fee-tag"]}>
              <span className="tag">
                <CheckIcon />
                추적 장치 검수 포함
              </span>
            </p>
            <p className={s.note}>
              크기와 무게 중 큰 쪽으로 정해져요. {OVERSIZE_RULE}는 받지 않아요. 도착한 상자를 재어 보니 구간이 더 크면 차액만 따로
              결제해요.
            </p>
            <Link className={`btn btn--block ${s["fee-go"]}`} href={sendHref}>
              {creator.name}님께 선물 보내기
            </Link>
          </aside>
        </div>
      </section>

      {others.length > 0 ? (
        <section className={s.strip} aria-labelledby="similar-title">
          <div className="container">
            <div className="block-head">
              <h2 id="similar-title">이런 크리에이터도 있어요</h2>
              <Link className="link-arrow" href="/creators">
                전체 보기
              </Link>
            </div>
            <ul className={s["follow-row"]}>
              {others.map((o) => (
                <li key={o.id}>
                  <Link className={s.follow} href={`/creators/${o.id}`} aria-label={`${o.name}님 크리에이터 페이지`}>
                    <CreatorFace tone={o.faceTone} className="face face--lg" />
                    <span>
                      {o.name}
                      <small>{o.category}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
