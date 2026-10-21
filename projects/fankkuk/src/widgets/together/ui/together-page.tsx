import Link from "next/link";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { ChannelVerifiedMark } from "@/entities/creator/ui/channel-badge-icon";
import { dotDate, monthDayText } from "@/entities/gift-reply/model/reply";
import { SPECIAL_MOMENT_TEXT } from "@/entities/together/model/special-moment";
import { ALL_GIFTS_PATH } from "@/entities/together/model/together-path";
import { FOLLOW_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import { FanBoxReplies } from "@/features/gift-reply/ui/fan-box-replies";
import { GIFT_PHOTO_HINT, GiftPhotoManager } from "@/features/gift-photo/ui/gift-photo-manager";
import { statusTagClass } from "@/shared/ui/status-tone";
import type { TogetherCard, TogetherPageProps } from "../api/load-together";
import { OlderRecords } from "./older-records";
import s from "./together.module.css";

// 「○○님과 함께한 시간」 — 팬 본인 전용 (together, 추가분 F-7). 시안: docs/design/mockups/site/v34-part1/gifts-with.html (design-rules 21절 — v33b 그대로)
// 위에서 아래: 「나만 볼 수 있어요」 → 띠(함께한 선물·받은 답장 수) + 얼굴이 띠 아래로 겹친 이름·처음 선물한 날 → 다음 기념일 칸(30일 안일 때)
// → 세로 시간선 기록(최신이 위, 특별 기록은 문구 한 줄) + 기록 안 받았어요·답장 / 지금 단계 → 맨 아래 첫 선물(하늘 면 하나).
// 금액·순위·연속 기록·다른 팬 비교는 없다. 날짜는 날짜 단위만(INV-F6). 이 화면 전체를 공유하는 기능은 없고 답장 카드 단위 공유만 있다(gift-reply INV-G9).
// 무엇을 보일지(특별 카드·단계·기념일 칸·보내기 버튼)는 읽기 쪽(load-together)이 정해 오고, 여기서는 그리기만 한다.

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const PATH = {
  sparkle: "M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8zM19 16v4M17 18h4",
  down: "m6 9 6 6 6-6",
} as const;

function SendSpot({ props }: { props: TogetherPageProps }) {
  const { send, summary, signedIn } = props;
  if (send === "open") {
    return (
      <Link className="btn" href={`/gifts/new?creator=${summary.creatorId}`}>
        선물 보내기
      </Link>
    );
  }
  if (send === "needs_follow") {
    return (
      <div className={s["ann-btn"]}>
        <FollowThenSend creatorId={summary.creatorId} creatorName={summary.creatorName} signedIn={signedIn} className="btn btn--block" />
        {signedIn ? <p className="hint">{FOLLOW_NICKNAME_NOTICE}</p> : null}
      </div>
    );
  }
  return null;
}

/** 기록 한 줄의 지금 상황 — 특별 문구 · 한 줄 안내 · 진행 단계(작은 막대) */
function StatusLine({ card }: { card: TogetherCard }) {
  const p = card.progress;
  return (
    <>
      {card.moment ? (
        <span className={s.moment}>
          <Icon d={PATH.sparkle} size={20} />
          {SPECIAL_MOMENT_TEXT[card.moment]}
        </span>
      ) : null}
      {p.kind === "note" ? <span>{p.text}</span> : null}
      {p.kind === "moving" ? (
        <>
          <span>{p.title}</span>
          <span
            className="mini-steps"
            role="progressbar"
            aria-label={`${card.giftNo}번째 선물 진행 단계`}
            aria-valuemin={0}
            aria-valuemax={p.total}
            aria-valuenow={p.done}
            aria-valuetext={`${p.total}단계 중 ${p.done}단계 완료, ${p.label}`}
          >
            <span className="segs" aria-hidden="true">
              {Array.from({ length: p.total }, (_, i) => (
                <i key={i} className={i < p.done ? "on" : undefined} />
              ))}
            </span>
            <span aria-hidden="true">
              {p.done}/{p.total}
            </span>
          </span>
        </>
      ) : null}
    </>
  );
}

function GiftItem({ card, props }: { card: TogetherCard; props: TogetherPageProps }) {
  const { summary, path, photoBase } = props;
  const p = card.progress;
  const { isFirst } = card;
  const detail = (
    <Link className={s.detail} href={`/gifts/${card.orderNo}`} aria-label={`${card.giftNo}번째 선물 상세 보기`}>
      상세 보기 ›
    </Link>
  );
  const photo = <GiftPhotoManager orderNo={card.orderNo} version={card.photo?.version ?? null} returnPath={path} compact emphasis={isFirst} />;
  const boxes =
    p.kind === "boxes" ? (
      <div className={s.boxes}>
        {card.shippedOn ? <p className="t-meta">{monthDayText(card.shippedOn)}에 출고됐어요</p> : null}
        <FanBoxReplies rows={card.boxes} photoBase={photoBase} returnPath={path} />
      </div>
    ) : null;
  return (
    <li className={s.item}>
      <time className={s.when} dateTime={card.registeredOn}>
        {dotDate(card.registeredOn)}
      </time>
      {isFirst ? (
        // 첫 기록만 하늘 면 + 위로 걸친 그림(시안 .vt .first)
        <article className={s.first} aria-label={`${card.giftNo}번째 선물`}>
          <img className={s.peek} src="/images/home/icon-gift.webp" alt="" aria-hidden="true" width={64} height={64} />
          <div className={s.t}>
            <h3 className={s.what}>
              {card.itemKind} · 상자 {card.boxCount}개
            </h3>
            {card.anniversaryName ? <span className="tag tag--brand">{card.anniversaryName} 선물</span> : null}
            <span className="tag tag--brand">처음 보낸 선물</span>
          </div>
          <p className={s.s}>
            <span>{summary.creatorName}님께 처음 보낸 선물이에요</span>
            <StatusLine card={card} />
          </p>
          {boxes}
          <div className={s.foot}>
            <span>{card.giftNo}번째 선물</span>
            <span className={s.act}>
              {detail}
              {photo}
            </span>
          </div>
        </article>
      ) : (
        <article className={s.rec} aria-label={`${card.giftNo}번째 선물`}>
          <div className={s.t}>
            <h3 className={s.what}>
              {card.itemKind} · 상자 {card.boxCount}개
            </h3>
            {card.anniversaryName ? <span className="tag tag--brand">{card.anniversaryName} 선물</span> : null}
            {p.kind === "moving" ? <span className={statusTagClass(p.tone)}>{p.label}</span> : null}
            <span className={s.nth}>{card.giftNo}번째 선물</span>
          </div>
          <span className={s.act}>
            {detail}
            {photo}
          </span>
          {card.moment || p.kind !== "boxes" ? (
            <p className={s.s}>
              <StatusLine card={card} />
            </p>
          ) : null}
          {boxes}
        </article>
      )}
    </li>
  );
}

export function TogetherPage(props: TogetherPageProps) {
  const { summary, anniversary, recent, older, first } = props;
  const name = summary.creatorName;
  return (
    <main id="main" className={`page-centered ${s.page}`}>
      <div className={s.col}>
        <Link className={s.back} href={ALL_GIFTS_PATH}>
          ‹ 보낸 선물로
        </Link>
        <p className={s.priv} role="note">
          <strong>나만 볼 수 있어요</strong>
          <span>{name}님을 포함해 다른 사람은 이 화면을 볼 수 없어요.</span>
        </p>

        {/* 띠 + 얼굴 겹침(시안 .wband · .whead) — 띠에 함께한 선물·받은 답장 수 */}
        <dl className={s.wband} aria-label="나의 기록">
          <div className={s.stat}>
            <dt>함께한 선물</dt>
            <dd className="num-big">{summary.giftCount.toLocaleString("ko-KR")}개</dd>
          </div>
          <span className={s.dot} aria-hidden="true">
            ·
          </span>
          <div className={s.stat}>
            <dt>받은 답장</dt>
            <dd className="num-big">{summary.replyCount.toLocaleString("ko-KR")}통</dd>
          </div>
        </dl>
        <header className={s.whead}>
          <CreatorPhoto photoUrl={props.creatorPhotoUrl} tone="var(--face-6)" className={`face ${s.photo}`} />
          <div className={s.who}>
            <div className={s["title-row"]}>
              <h1 className={s.name}>{name}님과 함께한 시간</h1>
              {/* 추가분 4-5: 상단 프로필 옆 채널 소유 확인 표시 — 올리면 「@핸들 · 날짜 확인」 */}
              {props.channel ? <ChannelVerifiedMark channel={props.channel} /> : null}
            </div>
            <p className={s.since}>
              처음 선물한 날 <b className={s.ink}>{dotDate(summary.firstGiftOn)}</b> · {summary.dayCount.toLocaleString("ko-KR")}일째
            </p>
          </div>
        </header>

        {anniversary ? (
          <section className={s.ann} aria-labelledby="ann-h">
            <h2 id="ann-h">다음 기념일</h2>
            <p className={`t-lead ${s.dd}`}>
              {anniversary.name}{" "}
              <em className="accent t-strong">
                <span aria-hidden="true">{anniversary.daysLeft === 0 ? "D-day" : `D-${anniversary.daysLeft}`}</span>
                <span className="sr-only">{anniversary.daysLeft === 0 ? "오늘" : `${anniversary.daysLeft}일 남음`}</span>
              </em>
            </p>
            <p className="t-lead t-desc">다음 추억을 남겨 볼까요</p>
            <div className={s["ann-foot"]}>
              {props.send === "hidden" && anniversary.resumeText ? <p className={s["rest-msg"]}>{anniversary.resumeText}</p> : <SendSpot props={props} />}
            </div>
          </section>
        ) : null}

        <section className={s.tl} aria-labelledby="tl-h">
          <h2 className={s.recH} id="tl-h">
            함께한 기록
          </h2>
          <div className={s.recNote}>
            <p>최신 기록이 위에 있어요.</p>
            <p className={s.recLead}>
              내가 올린 사진 <span className={s.only}>· 나만 볼 수 있어요</span>
            </p>
            <p>{GIFT_PHOTO_HINT}</p>
          </div>
          {recent.length > 0 ? (
            <ol className={s.vt} aria-label="시간순 기록">
              {recent.map((c) => (
                <GiftItem key={c.orderNo} card={c} props={props} />
              ))}
            </ol>
          ) : null}
          {older.length > 0 ? (
            <OlderRecords
              summary={
                <>
                  이전 기록 {older.length}개 더 보기
                  <Icon d={PATH.down} size={20} />
                </>
              }
            >
              <ol className={s.vt} aria-label="이전 기록">
                {older.map((c) => (
                  <GiftItem key={c.orderNo} card={c} props={props} />
                ))}
              </ol>
            </OlderRecords>
          ) : null}
          {first ? (
            <ol className={s.vt} aria-label="첫 선물">
              <GiftItem card={first} props={props} />
            </ol>
          ) : null}
        </section>
      </div>
    </main>
  );
}
