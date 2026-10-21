import Link from "next/link";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { ChannelVerifiedMark } from "@/entities/creator/ui/channel-badge-icon";
import { dotDate, monthDayText } from "@/entities/gift-reply/model/reply";
import { SPECIAL_MOMENT_TEXT } from "@/entities/together/model/special-moment";
import { ALL_GIFTS_PATH } from "@/entities/together/model/together-path";
import { FOLLOW_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import { FanBoxReplies } from "@/features/gift-reply/ui/fan-box-replies";
import { GIFT_PHOTO_RULE, GiftPhotoManager } from "@/features/gift-photo/ui/gift-photo-manager";
import { statusTagClass, type StatusTone } from "@/shared/ui/status-tone";
import type { TogetherCard, TogetherPageProps } from "../api/load-together";
import s from "./together.module.css";

// 「○○님과 함께한 시간」 — 팬 본인 전용 (together, 추가분 F-7). 시안: docs/design/mockups/site/v35-part1/gifts-with-a.html (design-rules 22절 A안 — 사진 앨범)
// 위에서 아래: 머리(얼굴·이름·처음 선물한 날 + 오른쪽 함께한 선물·받은 답장 수) → 「나만 볼 수 있어요」 안내 줄 → 다음 기념일 칸(30일 안일 때)
// → 달마다 묶은 정사각 사진 격자(PC 3열·휴대폰 2열, 최신 달이 위). 사진이 없는 기록도 같은 크기 칸에 「사진 올리기」. 사진은 주문당 한 장.
// 세로 시간선·단계 점은 없다(기록 화면은 진행 단계처럼 그리지 않는다 — 22절). 답장이 있는 기록만 칸 아래에 답장 카드(gift-reply — 카드 단위 공유).
// 금액·순위·연속 기록·다른 팬 비교는 없다. 날짜는 날짜 단위만(INV-F6). 이 화면 전체를 공유하는 기능은 없고 답장 카드 단위 공유만 있다(gift-reply INV-G9).
// 무엇을 보일지(특별 카드·단계·기념일 칸·보내기 버튼)는 읽기 쪽(load-together)이 정해 오고, 여기서는 그리기만 한다.

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

/** 칸 왼쪽 위 꼬리표 — 처음 보낸 선물·특별 기록(INV-F4)·기념일, 그리고 지금 상황(진행 중 단계 · 받지 않은 선물 · 반송) */
function badgesOf(card: TogetherCard): Array<{ text: string; tone: StatusTone | "brand" }> {
  const out: Array<{ text: string; tone: StatusTone | "brand" }> = [];
  if (card.isFirst) out.push({ text: "처음 보낸 선물", tone: "brand" });
  if (card.moment) out.push({ text: SPECIAL_MOMENT_TEXT[card.moment], tone: "brand" });
  if (card.anniversaryName) out.push({ text: `${card.anniversaryName} 선물`, tone: "brand" });
  const p = card.progress;
  if (p.kind === "moving") out.push({ text: p.label, tone: p.tone });
  else if (card.outcome === "declined" || card.outcome === "expired") out.push({ text: "받지 않은 선물", tone: "plain" });
  else if (card.outcome === "returned") out.push({ text: "반송", tone: "plain" });
  return out;
}

function Tile({ card, props }: { card: TogetherCard; props: TogetherPageProps }) {
  const { path, photoBase } = props;
  const badges = badgesOf(card);
  // 답장이 있는 상자만 — 받았어요만 남은 상자는 선물 상세에서 본다
  const replied = card.boxes.filter((b) => b.reply !== null);
  return (
    <li className={s.tile}>
      <article aria-label={`${card.giftNo}번째 선물`}>
        <GiftPhotoManager orderNo={card.orderNo} version={card.photo?.version ?? null} returnPath={path} tile />
        {badges.length > 0 ? (
          <p className={s.badges}>
            {badges.map((b) => (
              <span key={b.text} className={b.tone === "brand" ? "tag tag--brand" : statusTagClass(b.tone)}>
                {b.text}
              </span>
            ))}
          </p>
        ) : null}
        <div className={s.cap}>
          <time dateTime={card.registeredOn}>{monthDayText(card.registeredOn)}</time>
          {/* 좁은 칸에서는 한 줄로 줄인다 — 전체는 title 과 선물 상세에서 */}
          <h3 className={s.what} title={`${card.itemKind} · 상자 ${card.boxCount}개`}>
            {card.itemKind} · 상자 {card.boxCount}개
          </h3>
          <p className={s.row2}>
            <span>{card.giftNo}번째 선물</span>
            <Link className={s.detail} href={`/gifts/${card.orderNo}`} aria-label={`${card.giftNo}번째 선물 상세 보기`}>
              상세 보기 ›
            </Link>
          </p>
          {replied.length > 0 ? (
            <div className={s.replies}>
              <FanBoxReplies rows={replied} photoBase={photoBase} returnPath={path} />
            </div>
          ) : null}
        </div>
      </article>
    </li>
  );
}

/** 「2026년 10월」 묶음 — 기록 순서(최신이 먼저)를 그대로 두고 등록한 달로 나눈다 */
function byMonth(cards: readonly TogetherCard[]): Array<{ key: string; label: string; cards: TogetherCard[] }> {
  const out: Array<{ key: string; label: string; cards: TogetherCard[] }> = [];
  for (const c of cards) {
    const m = /^(\d{4})-(\d{2})/.exec(c.registeredOn);
    const key = m ? `${m[1]}-${m[2]}` : "unknown";
    const last = out[out.length - 1];
    if (last && last.key === key) last.cards.push(c);
    else out.push({ key, label: m ? `${m[1]}년 ${Number(m[2])}월` : "", cards: [c] });
  }
  return out;
}

export function TogetherPage(props: TogetherPageProps) {
  const { summary, anniversary, recent, older, first } = props;
  const name = summary.creatorName;
  // 최근 기록 → 이전 기록 → 첫 선물(가장 오래된) — 읽기 쪽 순서 그대로 한 줄로 잇는다. 사진은 화면 밖이면 늦게 부른다(lazy)
  const months = byMonth([...recent, ...older, ...(first ? [first] : [])]);
  return (
    <main id="main" className={`page-centered v34 ${s.page}`}>
      <div className={s.col}>
        <Link className={s.back} href={ALL_GIFTS_PATH}>
          ‹ 보낸 선물로
        </Link>

        {/* 머리 — 얼굴·이름·처음 선물한 날 + 오른쪽 숫자 둘 (시안 .mhead) */}
        <header className={s.mhead}>
          <CreatorPhoto photoUrl={props.creatorPhotoUrl} tone="var(--face-6)" className={`face ${s.photo}`} />
          <div className={s.who}>
            <div className={s["title-row"]}>
              <h1 className={s.name}>{name}님과 함께한 시간</h1>
              {/* 추가분 4-5: 상단 프로필 옆 채널 소유 확인 표시 — 올리면 「@핸들 · 날짜 확인」 */}
              {props.channel ? <ChannelVerifiedMark channel={props.channel} /> : null}
            </div>
            <p className={s.since}>
              처음 선물한 날 {dotDate(summary.firstGiftOn)} · {summary.dayCount.toLocaleString("ko-KR")}일째
            </p>
          </div>
          <dl className={s.nums} aria-label="나의 기록">
            <div>
              <dt>함께한 선물</dt>
              <dd>{summary.giftCount.toLocaleString("ko-KR")}개</dd>
            </div>
            <div>
              <dt>받은 답장</dt>
              <dd>{summary.replyCount.toLocaleString("ko-KR")}통</dd>
            </div>
          </dl>
        </header>

        <p className={s.mnote} role="note">
          <strong>나만 볼 수 있어요</strong>
          <span>{GIFT_PHOTO_RULE}</span>
        </p>

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

        {months.map((m) => (
          <section key={m.key} aria-labelledby={`m-${m.key}`}>
            <div className={s.month}>
              <h2 id={`m-${m.key}`}>{m.label}</h2>
              <small>선물 {m.cards.length}개</small>
            </div>
            <ol className={s.album}>
              {m.cards.map((c) => (
                <Tile key={c.orderNo} card={c} props={props} />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </main>
  );
}
