import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { ddayLabel, restingNotice, upcomingDday, type CalendarDate, type CreatorReceiving } from "@/entities/creator/model/receiving";
import type { HardItems } from "@/entities/gift-item/model/hard-items";
import { HardItemsLine } from "@/entities/gift-item/ui/hard-items-line";
import { approvalDurationText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorTag } from "@/entities/creator/ui/creator-tag";
import type { ProhibitedItem } from "@/entities/parcel/model/prohibited-item";
import { OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { lowestPriceKrw, PRICED_TIERS, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import { FollowButton, type FollowMode } from "@/features/creator-follow/ui/follow-button";
import s from "./creator-profile.module.css";

// 크리에이터 페이지. 시안: docs/design/mockups/site/v9-pages/creator-b.html (카드 d45) · 태그 아이콘·색 tags-b.html (카드 d46)
// 얼굴·이름·소개·태그·주 버튼을 가운데로, 그 아래 요약 칸 셋(태그 · 평균 승인 · 「N원부터」 — N 은 지금 공개 요금표의 최저값).
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
  receiving = null,
  hardItems = null,
  today,
}: {
  creator: CreatorCard;
  others: readonly CreatorCard[];
  followMode: FollowMode;
  /** open = 선물 보내기 / self = 크리에이터 자기 페이지(보내지 않음) / needs_follow = 팔로우하지 않음 → 「팔로우하고 선물 보내기」(INV-L9) */
  send?: "open" | "self" | "needs_follow";
  /** 지금 공개 요금표 — 서버 page 가 DB 공개 읽기 함수로 읽어 넘긴다. */
  prices: PublicPriceTable;
  /** 보낼 수 없는 물품 — 서버 page 가 DB 공개 읽기 함수로 읽어 넘긴다(INV-K9). */
  prohibited: readonly ProhibitedItem[];
  /** 공개 받는 상태(creator-receiving) — 쉬는 중 날짜·생일·기념일. 한도는 없다(INV-B6) */
  receiving?: CreatorReceiving | null;
  /** 살아 있는 받기 어려운 품목(hard-items) — 공개 문구 한 줄. 끝나는 날은 없다(INV-H6) */
  hardItems?: HardItems | null;
  /** 한국 시간 오늘 — 서버가 정해 넘긴다 */
  today: CalendarDate;
}) {
  const sendHref = `/gifts/new?creator=${creator.id}`;
  // INV-B2: 쉬는 중이면 「선물 보내기」 자리를 비우고 안내 문구를 보인다(등록은 DB 가 막는다). 팔로우는 그대로.
  const restingText = restingNotice(receiving?.resumeOn ?? null, today);
  const sendShown = restingText ? "hidden" : send;
  // INV-B8: 가장 가까운 생일·기념일 하나를 D-30 ~ D-day 동안 — 등록 화면과 같은 계산 함수
  const dday = receiving ? upcomingDday(today, receiving.birthday, receiving.anniversaries) : null;
  return (
    <main id="main">
      <div className={`container ${s.crumb}`}>
        <Link href="/creators">‹ 크리에이터 찾기로</Link>
      </div>

      <section aria-labelledby="creator-name">
        <div className="container">
          <div className={s.center}>
            <CreatorFace tone={creator.faceTone} className={s["prof-face"]} />
            <h1 id="creator-name">{creator.name}</h1>
            {/* 소개글은 크리에이터가 직접 쓰는 글이라(my-account INV-A9) 채널 이름과 한 문장으로 잇지 않고 줄을 나눈다 */}
            {creator.intro ? <p className={s.intro}>{creator.intro}</p> : null}
            <p className={s.ch}>{creator.channelTitle}</p>
            <div className={s.tags}>
              <span className={statusTagClass("success")}>
                <CheckIcon />
                본인 확인 완료
              </span>
              {/* 태그 — 숨기지 않은 선택지 뒤에 필터를 통과한 직접 입력(creator-tags INV-T4). 채널 이름은 위 줄에 있다 */}
              {creator.tags.map((t) => (
                <CreatorTag key={t} name={t} />
              ))}
            </div>
            {/* hard-items INV-H6: 정해진 틀의 문구 한 줄 — 설정이 살아 있을 때만(끝난 설정은 서버가 빼서 보낸다) */}
            <HardItemsLine hardItems={hardItems} className={s.hard} />
            {dday ? (
              <p className={s.dday}>
                <span className="tag tag--brand">{ddayLabel(dday)}</span>
              </p>
            ) : null}
            <div className={s.acts}>
              {sendShown === "open" ? (
                <Link className="btn" href={sendHref}>
                  선물 보내기
                </Link>
              ) : null}
              {send === "self" ? <span className="tag">내 크리에이터 페이지예요</span> : null}
              {sendShown === "needs_follow" ? (
                <FollowThenSend creatorId={creator.id} creatorName={creator.name} signedIn={followMode !== "login"} />
              ) : null}
              <FollowButton creatorId={creator.id} creatorName={creator.name} initialFollowing={creator.following} variant="profile" mode={followMode} />
            </div>
            {sendShown === "needs_follow" ? <p className={s["acts-note"]}>팔로우한 크리에이터에게만 선물을 보낼 수 있어요.</p> : null}
            {restingText ? (
              <p className={s["acts-note"]}>{restingText}</p>
            ) : null}
          </div>

          <ul className={s.stats}>
            {creator.tags.length > 0 ? (
              <li className={s.stat}>
                <span className={s["stat-ic"]} aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="7" width="18" height="12" rx="3" />
                    <path d="M8 12v3M6.5 13.5h3M15.5 12.5h.01M17.5 14.5h.01" />
                  </svg>
                </span>
                <span>
                  <small>태그</small>
                  <b>{creator.tags.join(" · ")}</b>
                </span>
              </li>
            ) : null}
            <li className={s.stat}>
              <span className={s["stat-ic"]} aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
              <span>
                <small>평균 승인 (최근 30일)</small>
                <b>{approvalDurationText(creator.approvalMinutes)}</b>
              </span>
            </li>
            <li className={s.stat}>
              <span className={s["stat-ic"]} aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
                  <path d="M12 22V12" />
                  <path d="m3.3 7 8.7 5 8.7-5" />
                </svg>
              </span>
              <span>
                <small>상자 배송비 포함</small>
                <b>{lowestPriceKrw(prices).toLocaleString("ko-KR")}원부터</b>
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className={s.body} aria-label="받는 선물 안내와 요금">
        <div className={`container ${s.two}`}>
          <div>
            <div className={s.part}>
              <div className={s["part-h"]}>
                <img className="asset" src="/img/icon-gift.png" alt="" aria-hidden="true" width={56} height={56} />
                <h2>{creator.name}님이 받는 선물</h2>
              </div>
              <p>편지, 인형, 손수건, 책, 그림 같은 작은 선물을 상자에 담아 보내 주세요. {TIER_SENTENCE}</p>
              {/* 운영자가 목록을 다 지웠으면 제목과 빈 목록을 그리지 않는다 */}
              {prohibited.length > 0 && (
                <>
              <h3 className={s["no-h"]}>보낼 수 없는 것</h3>
              <ul className={s.nos}>
                {prohibited.map((item) => (
                  <li key={item.id}>
                    <span className={s.x} aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 20 20">
                        <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span>
                      {item.name}
                      {item.description ? <span className={s["no-desc"]}> ({item.description})</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
                </>
              )}
            </div>
            <div className={s.part}>
              <div className={s["part-h"]}>
                <img className="asset" src="/img/icon-inspect.png" alt="" aria-hidden="true" width={56} height={56} />
                <h2>상자는 이렇게 확인해요</h2>
              </div>
              <ol className={s.steps}>
                <li>팬꾹 사무실에 상자가 도착하면 겉에 붙은 송장을 떼고 겉면을 검사해요.</li>
                <li>추적 장치가 의심되는 상자만 열어 확인하고, 문제가 없으면 새 송장을 붙여 크리에이터에게 보내 드려요.</li>
                <li>승인 없이는 저희 시스템이 크리에이터의 주소를 열지 않습니다.</li>
              </ol>
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
            {sendShown === "open" ? (
              <Link className={`btn btn--block ${s["fee-go"]}`} href={sendHref}>
                {creator.name}님께 선물 보내기
              </Link>
            ) : null}
            {restingText ? <p className={`sub ${s["fee-go"]}`}>{restingText}</p> : null}
            {sendShown === "needs_follow" ? (
              <>
                <p className={`sub ${s["fee-go"]}`}>팔로우한 크리에이터에게만 선물을 보낼 수 있어요.</p>
                <FollowThenSend creatorId={creator.id} creatorName={creator.name} signedIn={followMode !== "login"} className="btn btn--block" />
              </>
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
                      {o.tags.length > 0 ? <small>{o.tags.join(" · ")}</small> : null}
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
