import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { creatorPagePath, linkText } from "@/entities/creator/model/creator-handle";
import { addDays, restingNotice, upcomingDday, type CalendarDate, type CreatorReceiving } from "@/entities/creator/model/receiving";
import type { HardItems } from "@/entities/gift-item/model/hard-items";
import { HardItemsLine } from "@/entities/gift-item/ui/hard-items-line";
import { approvalDurationText } from "@/entities/creator/ui/approval-time-text";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { CreatorTag } from "@/entities/creator/ui/creator-tag";
import type { ProhibitedItem } from "@/entities/parcel/model/prohibited-item";
import { lowestPriceKrw, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import type { FollowMode } from "@/features/creator-follow/ui/follow-button";
import s from "./creator-profile.module.css";

// 선물 링크 페이지 = 크리에이터 페이지 (creator-link). 시안: docs/design/mockups/addendum/creator-link.html (PC·모바일)
// 순서(추가분 F-1): 사진·이름·링크 주소·한 줄 소개 → 감사 문장 → 받는 상태 → 받기 어려운 품목(있을 때만) → 기념일 D-day(30일 안일 때만)
// → 이번 달 N명(0이면 숨김) → 감사 답장 모음(F-5 — gift-reply 에서 채운다, 지금은 그리지 않는다) → 선물 보내기.
// PC 는 왼쪽 흐름 + 오른쪽 「선물 보내기」 판. 모바일은 한 줄로 내려오고, 맨 위에도 「선물 보내기」를 하나 더 둔다(DECISIONS 2026-10-11).
// 공개 화면이라 크리에이터 공개 이름·링크용 아이디·사진·소개·켠 항목·정해진 문구·집계 숫자·요금만 그린다(INV-E7). 주소 열람 건수는 없다(INV-E11).
// 문구 한계(design-rules 6절): "승인 없이는 저희 시스템이 주소를 열지 않습니다"는 쓰고 "절대 유출되지 않는다"는 쓰지 않는다.

export type CreatorLinkView = CreatorCard & { photoUrl: string | null };

export type CreatorProfilePageProps = {
  creator: CreatorLinkView;
  others: readonly CreatorLinkView[];
  followMode: FollowMode;
  /** open = 선물 보내기 / self = 크리에이터 자기 페이지(보내지 않음) / needs_follow = 팔로우하지 않음 → 「팔로우하고 선물 보내기」(INV-L9) */
  send?: "open" | "self" | "needs_follow";
  /** 지금 공개 요금표 — 서버가 DB 공개 읽기 함수로 읽어 넘긴다. */
  prices: PublicPriceTable;
  /** 보낼 수 없는 물품 — 서버가 DB 공개 읽기 함수로 읽어 넘긴다(INV-K9). */
  prohibited: readonly ProhibitedItem[];
  /** 공개 받는 상태(creator-receiving) — 쉬는 중 날짜·생일·기념일. 한도는 없다(INV-B6) */
  receiving?: CreatorReceiving | null;
  /** 살아 있는 받기 어려운 품목(hard-items) — 공개 문구 한 줄. 끝나는 날은 없다(INV-H6) */
  hardItems?: HardItems | null;
  /** 이번 달 마음을 보낸 서로 다른 팬 수(INV-E8) — 0 이면 줄을 그리지 않는다 */
  monthFans: number;
  /** 한국 시간 오늘 — 서버가 정해 넘긴다 */
  today: CalendarDate;
};

function Icon({ d }: { d: string }) {
  return (
    <span className={s.ic} aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

const PATH = {
  check: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l3 3 5-6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  box: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73zM12 22V12M3.3 7l8.7 5 8.7-5",
  calendar: "M6.5 5h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM8 3v4M16 3v4M3.5 10h17",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
} as const;

function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** 주 버튼 — 보낼 수 있으면 「선물 보내기」, 팔로우하지 않았으면 「팔로우하고 선물 보내기」, 자기 페이지면 안내 태그. 쉬는 중이면 그리지 않는다. */
function SendButton({ shown, creator, followMode }: { shown: "open" | "self" | "needs_follow" | "hidden"; creator: CreatorLinkView; followMode: FollowMode }) {
  if (shown === "open") {
    return (
      <Link className="btn btn--block" href={`/gifts/new?creator=${creator.id}`}>
        선물 보내기
      </Link>
    );
  }
  if (shown === "needs_follow") {
    return <FollowThenSend creatorId={creator.id} creatorName={creator.name} signedIn={followMode !== "login"} className="btn btn--block" />;
  }
  if (shown === "self") return <span className="tag">내 크리에이터 페이지예요</span>;
  return null;
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
  monthFans,
  today,
}: CreatorProfilePageProps) {
  // INV-B2: 쉬는 중이면 「선물 보내기」 자리를 비우고 안내 문구를 보인다(등록은 DB 가 막는다). 받기 어려운 품목 줄도 숨긴다(시안 쉬는 중 변형).
  const restingText = restingNotice(receiving?.resumeOn ?? null, today);
  const shown = restingText && send !== "self" ? "hidden" : send;
  // INV-B8: 가장 가까운 생일·기념일 하나를 D-30 ~ D-day 동안 — 등록 화면과 같은 계산 함수
  const dday = receiving ? upcomingDday(today, receiving.birthday, receiving.anniversaries) : null;
  const ddayDate = dday ? addDays(today, dday.daysLeft) : null;
  return (
    <main id="main">
      <section className={`container ${s.hero}`} aria-labelledby="creator-name">
        <CreatorPhoto photoUrl={creator.photoUrl} tone={creator.faceTone} className={s.photo} />
        <h1 id="creator-name">{creator.name}</h1>
        {creator.handle ? <p className={s.handle}>{linkText(creator.handle)}</p> : null}
        {/* 한 줄 소개(INV-E6 — 40자, 줄바꿈 없음). 크리에이터가 직접 쓰는 글이라 다른 문장과 잇지 않는다 */}
        {creator.intro ? <p className={s.intro}>{creator.intro}</p> : null}
        <div className={s.tags}>
          <span className={statusTagClass("success")}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            본인 확인 완료
          </span>
          {/* 태그 — 숨기지 않은 선택지 뒤에 필터를 통과한 직접 입력(creator-tags INV-T4) */}
          {creator.tags.map((t) => (
            <CreatorTag key={t} name={t} />
          ))}
        </div>
        <p className={s.thanks}>보내주시는 마음 늘 감사해요</p>
        {/* 모바일·좁은 폭: 긴 페이지라 첫 화면에도 주 버튼을 둔다(DECISIONS 2026-10-11). 넓은 폭에서는 오른쪽 판에 있어 숨긴다 */}
        {shown === "open" || shown === "needs_follow" ? (
          <div className={s["top-send"]}>
            <SendButton shown={shown} creator={creator} followMode={followMode} />
          </div>
        ) : null}
      </section>

      <div className={`container ${s.grid}`}>
        <div className={s.flow}>
          {restingText ? (
            <div className={`${s.info} ${s["info--rest"]}`}>
              <Icon d={PATH.clock} />
              <div>
                <small>받는 상태</small>
                <p>{restingText}</p>
              </div>
            </div>
          ) : (
            <div className={`${s.info} ${s["info--ok"]}`}>
              <Icon d={PATH.check} />
              <div>
                <small>받는 상태</small>
                <p>지금 선물을 받고 있어요</p>
              </div>
            </div>
          )}
          {/* hard-items INV-H6: 정해진 틀의 문구 한 줄 — 설정이 살아 있고 받는 중일 때만 */}
          {!restingText && hardItems ? (
            <div className={s.info}>
              <Icon d={PATH.box} />
              <div>
                <small>받기 어려운 품목</small>
                <HardItemsLine hardItems={hardItems} />
              </div>
            </div>
          ) : null}
          {dday && ddayDate ? (
            <div className={`${s.info} ${s["info--dday"]}`}>
              <Icon d={PATH.calendar} />
              <div>
                <small>다가오는 기념일</small>
                <p>
                  {dday.name} ({ddayDate.month}월 {ddayDate.day}일)
                </p>
              </div>
              <span className={s.dd}>
                <span className={s["dd-tag"]} aria-label={dday.daysLeft === 0 ? "오늘" : `${dday.daysLeft}일 남음`}>
                  {dday.daysLeft === 0 ? "D-day" : `D-${dday.daysLeft}`}
                </span>
              </span>
            </div>
          ) : null}
          {/* INV-E8: 숫자만 — 누가·몇 개·금액은 없다. 0 이면 줄을 그리지 않는다 */}
          {monthFans > 0 ? (
            <div className={`${s.info} ${s["month-n"]}`}>
              <Icon d={PATH.heart} />
              <div>
                <p>
                  이번 달 <b>{monthFans.toLocaleString("ko-KR")}명</b>의 팬이 마음을 보냈어요
                </p>
              </div>
            </div>
          ) : null}
          {/* 감사 답장 모음(F-5) 자리 — 양쪽이 공개에 동의한 답장만 보일 곳. gift-reply 스펙에서 채운다 */}
        </div>

        <aside className={s.send} aria-labelledby="send-h">
          <h2 id="send-h">선물 보내기</h2>
          <div className={s["send-btn"]}>
            <SendButton shown={shown} creator={creator} followMode={followMode} />
          </div>
          {shown === "needs_follow" ? <p className={s.need}>팔로우한 크리에이터에게만 선물을 보낼 수 있어요.</p> : null}
          {restingText ? <p className={s["rest-note"]}>{restingText}</p> : null}
          <div className={s.sum}>
            <div className={s["sum-row"]}>
              <Icon d={PATH.clock} />
              <span>
                <small>평균 승인 시간 (최근 30일)</small>
                <b>{approvalDurationText(creator.approvalMinutes)}</b>
              </span>
            </div>
            <div className={s["sum-row"]}>
              <Icon d={PATH.box} />
              <span>
                <small>상자마다 배송비 포함</small>
                <b>{lowestPriceKrw(prices).toLocaleString("ko-KR")}원부터</b>
              </span>
            </div>
          </div>
          {/* 운영자가 목록을 다 지웠으면 접이식을 그리지 않는다 */}
          {prohibited.length > 0 ? (
            <details className={s.fold}>
              <summary>
                보낼 수 없는 것
                <Chevron />
              </summary>
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
            </details>
          ) : null}
          <details className={s.fold}>
            <summary>
              상자는 이렇게 확인해요
              <Chevron />
            </summary>
            <ol className={s.steps}>
              <li>팬꾹 사무실에 상자가 도착하면 겉에 붙은 송장을 떼고 겉면을 검사해요.</li>
              <li>추적 장치가 의심되는 상자만 열어 확인하고, 문제가 없으면 새 송장을 붙여 보내 드려요.</li>
              <li>승인 없이는 저희 시스템이 크리에이터의 주소를 열지 않습니다.</li>
            </ol>
          </details>
        </aside>
      </div>

      {others.length > 0 ? (
        <section className={`container ${s.similar}`} aria-labelledby="similar-title">
          <div className="block-head">
            <h2 id="similar-title" className={s["h2-sec"]}>
              이런 크리에이터도 있어요
            </h2>
            <Link className="link-arrow" href="/creators">
              전체 보기
            </Link>
          </div>
          <ul className={s["follow-row"]}>
            {others.map((o) => (
              <li key={o.id}>
                <Link className={s.follow} href={creatorPagePath(o)} aria-label={`${o.name}님의 선물 링크 페이지`}>
                  <CreatorPhoto photoUrl={o.photoUrl} tone={o.faceTone} className="face face--lg" />
                  <span>
                    {o.name}
                    {o.tags.length > 0 ? <small>{o.tags.join(" · ")}</small> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className={s["page-end"]} />
    </main>
  );
}
