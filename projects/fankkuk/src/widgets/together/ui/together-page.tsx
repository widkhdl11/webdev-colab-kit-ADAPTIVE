import Link from "next/link";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { dotDate, monthDayText } from "@/entities/gift-reply/model/reply";
import { SPECIAL_MOMENT_TEXT } from "@/entities/together/model/special-moment";
import { ALL_GIFTS_PATH } from "@/entities/together/model/together-path";
import { FOLLOW_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import { FanBoxReplies } from "@/features/gift-reply/ui/fan-box-replies";
import { GiftPhotoManager } from "@/features/gift-photo/ui/gift-photo-manager";
import { statusTagClass } from "@/shared/ui/status-tone";
import type { TogetherCard, TogetherPageProps } from "../api/load-together";
import { OlderRecords } from "./older-records";
import s from "./together.module.css";

// 「○○님과 함께한 시간」 — 팬 본인 전용 (together, 추가분 F-7). 시안: docs/design/mockups/site/v11/gift-with.html (기록은 2열 카드 격자, 휴대폰 1열)
// 위에서 아래: 「나만 볼 수 있어요」 → 이름·처음 선물한 날·며칠째 → 개인 기록 두 칸 → 다음 기념일 칸(30일 안일 때)
// → 시간순 선물 카드(최신이 위, 특별 카드는 문구 한 줄) + 카드 안 받았어요·답장 / 지금 단계 → 맨 아래 첫 선물 카드.
// 금액·순위·연속 기록·다른 팬 비교는 없다. 날짜는 날짜 단위만(INV-F6). 이 화면 전체를 공유하는 기능은 없고 답장 카드 단위 공유만 있다(gift-reply INV-G9).
// 무엇을 보일지(특별 카드·단계·기념일 칸·보내기 버튼)는 읽기 쪽(load-together)이 정해 오고, 여기서는 그리기만 한다.

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const PATH = {
  lock: "M7 11h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3zM8 11V8a4 4 0 0 1 8 0v3",
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

function GiftItem({ card, props }: { card: TogetherCard; props: TogetherPageProps }) {
  const { summary, path, photoBase } = props;
  const p = card.progress;
  const { isFirst } = card;
  return (
    <li className={s.item}>
      <time className="t-meta" dateTime={card.registeredOn}>
        {dotDate(card.registeredOn)}
      </time>
      <article className={`card ${s.gc}`} aria-label={`${card.giftNo}번째 선물`}>
        {card.moment ? (
          <p className={s.moment}>
            <Icon d={PATH.sparkle} size={20} />
            {SPECIAL_MOMENT_TEXT[card.moment]}
          </p>
        ) : null}
        <div className={s["gc-top"]}>
          <h3 className={s.what}>
            {card.itemKind} · 상자 {card.boxCount}개
          </h3>
          {card.anniversaryName ? <span className="tag tag--brand">{card.anniversaryName} 선물</span> : null}
          {isFirst ? <span className="tag tag--brand">처음 보낸 선물</span> : null}
        </div>
        {isFirst ? <p className="t-meta">{summary.creatorName}님께 처음 보낸 선물이에요</p> : null}
        {p.kind === "note" ? <p className={s.wait}>{p.text}</p> : null}
        {p.kind === "moving" ? (
          <div>
            <div className={`${s["gc-top"]} ${s["stage-top"]}`}>
              <span className={statusTagClass(p.tone)}>{p.label}</span>
              <strong>{p.title}</strong>
            </div>
            <div
              className="dots"
              role="progressbar"
              aria-label={`${card.giftNo}번째 선물 진행 단계`}
              aria-valuemin={0}
              aria-valuemax={p.total}
              aria-valuenow={p.done}
              aria-valuetext={`${p.total}단계 중 ${p.done}단계 완료, ${p.label}`}
            >
              {Array.from({ length: p.total }, (_, i) => (
                <span key={i} className={i < p.done ? "on" : undefined} />
              ))}
            </div>
          </div>
        ) : null}
        {p.kind === "boxes" ? (
          <div className={s.boxes}>
            {card.shippedOn ? <p className="t-meta">{monthDayText(card.shippedOn)}에 출고됐어요</p> : null}
            <FanBoxReplies rows={card.boxes} photoBase={photoBase} returnPath={path} />
          </div>
        ) : null}
        <GiftPhotoManager orderNo={card.orderNo} version={card.photo?.version ?? null} returnPath={path} />
        <div className={s["gc-foot"]}>
          <span className="t-meta">{card.giftNo}번째 선물</span>
          <Link href={`/gifts/${card.orderNo}`} aria-label={`${card.giftNo}번째 선물 상세 보기`}>
            상세 보기 ›
          </Link>
        </div>
      </article>
    </li>
  );
}

export function TogetherPage(props: TogetherPageProps) {
  const { summary, anniversary, recent, older, first } = props;
  const name = summary.creatorName;
  return (
    <main id="main">
      <div className="container crumb">
        <Link href={ALL_GIFTS_PATH}>‹ 선물 내역으로</Link>
      </div>
      <div className="container">
        <p className={s.priv} role="note">
          <Icon d={PATH.lock} size={20} />
          <strong>나만 볼 수 있어요</strong>
          <span>{name}님을 포함해 다른 사람은 이 화면을 볼 수 없어요.</span>
        </p>

        <div className={s["who-head"]}>
          <CreatorPhoto photoUrl={props.creatorPhotoUrl} tone="var(--face-6)" className={`face face--lg ${s.photo}`} />
          <h1 className="t-title">{name}님과 함께한 시간</h1>
          <p className="t-lead t-desc">
            처음 선물한 날 <b className={s.ink}>{dotDate(summary.firstGiftOn)}</b> · <b className={s.ink}>{summary.dayCount.toLocaleString("ko-KR")}일째</b>
          </p>
        </div>

        <dl className="grid cols-3 keep" aria-label="나의 기록">
          <div className={`card ${s.rec}`}>
            <dt>함께한 선물</dt>
            <dd>
              <b>
                {summary.giftCount.toLocaleString("ko-KR")}
                <span>개</span>
              </b>
            </dd>
          </div>
          <div className={`card ${s.rec}`}>
            <dt>받은 답장</dt>
            <dd>
              <b>
                {summary.replyCount.toLocaleString("ko-KR")}
                <span>통</span>
              </b>
            </dd>
          </div>
        </dl>

        {anniversary ? (
          <section className={`panel center ${s.ann}`} aria-labelledby="ann-h">
            <h2 className="t-title" id="ann-h">
              다음 기념일
            </h2>
            <p className={`t-lead ${s.dd}`}>
              {anniversary.name}{" "}
              <em className="accent t-strong">
                <span aria-hidden="true">{anniversary.daysLeft === 0 ? "D-day" : `D-${anniversary.daysLeft}`}</span>
                <span className="sr-only">{anniversary.daysLeft === 0 ? "오늘" : `${anniversary.daysLeft}일 남음`}</span>
              </em>
            </p>
            <p className="t-lead t-desc">다음 추억을 남겨 볼까요</p>
            <div className="sec-foot">
              {props.send === "hidden" && anniversary.resumeText ? <p className={s["rest-msg"]}>{anniversary.resumeText}</p> : <SendSpot props={props} />}
            </div>
          </section>
        ) : null}

        <section className={`section ${s.tl}`} aria-labelledby="tl-h">
          <div className="sec-head">
            <h2 className="t-title" id="tl-h">
              함께한 기록
            </h2>
            <p className="t-lead t-desc">최신 기록이 위에 있어요.</p>
          </div>
          {recent.length > 0 ? (
            <ol className={`grid cols-2 ${s.list}`} aria-label="시간순 기록">
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
              <ol className={`grid cols-2 ${s.list}`} aria-label="이전 기록">
                {older.map((c) => (
                  <GiftItem key={c.orderNo} card={c} props={props} />
                ))}
              </ol>
            </OlderRecords>
          ) : null}
          {first ? (
            <ol className={`grid cols-2 ${s.list}`} aria-label="첫 선물">
              <GiftItem card={first} props={props} />
            </ol>
          ) : null}
        </section>
      </div>
      <div className="page-end" />
    </main>
  );
}
