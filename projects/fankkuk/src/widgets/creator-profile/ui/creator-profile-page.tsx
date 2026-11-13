import { PROMISE } from "@/shared/config/site-copy";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { addDays, RESTING_SHORT, restingNotice, upcomingDday, type CalendarDate, type CreatorReceiving } from "@/entities/creator/model/receiving";
import { hardItemsNotice, type HardItems } from "@/entities/gift-item/model/hard-items";
import { HardItemsLine } from "@/entities/gift-item/ui/hard-items-line";
import { approvalDurationText } from "@/entities/creator/ui/approval-time-text";
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
import type { CreatorOpenBox } from "@/entities/revgift-box/api/box-reads";
import { BOX_ENTRY_LABEL, boxEntryHref, boxEntryOf } from "@/entities/revgift-box/model/box-entry";
import type { FanBoxState } from "@/entities/revgift-box/model/box-status";
import { ProfileFollowActions } from "@/features/creator-follow/ui/profile-follow-actions";
import type { FollowMode } from "@/features/creator-follow/model/follow-mode";
import type { LinkPageSend } from "@/features/gift-register/model/sender-rule";
import { BoxTiles } from "./box-tiles";
import { DetailToggle } from "./detail-toggle";
import { MyReplyCards } from "./my-reply-cards";
import type { MyReplyCard } from "@/entities/gift-reply/model/my-reply-cards";
import { ProfileCover } from "./profile-cover";
import { SimilarCarousel } from "./similar-carousel";
import s from "./creator-profile.module.css";

// 크리에이터 상세(선물 링크 페이지, creator-link). 2026-11-13 시안 e판 구현 — docs/design/mockups/creator-detail-e-20261112/ (2026-11-12 승인 + 승인 뒤 변경),
// UX 명세 docs/ux/pages/handle.md 상태표(상태별로 보이는 것은 그대로). design-prompt 2-2(줄 안 32 / 줄 사이 64) · 6-4(프로필 상세형) · 8-15(사진 칸 비율).
// 위에서 아래로: 배경 사진 전체 폭 → 상단 묶음 2×2(윗줄 프로필 | 버튼, 아랫줄 진행 중인 선물함 | 요금·승인 시간 + 받기 어려운 선물)
// → 상세 내용 여닫기(처음 닫힘: 전달 과정 | 보내기 전 안내) → 추천 크리에이터 둘러보기(자동 슬라이드).
// 없앤 것: 공개 감사 답장 모음(c판 사용자 지시 「답장은 받은 팬의 마이꾹에서만」), 숫자 띠(요금·승인 시간은 버튼 아래 한 줄, 기념일·팬 수는 이름 아래).
// 받고 싶은 선물·나에게 온 감사 카드는 시안에 있지만 그리지 않는다 — 입력 항목이 없고, 감사 카드는 새 데이터 읽기라 스펙이 먼저다.
// 팬덤 색(creator-link INV-E13·E14): 테마 색은 배경 면·사진 테두리·팬덤 뱃지·선물함 그림 칸에만. 버튼·글자는 사이트 색 그대로.
// 공개 화면이라 공개 이름·사진·소개·켠 항목·정해진 문구·집계 숫자·요금만 그린다(INV-E7). 주소 열람 건수는 없다(INV-E11).

export type CreatorLinkView = CreatorCard & { photoUrl: string | null };
/** 추천 크리에이터 카드 — 배경사진(없으면 기본 배경) 위에 사진·이름·태그(시안 e판) */
export type OtherCreatorView = CreatorLinkView & { backgroundUrl: string | null };

/** 선물함 입구 — 공개·신청 받는 중인 선물함 + 보는 팬 본인의 신청 상태(팬이 아니거나 읽지 못하면 null) */
export type OpenBoxView = CreatorOpenBox & { myState?: FanBoxState | null; waitlistNo?: number | null };

export type CreatorProfilePageProps = {
  creator: CreatorLinkView;
  others: readonly OtherCreatorView[];
  followMode: FollowMode;
  /** true = 보는 사람이 크리에이터이고 크리에이터끼리 선물을 닫아 둔 동안 — 「선물 보내기」 자리를 비운다(creator-gift-open) */
  sendClosed?: boolean;
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
  /** 한국 시간 오늘 — 서버가 정해 넘긴다 */
  today: CalendarDate;
  /** 팬을 부르는 이름(추가분 4-1) — 있으면 감사 문장이 「{팬덤 이름} 여러분의 마음 늘 감사해요」 */
  fanName?: string | null;
  /** 확인된 채널(추가분 4-3) — 공개 칸(플랫폼·채널 키·주소·확인 날짜)만. 없으면 아이콘을 그리지 않는다 */
  channel?: ChannelBadge | null;
  /** 배경사진·심볼 경로·미리보기 고르기(「내 팬꾹 꾸미기」) — 미리보기 이미지 주소(판 값)를 만든다 */
  look?: PublicCreatorLook;
  /** 프로필 배경사진 공개 주소 — 없으면 테마 색 면, 그것도 없으면 옅은 하늘 그라데이션 */
  backgroundUrl?: string | null;
  /** 팬마크 공개 주소 — 팬덤 이름이 없을 때만 감사 문장 위에 작게(INV-E7) */
  symbolUrl?: string | null;
  /** 공개·신청 받는 중인 선물함(revgift-box INV-GB4 — 크리에이터 상세의 입구). 비면 칸을 그리지 않는다 */
  openBoxes?: readonly OpenBoxView[];
  /** 「나에게 온 감사 카드」 — 팔로우한 팬 본인 답장(docs/specs/my-reply-cards.md). 0장이면 영역을 그리지 않는다(INV-RC2) */
  myReplyCards?: readonly MyReplyCard[];
};

function Chevron() {
  return (
    <svg className={s.chevron} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** 전달 과정 다섯 단계 — 시안 e판(c판 NOTES 「단계 묶음 근거」): 「보낸 선물」 단계(등록·입고·검수·출고·배송 중·수령)와 크리에이터 승인을 막대 순서(검수 → 승인 → 출고)로 묶었다.
 *  설명은 소개 페이지 문장(검수·승인·출고) + 시안이 제안한 두 문장(등록·결제, 입고). gate = 확인하는 단계(그림 칸 옅은 하늘 면). */
const FLOW_STEPS = [
  { icon: "icon-fee.webp", title: "등록·결제", body: "선물을 등록하면서 결제합니다.", gate: false },
  { icon: "icon-gift.webp", title: "입고", body: "팬꾹 주소로 보낸 상자가 도착합니다.", gate: false },
  { icon: "icon-inspect.webp", title: "검수", body: "팬이 보낸 모든 상자를 탐지기로 검사합니다.", gate: true },
  { icon: "promise-message.webp", title: "크리에이터 승인", body: "크리에이터가 선물마다 카카오톡 인증으로 승인합니다.", gate: true },
  { icon: "icon-truck.webp", title: "출고·배송", body: "승인과 검수가 완료된 선물을 출고합니다.", gate: false },
] as const;

/**
 * 버튼 자리(UX 명세 상태표) — needs_follow·open 은 팔로우 묶음(운영자에게는 없음), self 는 꼬리표, hidden(쉬는 중)은 쉬는 기간 한 줄,
 * unsigned(승인 서명 연결 전 — creator-link INV-E15)는 팔로우 묶음에서 「선물 보내기」 대신 「승인 수단 등록 전」 배지.
 */
function Actions({ send, creator, followMode, restingText, sendClosed }: { send: LinkPageSend; creator: CreatorLinkView; followMode: FollowMode; restingText: string | null; sendClosed: boolean }) {
  if (send === "unsigned") {
    // 운영자는 팔로우하지 않는다 — 배지만 남긴다(누를 것이 없는 안내라 운영자에게도 같은 사실을 보인다)
    if (followMode === "hidden") {
      return (
        <div className={s.btnrow}>
          <span className={s.noSend}>승인 수단 등록 전</span>
        </div>
      );
    }
    return (
      <div className={s.btnrow}>
        <ProfileFollowActions creatorId={creator.id} creatorName={creator.name} initialFollowing={creator.following} signedIn={followMode !== "login"} canSend={false} sendClosed={sendClosed} />
      </div>
    );
  }
  if (send === "open" || send === "needs_follow") {
    // 운영자(followMode hidden)는 팔로우하지 않는다(set_follow 도 막는다) — 버튼 자리를 비운다
    if (followMode === "hidden") return null;
    return (
      <div className={s.btnrow}>
        <ProfileFollowActions creatorId={creator.id} creatorName={creator.name} initialFollowing={send === "open"} signedIn={followMode !== "login"} sendClosed={sendClosed} />
      </div>
    );
  }
  if (send === "self") {
    return (
      <div className={s.btnrow}>
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
  sendClosed = false,
  send = "open",
  prices,
  prohibited,
  receiving = null,
  hardItems = null,
  monthFans,
  today,
  fanName = null,
  channel = null,
  backgroundUrl = null,
  symbolUrl = null,
  openBoxes = [],
  myReplyCards = [],
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
  // 선물함 타일의 뱃지·버튼(revgift-box INV-GB9) — 본인 페이지면 「신청 관리」
  const tiles = openBoxes.map((b) => {
    const entry = boxEntryOf({ owner: send === "self", myState: b.myState ?? null, waitlistNo: b.waitlistNo ?? null });
    return { id: b.id, name: b.name, description: b.description, badge: entry.badge, actionLabel: BOX_ENTRY_LABEL[entry.action], href: boxEntryHref(entry.action, b.id) };
  });

  return (
    // data-wide-pub: 이 화면에서만 상단 바·바닥글 폭도 본문 기둥(1080)에 맞춘다(creator-profile.module.css)
    <main id="main" className={`${guest ? s.pub : s.app} ${ringed ? s.ringed : ""}`} style={colorVars as CSSProperties} data-creator-colors="" data-wide-pub="">
      <ProfileCover imageUrl={backgroundUrl} />
      <div className={s.col}>
        <section className={s.head} aria-labelledby="creator-name">
          <div className={s.id}>
            <CreatorPhoto photoUrl={creator.photoUrl} tone={creator.faceTone} className={`face ${s.photo}`} />
            <div className={s.idText}>
              <div className={s.nameLine} data-name-line="">
                <h1 className={s.name} id="creator-name">
                  {creator.name}
                </h1>
                {fanName ? <FandomBadge name={fanName} symbolUrl={symbolUrl} themeColor={creator.colors?.personal ?? null} size="medium" /> : null}
                {/* 추가분 4-3: 확인된 채널 아이콘 하나 — 새 탭으로 열리고, 올리면 「@핸들 · 날짜 확인」 */}
                {channel ? <ChannelLinkIcon channel={channel} className={s.channel} /> : null}
              </div>
              {/* INV-E8: 숫자만 — 누가·몇 개·금액은 없다. 0 이면 줄을 그리지 않는다. 팬 수는 이름 가까이(6-5 3) */}
              {monthFans > 0 ? (
                <p className={s.metaLine}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
                  </svg>
                  이번 달 선물한 팬 {monthFans.toLocaleString("ko-KR")}명
                </p>
              ) : null}
              {/* 기념일 — 30일 안일 때만(INV-B8), 이름 쪽 */}
              {dday && ddayDate ? (
                <p className={s.metaLine}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3.5" y="5" width="17" height="15" rx="3" />
                    <path d="M8 3v4M16 3v4M3.5 10h17" />
                  </svg>
                  기념일 {dday.name} ({ddayDate.month}월 {ddayDate.day}일)
                  <span className={s.countdown}>
                    <span aria-hidden="true">{dday.daysLeft === 0 ? "D-day" : `D-${dday.daysLeft}`}</span>
                    <span className="sr-only">{dday.daysLeft === 0 ? "오늘" : `${dday.daysLeft}일 남음`}</span>
                  </span>
                </p>
              ) : null}
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
          </div>

          {/* 윗줄 오른쪽: 버튼 묶음(상태표) — 아래에는 아무것도 두지 않는다 */}
          <div className={s.actions}>
            <Actions send={send} creator={creator} followMode={followMode} restingText={restingText} sendClosed={sendClosed} />
          </div>

          {/* 아랫줄 왼쪽: 진행 중인 선물함(revgift-box INV-GB4 입구). 신청 자격은 신청 화면·서버가 본다 */}
          {tiles.length > 0 ? (
            <section className={s.boxes} aria-labelledby="boxes-h">
              <h2 className={s.boxesTitle} id="boxes-h">
                진행 중인 선물함
              </h2>
              <BoxTiles boxes={tiles} />
            </section>
          ) : null}

          {/* 아랫줄 오른쪽: 요금 · 평균 승인 소요 시간 한 줄 + 받기 어려운 선물 — 선물함과 같은 높이에서 시작 */}
          <div className={s.sendMeta}>
            <dl className={s.sendInfo}>
              <div>
                <dt>요금</dt>
                <dd>{`${lowestPriceKrw(prices).toLocaleString("ko-KR")}원부터`}</dd>
              </div>
              <div>
                <dt>평균 승인 소요 시간</dt>
                <dd>{approvalDurationText(creator.approvalMinutes)}</dd>
              </div>
            </dl>
            {showHardItems ? (
              <aside className={s.alert} aria-labelledby="hard-items-h">
                <h2 id="hard-items-h">받기 어려운 선물</h2>
                <HardItemsLine hardItems={hardItems} />
              </aside>
            ) : null}
          </div>
        </section>

        {/* 상세 내용 — 처음엔 닫힘(2026-11-12 사용자 확정). 2열: 전달 과정 | 보내기 전 안내 */}
        <DetailToggle>
          <div className={s.body}>
            <section aria-labelledby="flow-h">
              <h2 className={s.secTitle} id="flow-h">
                전달 과정
              </h2>
              <ol className={s.flow}>
                {FLOW_STEPS.map((step, i) => (
                  <li key={step.title} className={step.gate ? `${s.fstep} ${s.gate}` : s.fstep}>
                    {i > 0 ? (
                      <svg className={s.farrow} viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M2 8h11M9 4l4 4-4 4" />
                      </svg>
                    ) : null}
                    <div className={s.ftile} aria-hidden="true">
                      <img src={`/images/home/${step.icon}`} alt="" width={192} height={192} loading="lazy" />
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="guide-h">
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
          </div>
          {/* 시안 e판: 2열 뒤 독립 줄, 본문 전체 폭 — 상세 정보가 닫혀 있으면 함께 닫혀 있다 */}
          {myReplyCards.length > 0 ? <MyReplyCards cards={myReplyCards} creatorName={creator.name} photoUrl={creator.photoUrl} faceTone={creator.faceTone} /> : null}
        </DetailToggle>

        {others.length > 0 ? (
          <SimilarCarousel count={others.length}>
            {others.map((o) => (
              <li key={o.id}>
                <Link className={s.other} href={creatorPagePath(o)} aria-label={`${o.name}님의 선물 링크 페이지`}>
                  <span className={s.otherCover} aria-hidden="true">
                    {o.backgroundUrl ? <img src={o.backgroundUrl} alt="" width={1200} height={600} loading="lazy" /> : null}
                  </span>
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
          </SimilarCarousel>
        ) : null}
      </div>
    </main>
  );
}
