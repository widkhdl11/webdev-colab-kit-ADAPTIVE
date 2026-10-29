import { PROMISE } from "@/shared/config/site-copy";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { addDays, RESTING_SHORT, restingNotice, upcomingDday, type CalendarDate, type CreatorReceiving } from "@/entities/creator/model/receiving";
import { hardItemsNotice, type HardItems } from "@/entities/gift-item/model/hard-items";
import type { WallReply } from "@/entities/gift-reply/api/gift-reply-reads";
import { ANONYMOUS_FAN, dotDate, REPLY_PHRASE_TEXT } from "@/entities/gift-reply/model/reply";
import { HardItemsLine } from "@/entities/gift-item/ui/hard-items-line";
import { approvalDurationText } from "@/entities/creator/ui/approval-time-text";
import { CreatorCoverArt, coverPastelVar } from "@/entities/creator/ui/creator-cover-art";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { CreatorTag } from "@/entities/creator/ui/creator-tag";
import { ChannelLinkIcon } from "@/entities/creator/ui/channel-badge-icon";
import { CheckIcon } from "@/entities/creator/ui/check-icon";
import { channelBadgeTitle, type ChannelBadge } from "@/entities/creator/model/channel-badge";
import { thanksLine } from "@/entities/creator/model/fan-name";
import { creatorColorVars, hasThemeVars } from "@/entities/creator/model/creator-color";
import { FandomBadge } from "@/entities/creator/ui/fandom-badge";
import type { PublicCreatorLook } from "@/entities/creator/model/link-images";
import type { ProhibitedItem } from "@/entities/parcel/model/prohibited-item";
import { lowestPriceKrw, type PublicPriceTable } from "@/entities/payment/model/price-table";
import { ProfileFollowActions } from "@/features/creator-follow/ui/profile-follow-actions";
import type { FollowMode } from "@/features/creator-follow/model/follow-mode";
import type { LinkPageSend } from "@/features/gift-register/model/sender-rule";
import s from "./creator-profile.module.css";

// 크리에이터 상세(선물 링크 페이지, creator-link). 2026-10-25 재디자인 — design-rules 31절, 시안 docs/design/mockups/site/profile-codex-2026-10-25/
// (값의 정본 profile.css), UX 명세 docs/ux/pages/handle.md 「2026-10-25 재디자인」 상태표.
// 로그인 전·후 같은 한 기둥(최대 1080, --col-profile). 어느 쪽인지는 followMode(로그인 안 함 = "login")로 가른다 — 보이는 정보·순서는 같다.
// 위에서 아래로: 배경 사진 면(큰 원형 사진이 왼쪽 아래에 걸침) · 이름 + 팬덤 뱃지 + 채널 아이콘 · 칩 · 소개 · 감사 문장 · 버튼(상태표)
// → 받기 어려운 선물 한 줄 알림(있고 쉬는 중이 아닐 때, INV-B2) → 숫자 띠(평균 승인 시간 · 요금 · 기념일) → 이번 달 N명(0이면 없음, INV-E8)
// → 감사 답장 모음(gift-reply INV-G7, 없으면 숨김) → 보내기 전 안내(보낼 수 없는 물품은 펼쳐 둔다, INV-K9) → 비슷한 크리에이터.
// 없앤 것: 받는 상태 칸·링크 주소 줄·버튼 아래 안내 줄·맨 아래 선물 판·감사 답장 설명 문장·카드 그림자.
// 팬덤 색(creator-link INV-E13·E14): 테마 색은 배경 면·사진 테두리·팬덤 뱃지에만. 버튼·글자는 사이트 색 그대로. 색은 creatorColorVars 가 8색인지 본 뒤에만 들어간다.
// 공개 화면이라 공개 이름·사진·소개·켠 항목·정해진 문구·집계 숫자·요금만 그린다(INV-E7). 주소 열람 건수는 없다(INV-E11).
// 문구 한계(design-rules 6절): 주소 약속은 shared/config/site-copy 의 고정 문구를 읽는다.

export type CreatorLinkView = CreatorCard & { photoUrl: string | null };

export type CreatorProfilePageProps = {
  creator: CreatorLinkView;
  others: readonly CreatorLinkView[];
  followMode: FollowMode;
  /**
   * open = 「선물 보내기」+「팔로우 중」 / self = 크리에이터 자기 페이지(보내지 않음) / needs_follow = 팔로우하지 않음 → 「팔로우」(INV-L9)
   * / hidden = 쉬는 중이라 버튼 자리에 쉬는 기간 한 줄(INV-B2) / unsigned = 승인 서명 연결 전(INV-E15). 판단은 서버가 sendOnLinkPage 로 한다.
   */
  send?: LinkPageSend;
  /** 지금 공개 요금표 — 서버가 DB 공개 읽기 함수로 읽어 넘긴다. */
  prices: PublicPriceTable;
  /** 보낼 수 없는 물품 — 서버가 DB 공개 읽기 함수로 읽어 넘긴다(INV-K9). */
  prohibited: readonly ProhibitedItem[];
  /** 공개 받는 상태(creator-receiving) — 쉬는 중 날짜·생일·기념일. 한도는 없다(INV-B6) */
  receiving?: CreatorReceiving | null;
  /** 살아 있는 받기 어려운 선물(hard-items) — 공개 문구 한 줄. 끝나는 날은 없다(INV-H6) */
  hardItems?: HardItems | null;
  /** 이번 달 마음을 보낸 서로 다른 팬 수(INV-E8) — 0 이면 줄을 그리지 않는다 */
  monthFans: number;
  /** 감사 답장 모음(gift-reply INV-G7) — DB 공개 읽기 함수가 고른 최신 20개. 비면 칸을 그리지 않는다 */
  replies?: readonly WallReply[];
  /** 한국 시간 오늘 — 서버가 정해 넘긴다 */
  today: CalendarDate;
  /** 팬을 부르는 이름(추가분 4-1) — 있으면 감사 문장이 「{팬덤 이름} 여러분의 마음 늘 감사해요」 */
  fanName?: string | null;
  /** 확인된 채널(추가분 4-3) — 공개 칸(플랫폼·채널 키·주소·확인 날짜)만. 없으면 아이콘을 그리지 않는다 */
  channel?: ChannelBadge | null;
  /** 배경사진·심볼 경로·미리보기 고르기(「내 팬꾹 꾸미기」) — 미리보기 이미지 주소(판 값)를 만든다 */
  look?: PublicCreatorLook;
  /** 프로필 배경사진 공개 주소 — 없으면 테마 색 면 또는 파스텔 + 흐린 고양이 */
  backgroundUrl?: string | null;
  /** 팬마크 공개 주소 — 팬덤 이름이 없을 때만 감사 문장 위에 작게(INV-E7) */
  symbolUrl?: string | null;
};

function Chevron() {
  return (
    <svg className={s.chevron} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** 숫자 띠 값 — 숫자는 크게, 단위·나머지 글자는 작게(시안 .stat dd · .unit). 글자는 받은 그대로다. */
function StatValue({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d[\d,]*)/).map((part, i) =>
        part === "" ? null : /^\d/.test(part) ? (
          <span key={i}>{part}</span>
        ) : (
          <span key={i} className={s.unit}>
            {part}
          </span>
        ),
      )}
    </>
  );
}

/**
 * 버튼 자리(UX 명세 상태표) — needs_follow·open 은 팔로우 묶음(운영자에게는 없음), self 는 꼬리표, hidden(쉬는 중)은 쉬는 기간 한 줄,
 * unsigned(승인 서명 연결 전 — creator-link INV-E15)는 팔로우 묶음에서 「선물 보내기」 대신 「승인 수단 등록 전」 배지.
 */
function Actions({ send, creator, followMode, restingText }: { send: LinkPageSend; creator: CreatorLinkView; followMode: FollowMode; restingText: string | null }) {
  if (send === "unsigned") {
    // 운영자는 팔로우하지 않는다 — 배지만 남긴다(누를 것이 없는 안내라 운영자에게도 같은 사실을 보인다)
    if (followMode === "hidden") {
      return (
        <div className={s.actions}>
          <span className={s.noSend}>승인 수단 등록 전</span>
        </div>
      );
    }
    return (
      <div className={s.actions}>
        <ProfileFollowActions creatorId={creator.id} creatorName={creator.name} initialFollowing={creator.following} signedIn={followMode !== "login"} canSend={false} />
      </div>
    );
  }
  if (send === "open" || send === "needs_follow") {
    // 운영자(followMode hidden)는 팔로우하지 않는다(set_follow 도 막는다) — 버튼 자리를 비운다
    if (followMode === "hidden") return null;
    return (
      <div className={s.actions}>
        <ProfileFollowActions creatorId={creator.id} creatorName={creator.name} initialFollowing={send === "open"} signedIn={followMode !== "login"} />
      </div>
    );
  }
  if (send === "self") {
    return (
      <div className={s.actions}>
        <span className={`tag ${s.selfTag}`}>내 페이지</span>
      </div>
    );
  }
  // 다시 받는 날을 모르면(날짜 없음) 쉬고 있다는 앞부분만 — 빈칸으로 두지 않는다
  return <p className={s.restLine}>{restingText ?? RESTING_SHORT}</p>;
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
  fanName = null,
  channel = null,
  backgroundUrl = null,
  symbolUrl = null,
}: CreatorProfilePageProps) {
  // INV-B2: 쉬는 중이면 버튼 자리에 쉬는 기간 한 줄, 받기 어려운 선물 알림을 숨긴다. 버튼을 비울지는 send 가 이미 정해 왔다.
  const restingText = restingNotice(receiving?.resumeOn ?? null, today);
  // hard-items INV-H6: 정해진 틀의 문구 한 줄 — 설정이 살아 있고 받는 중일 때만
  const showHardItems = !restingText && send !== "hidden" && hardItemsNotice(hardItems) !== null;
  // INV-B8: 가장 가까운 생일·기념일 하나를 D-30 ~ D-day 동안 — 등록 화면과 같은 계산 함수
  const dday = receiving ? upcomingDday(today, receiving.birthday, receiving.anniversaries) : null;
  const ddayDate = dday ? addDays(today, dday.daysLeft) : null;
  const guest = followMode === "login";
  // 배경 면·사진 테두리에 테마 색 — 뱃지는 같은 테마 색을 스스로 붙인다
  const colorVars = creatorColorVars({ personal: creator.colors?.personal ?? null });
  const ringed = hasThemeVars(colorVars);

  return (
    // data-wide-pub: 이 화면에서만 상단 바·바닥글 폭도 본문 기둥(1080)에 맞춘다(creator-profile.module.css)
    <main id="main" className={guest ? s.pub : `page-centered ${s.app}`} data-wide-pub="">
      <div className={s.col}>
        <section className={`${s.pf} ${ringed ? s.ringed : ""}`} style={colorVars as CSSProperties} data-creator-colors="" aria-labelledby="creator-name">
          {/* 배경 사진 칸 — 없으면 테마 색 면 또는 파스텔 + 흐린 고양이(DECISIONS d101·d102). 꾸밈이라 읽지 않는다 */}
          <div className={s.cover} style={coverPastelVar(creator.id)} aria-hidden="true">
            <CreatorCoverArt imageUrl={backgroundUrl} lazy={false} />
          </div>
          <CreatorPhoto photoUrl={creator.photoUrl} tone={creator.faceTone} className={`face ${s.photo}`} />
          <div className={s.pfMain}>
            <div className={s.nameLine} data-name-line="">
              <h1 className={s.name} id="creator-name">
                {creator.name}
              </h1>
              {fanName ? <FandomBadge name={fanName} symbolUrl={symbolUrl} themeColor={creator.colors?.personal ?? null} size="medium" /> : null}
              {/* 추가분 4-3: 확인된 채널 아이콘 하나 — 새 탭으로 열리고, 올리면 「@핸들 · 날짜 확인」 */}
              {channel ? <ChannelLinkIcon channel={channel} className={s.channel} /> : null}
            </div>
            <div className={s.tags}>
              <span className={s.verified} title={channel ? channelBadgeTitle(channel) : undefined}>
                <CheckIcon />
                채널 소유자 확인
              </span>
              {/* 태그 — 숨기지 않은 선택지 뒤에 필터를 통과한 직접 입력(creator-tags INV-T4) */}
              {creator.tags.map((t) => (
                <CreatorTag key={t} name={t} />
              ))}
            </div>
            {/* 한 줄 소개(INV-E6 — 40자, 줄바꿈 없음). 크리에이터가 직접 쓰는 글이라 다른 문장과 잇지 않는다 */}
            {creator.intro ? <p className={s.intro}>{creator.intro}</p> : null}
            {symbolUrl && !fanName ? <img className={s.symbol} src={symbolUrl} alt="팬마크" width={512} height={512} /> : null}
            <p className={s.thanks}>{thanksLine(fanName)}</p>
          </div>
          {/* 버튼 묶음 — 넓은 칸에서는 머리 오른쪽(2026-10-25 사용자 「팔로우 버튼은 오른쪽 쯤」), 좁은 칸에서는 소개 아래. 읽는 순서는 글 다음 그대로 */}
          <div className={s.side}>
            <Actions send={send} creator={creator} followMode={followMode} restingText={restingText} />
          </div>
        </section>

        {showHardItems ? (
          <aside className={s.alert} aria-labelledby="hard-items-h">
            <h2 id="hard-items-h">받기 어려운 선물</h2>
            <HardItemsLine hardItems={hardItems} />
          </aside>
        ) : null}

        {/* 숫자 띠 — 값 크게·단위 작게. 기념일은 30일 안일 때만(INV-B8) */}
        <dl className={s.stats}>
          <div className={s.stat}>
            <dt>평균 승인 소요 시간</dt>
            <dd>
              <StatValue text={approvalDurationText(creator.approvalMinutes)} />
            </dd>
          </div>
          <div className={s.stat}>
            <dt>요금</dt>
            <dd>
              <StatValue text={`${lowestPriceKrw(prices).toLocaleString("ko-KR")}원부터`} />
            </dd>
          </div>
          {dday && ddayDate ? (
            <div className={s.stat}>
              <dt>기념일</dt>
              <dd className={s.anniversary}>
                {dday.name}{" "}
                <span className={s.date}>
                  ({ddayDate.month}월 {ddayDate.day}일)
                </span>{" "}
                <span className={s.countdown}>
                  <span aria-hidden="true">{dday.daysLeft === 0 ? "D-day" : `D-${dday.daysLeft}`}</span>
                  <span className="sr-only">{dday.daysLeft === 0 ? "오늘" : `${dday.daysLeft}일 남음`}</span>
                </span>
              </dd>
            </div>
          ) : null}
        </dl>

        {/* INV-E8: 숫자만 — 누가·몇 개·금액은 없다. 0 이면 줄을 그리지 않는다 */}
        {monthFans > 0 ? (
          <p className={s.fanLine}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
            </svg>
            <span>이번 달 선물한 팬 {monthFans.toLocaleString("ko-KR")}명</span>
          </p>
        ) : null}

        {/* 감사 답장 모음(F-5, gift-reply INV-G7) — 보이는 칸은 정해진 문구·한 줄·날짜·팬 닉네임(또는 익명의 팬)뿐. 최신순만 */}
        {replies.length > 0 ? (
          <section className={s.sec} aria-labelledby="replies-h">
            <h2 className={s.secTitle} id="replies-h">
              감사 답장 모음
            </h2>
            <ul className={s.replies}>
              {replies.map((r, i) => (
                <li key={`${r.repliedOn}-${i}`} className={s.reply}>
                  <blockquote>
                    {REPLY_PHRASE_TEXT[r.phrase]}
                    {r.line ? `. ${r.line}` : null}
                  </blockquote>
                  <p className={s.by}>
                    {r.fanNickname ? `${r.fanNickname}님에게` : `${ANONYMOUS_FAN}에게`} · {dotDate(r.repliedOn)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={s.sec} aria-labelledby="guide-h">
          <h2 className={s.secTitle} id="guide-h">
            보내기 전 안내
          </h2>
          <div className={s.guide}>
            {/* 보낼 수 없는 물품 — DB 에서 받은 목록을 이 화면에서 펼쳐 둔다(INV-K9). 운영자가 목록을 다 지웠으면 줄을 그리지 않는다 */}
            {prohibited.length > 0 ? (
              <details open data-prohibited="">
                <summary>
                  보낼 수 없는 물품
                  <Chevron />
                </summary>
                <div className={s.answer}>
                  <ul className={s.prohibited}>
                    {prohibited.map((item) => (
                      <li key={item.id}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m7 7 10 10M17 7 7 17" />
                        </svg>
                        <span>
                          {item.name}
                          {item.description ? <span className={s.desc}> ({item.description})</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ) : null}
            <details>
              <summary>
                검수·주소 보호 안내
                <Chevron />
              </summary>
              <div className={s.answer}>
                <ul className={s.inspection}>
                  <li>{PROMISE.inspection}</li>
                  <li>{PROMISE.inspectionOpen}</li>
                  <li>
                    {PROMISE.address} {PROMISE.addressFan}
                  </li>
                </ul>
              </div>
            </details>
          </div>
        </section>

        {others.length > 0 ? (
          <section className={`${s.sec} ${s.similar}`} aria-labelledby="similar-title">
            <div className={s.similarHead}>
              <h2 className={s.secTitle} id="similar-title">
                다른 크리에이터
              </h2>
              <Link className={`more-link ${s.moreTop}`} href="/creators">
                전체 보기
              </Link>
            </div>
            <ul className={s.otherGrid}>
              {others.map((o) => (
                <li key={o.id}>
                  <Link className={s.other} href={creatorPagePath(o)} aria-label={`${o.name}님의 선물 링크 페이지`}>
                    <CreatorPhoto photoUrl={o.photoUrl} tone={o.faceTone} className={`face ${s.otherFace}`} />
                    <span className={s.otherWho}>
                      <b>{o.name}</b>
                      {o.tags.length > 0 ? (
                        <span className={s.otherTags}>
                          {o.tags.map((t) => (
                            <CreatorTag key={t} name={t} />
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {/* 좁은 폭에서는 목록 아래 오른쪽 — 화면 순서와 Tab 순서가 같게 목록 뒤에 링크를 하나 더 두고 폭에 따라 하나만 보인다 */}
            <Link className={`more-link ${s.moreBottom}`} href="/creators">
              전체 보기
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
