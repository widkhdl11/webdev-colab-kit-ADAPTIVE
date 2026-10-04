import Link from "next/link";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import type { ProhibitedItem } from "@/entities/parcel/model/prohibited-item";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { FollowButton, type FollowMode } from "@/features/creator-follow/ui/follow-button";
import s from "./creator-profile.module.css";

// 크리에이터 페이지. 시안: docs/design/mockups/site/v4/creator.html
// 보낼 수 없는 것은 운영자가 관리자 화면에서 고치는 DB 목록을(INV-K9), 요금은 결제와 같은 DB 요금표의 공개 칸(서버 page 가 읽어 넘긴다)을, 구간 기준은 size-tier 를 읽는다 — 화면 숫자와 결제가 어긋나지 않게.
// 문구 한계(design-rules 6절): "승인 없이는 저희 시스템이 주소를 열지 않습니다"는 쓰고 "절대 유출되지 않는다"는 쓰지 않는다.

/** 「상자는 소형, 중형, 대형 세 가지예요.」 — 구간 이름은 size-tier 의 안내 문구에서 읽는다. */
const COUNT_WORD = ["", "한", "두", "세", "네"] as const;
const TIER_SENTENCE = `상자는 ${PRICED_TIERS.map((t) => PARCEL_TIER_GUIDE[t].name).join(", ")} ${COUNT_WORD[PRICED_TIERS.length]} 가지예요.`;

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CreatorProfilePage({
  creator,
  others,
  followMode,
  send = "open",
  prices,
  prohibited,
}: {
  creator: CreatorCard;
  others: readonly CreatorCard[];
  followMode: FollowMode;
  /** open = 선물 보내기 / self = 크리에이터 자기 페이지(보내지 않음) / needs_follow = 크리에이터인데 팔로우가 한쪽도 없음(INV-L9) */
  send?: "open" | "self" | "needs_follow";
  /** 지금 공개 요금표 — 서버 page 가 DB 공개 읽기 함수로 읽어 넘긴다. */
  prices: PublicPriceTable;
  /** 보낼 수 없는 물품 — 서버 page 가 DB 공개 읽기 함수로 읽어 넘긴다(INV-K9). */
  prohibited: readonly ProhibitedItem[];
}) {
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
            {send === "open" ? (
              <Link className="btn" href={sendHref}>
                선물 보내기
              </Link>
            ) : null}
            {send === "self" ? <span className="tag">내 크리에이터 페이지예요</span> : null}
            {send === "needs_follow" ? <p className="sub">팔로우하면 선물을 보낼 수 있어요.</p> : null}
            <FollowButton creatorId={creator.id} creatorName={creator.name} initialFollowing={creator.following} variant="profile" mode={followMode} />
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
              {/* 운영자가 목록을 다 지웠으면 제목과 빈 목록을 그리지 않는다 */}
              {prohibited.length > 0 && (
                <>
              <h3 className={s["no-h"]}>보낼 수 없는 것</h3>
              <ul className={s["no-list"]}>
                {prohibited.map((item) => (
                  <li key={item.id}>
                    <span className={s.x} aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 20 20">
                        <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span>
                      {item.name}
                      {item.description ? <span className={s["no-desc"]}>{item.description}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
                </>
              )}
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
              {PRICED_TIERS.map((tier) => (
                <div key={tier} className={s["fee-row"]}>
                  <span>
                    <strong>{PARCEL_TIER_GUIDE[tier].name} 상자</strong>
                    <small>{PARCEL_TIER_GUIDE[tier].rule}</small>
                  </span>
                  <b>{prices[tier].priceKrw.toLocaleString("ko-KR")}원</b>
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
            {send === "open" ? (
              <Link className={`btn btn--block ${s["fee-go"]}`} href={sendHref}>
                {creator.name}님께 선물 보내기
              </Link>
            ) : null}
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
