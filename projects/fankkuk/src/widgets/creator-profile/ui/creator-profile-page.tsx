import { PROMISE } from "@/shared/config/site-copy";
import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { creatorPagePath, linkText } from "@/entities/creator/model/creator-handle";
import { addDays, restingNotice, upcomingDday, type CalendarDate, type CreatorReceiving } from "@/entities/creator/model/receiving";
import type { HardItems } from "@/entities/gift-item/model/hard-items";
import type { WallReply } from "@/entities/gift-reply/api/gift-reply-reads";
import { ANONYMOUS_FAN, dotDate, REPLY_PHRASE_TEXT } from "@/entities/gift-reply/model/reply";
import { HardItemsLine } from "@/entities/gift-item/ui/hard-items-line";
import { approvalDurationText } from "@/entities/creator/ui/approval-time-text";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { CreatorTag } from "@/entities/creator/ui/creator-tag";
import type { ProhibitedItem } from "@/entities/parcel/model/prohibited-item";
import { lowestPriceKrw, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { FOLLOW_NICKNAME_NOTICE_SHORT, NEEDS_FOLLOW_TO_SEND } from "@/features/creator-follow/model/follow-notice";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import type { FollowMode } from "@/features/creator-follow/ui/follow-button";
import type { LinkPageSend } from "@/features/gift-register/model/sender-rule";
import s from "./creator-profile.module.css";

// 선물 링크 페이지 = 크리에이터 페이지 (creator-link). 시안: docs/design/mockups/site/v11/creator.html · link.html (design-rules 0절)
// 위에서 아래로 한 줄(오른쪽 판 없음): 사진·이름·링크 주소·한 줄 소개·태그·감사 문장·주 버튼(가운데) → 같은 크기 정보 카드
// (받는 상태 → 받기 어려운 품목(있을 때만) → 기념일 D-day(30일 안일 때만) → 평균 승인 → 배송비 → 이번 달 N명(0이면 숨김))
// → 감사 답장 모음(F-5 — 양쪽이 동의하고 받았어요 3일이 지난 답장만, 없으면 숨김, 2열) → 접는 안내 → 마지막 선물 보내기 판 → 비슷한 크리에이터.
// 공개 화면이라 크리에이터 공개 이름·링크용 아이디·사진·소개·켠 항목·정해진 문구·집계 숫자·요금만 그린다(INV-E7). 주소 열람 건수는 없다(INV-E11).
// 문구 한계(design-rules 6절): 주소 약속은 shared/config/site-copy 의 고정 문구를 읽고, "절대 유출되지 않는다"는 쓰지 않는다.

export type CreatorLinkView = CreatorCard & { photoUrl: string | null };

export type CreatorProfilePageProps = {
  creator: CreatorLinkView;
  others: readonly CreatorLinkView[];
  followMode: FollowMode;
  /**
   * open = 선물 보내기 / self = 크리에이터 자기 페이지(보내지 않음) / needs_follow = 팔로우하지 않음 → 「팔로우하고 선물 보내기」(INV-L9)
   * / hidden = 쉬는 중이라 자리를 비움(INV-B2). 판단은 서버가 sendOnLinkPage 로 한다.
   */
  send?: LinkPageSend;
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
  /** 감사 답장 모음(gift-reply INV-G7) — DB 공개 읽기 함수가 고른 최신 20개. 비면 칸을 그리지 않는다 */
  replies?: readonly WallReply[];
  /** 한국 시간 오늘 — 서버가 정해 넘긴다 */
  today: CalendarDate;
};

function Icon({ d }: { d: string }) {
  return (
    <span className="ic" aria-hidden="true">
      <svg viewBox="0 0 24 24">
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
  won: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 9l2 6 2-4 2 4 2-6",
} as const;

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 주 버튼 — 보낼 수 있으면 「선물 보내기」, 팔로우하지 않았으면 「팔로우하고 선물 보내기」, 자기 페이지면 안내 태그. 쉬는 중이면 그리지 않는다. */
function SendButton({ shown, creator, followMode }: { shown: LinkPageSend; creator: CreatorLinkView; followMode: FollowMode }) {
  if (shown === "open") {
    return (
      <Link className="btn btn--wide" href={`/gifts/new?creator=${creator.id}`}>
        선물 보내기
      </Link>
    );
  }
  if (shown === "needs_follow") {
    return <FollowThenSend creatorId={creator.id} creatorName={creator.name} signedIn={followMode !== "login"} className="btn btn--wide" />;
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
  replies = [],
  today,
}: CreatorProfilePageProps) {
  // INV-B2: 쉬는 중이면 안내 문구를 보이고 받기 어려운 품목 줄을 숨긴다(시안 쉬는 중 변형). 「선물 보내기」 자리를 비울지는 send 가 이미 정해 왔다.
  const restingText = restingNotice(receiving?.resumeOn ?? null, today);
  // INV-B8: 가장 가까운 생일·기념일 하나를 D-30 ~ D-day 동안 — 등록 화면과 같은 계산 함수
  const dday = receiving ? upcomingDday(today, receiving.birthday, receiving.anniversaries) : null;
  const ddayDate = dday ? addDays(today, dday.daysLeft) : null;
  const needNote = followMode === "save" ? `${NEEDS_FOLLOW_TO_SEND} ${FOLLOW_NICKNAME_NOTICE_SHORT}` : NEEDS_FOLLOW_TO_SEND;
  return (
    <main id="main">
      <section className="pf" aria-labelledby="creator-name">
        <div className="container">
          <CreatorPhoto photoUrl={creator.photoUrl} tone={creator.faceTone} className="face face--xl" />
          <h1 className="t-hero" id="creator-name">
            {creator.name}
          </h1>
          {creator.handle ? <p className="handle t-meta">{linkText(creator.handle)}</p> : null}
          {/* 한 줄 소개(INV-E6 — 40자, 줄바꿈 없음). 크리에이터가 직접 쓰는 글이라 다른 문장과 잇지 않는다 */}
          {creator.intro ? <p className="t-lead">{creator.intro}</p> : null}
          <div className="ctags">
            <span className={statusTagClass("success", s.verified)}>
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
          <p className="thanks">보내주시는 마음 늘 감사해요</p>
          {/* 첫 화면의 주 버튼(DECISIONS 2026-10-11 — v11 부터 PC 에서도 쓴다). 쉬는 중·자기 페이지면 없다 */}
          {send === "open" || send === "needs_follow" ? (
            <div className="row-btns">
              <SendButton shown={send} creator={creator} followMode={followMode} />
            </div>
          ) : null}
          {send === "needs_follow" ? <p className="note">{needNote}</p> : null}
        </div>
      </section>

      <section className="section section--compact" aria-labelledby="state-h">
        <div className="container">
          <h2 className="sr-only" id="state-h">
            받는 상태와 요금
          </h2>
          <div className="grid cols-3">
            {restingText ? (
              <div className="card info rest">
                <Icon d={PATH.clock} />
                <h3>받는 상태</h3>
                <p className="big">{restingText}</p>
              </div>
            ) : (
              <div className="card info ok">
                <Icon d={PATH.check} />
                <h3>받는 상태</h3>
                <p className="big">지금 선물을 받고 있어요</p>
              </div>
            )}
            {/* hard-items INV-H6: 정해진 틀의 문구 한 줄 — 설정이 살아 있고 받는 중일 때만 */}
            {!restingText && hardItems ? (
              <div className="card info">
                <Icon d={PATH.box} />
                <h3>받기 어려운 품목</h3>
                <HardItemsLine hardItems={hardItems} className={`big ${s.plain}`} />
              </div>
            ) : null}
            {dday && ddayDate ? (
              <div className="card info">
                <Icon d={PATH.calendar} />
                <h3>다가오는 기념일</h3>
                <p className="big">
                  {dday.name} ({ddayDate.month}월 {ddayDate.day}일)
                </p>
                <p className="dd">
                  <span className="tag tag--brand">
                    <span aria-hidden="true">{dday.daysLeft === 0 ? "D-day" : `D-${dday.daysLeft}`}</span>
                    <span className="sr-only">{dday.daysLeft === 0 ? "오늘" : `${dday.daysLeft}일 남음`}</span>
                  </span>
                </p>
              </div>
            ) : null}
            <div className="card info">
              <Icon d={PATH.clock} />
              <h3>평균 승인 시간 (최근 30일)</h3>
              <p className="big">{approvalDurationText(creator.approvalMinutes)}</p>
            </div>
            <div className="card info">
              <Icon d={PATH.won} />
              <h3>상자마다 배송비 포함</h3>
              <p className="big">{lowestPriceKrw(prices).toLocaleString("ko-KR")}원부터</p>
            </div>
            {/* INV-E8: 숫자만 — 누가·몇 개·금액은 없다. 0 이면 칸을 그리지 않는다 */}
            {monthFans > 0 ? (
              <div className="card info">
                <Icon d={PATH.heart} />
                <p className="big">
                  이번 달 <span className="accent">{monthFans.toLocaleString("ko-KR")}명</span>의 팬이 마음을 보냈어요
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* 감사 답장 모음(F-5, gift-reply INV-G7) — 보이는 칸은 정해진 문구·한 줄·날짜·팬 닉네임(또는 익명의 팬)뿐. 최신순만 */}
      {replies.length > 0 ? (
        <section className="section section--compact" aria-labelledby="replies-h">
          <div className="container">
            <div className="sec-head">
              <h2 id="replies-h">감사 답장 모음</h2>
              <p className="t-lead t-desc">{creator.name}님이 팬에게 남긴 답장 중, 팬이 공개를 허락한 것만 보여요. 최신순이에요.</p>
            </div>
            <ul className="grid cols-2">
              {replies.map((r, i) => (
                <li key={`${r.repliedOn}-${i}`} className={`card quote ${s.quote}`}>
                  <q>
                    {REPLY_PHRASE_TEXT[r.phrase]}
                    {r.line ? `. ${r.line}` : null}
                  </q>
                  <p className="by t-meta">
                    {r.fanNickname ? `${r.fanNickname}님에게` : `${ANONYMOUS_FAN}에게`} · {dotDate(r.repliedOn)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="section section--compact" aria-label="보내기 전 안내">
        <div className="container">
          <div className="acc">
            {/* 운영자가 목록을 다 지웠으면 접이식을 그리지 않는다 */}
            {prohibited.length > 0 ? (
              <details>
                <summary>
                  <span className="q">
                    <b>보낼 수 없는 것</b>
                  </span>
                  <Chevron />
                </summary>
                <div className="ans">
                  <ul className="nos">
                    {prohibited.map((item) => (
                      <li key={item.id}>
                        <span className="x" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 20 20">
                            <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        </span>
                        <span>
                          {item.name}
                          {item.description ? <span className="t-desc"> ({item.description})</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ) : null}
            <details>
              <summary>
                <span className="q">
                  <b>상자는 이렇게 확인해요</b>
                </span>
                <Chevron />
              </summary>
              <div className="ans">
                <ol className="steps-ol">
                  <li>{PROMISE.inspection}</li>
                  <li>{PROMISE.inspectionOpen}</li>
                  <li>
                    {PROMISE.address} {PROMISE.addressFan}
                  </li>
                </ol>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* 마지막 선물 보내기 판 — 비슷한 크리에이터가 없으면 이 판이 마지막이라 아래 여백을 둔다 */}
      <section className={others.length > 0 ? undefined : `section ${s["last-send"]}`} aria-labelledby="send-h">
        <div className="container">
          <div className="panel">
            <div className="center-in">
              <h2 id="send-h">
                <span className="accent">선물 보내기</span>
              </h2>
              {restingText ? <p className="t-lead t-desc">{restingText}</p> : null}
              <SendButton shown={send} creator={creator} followMode={followMode} />
            </div>
          </div>
        </div>
      </section>

      {others.length > 0 ? (
        <section className="section section--compact" aria-labelledby="similar-title">
          <div className="container">
            <div className="sec-head">
              <h2 id="similar-title">이런 크리에이터도 있어요</h2>
            </div>
            <ul className="grid cols-4">
              {others.map((o) => (
                <li key={o.id}>
                  <Link className="card other" href={creatorPagePath(o)} aria-label={`${o.name}님의 선물 링크 페이지`}>
                    <CreatorPhoto photoUrl={o.photoUrl} tone={o.faceTone} className="face" />
                    <span className="t-strong">
                      {o.name}
                      {o.tags.length > 0 ? <small>{o.tags.join(" · ")}</small> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="sec-foot">
              <Link className="btn btn--line" href="/creators">
                전체 보기
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
