import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { fanBadge, fanGiftBucket, fanProgress } from "@/entities/order/ui/fan-stage-copy";
import { formatDate } from "@/shared/lib/format/datetime";
import { GiftTabs } from "./gift-tabs";
import s from "./gift-list.module.css";

// 보낸 선물 목록 — 팬·크리에이터 모두 「보낸 선물」. 시안: docs/design/mockups/site/v18/my-gifts.html (넓은 틀 + 페이지 머리, 2열 카드 격자, 휴대폰 1열 — design-rules 00절)
// 진행 중 · 끝난 선물 · 받지 않은 선물, 선물마다 같은 크기 카드 한 장(상태 배지 + 진행 중이면 진행 막대 + 상세 보기). 받지 않은 선물은 거절·자동 반려 모두 같은 모습이다(fan-view).
// 본문 틀 <main class="page-pane"> 은 라우트가 MyShell 로 붙인다.
// 목록 위 「크리에이터별로 보기」 — 선물한 크리에이터마다 「함께한 시간」(together)으로 가는 줄. 숫자는 본인에게만 보이는 기록이다(추가분 F-7).

/** 「함께한 시간」으로 가는 줄 하나 — 라우트가 my_together 로 읽어 넘긴다. */
export type TogetherLink = { creatorId: string; name: string; href: string; photoUrl: string | null; giftCount: number; replyCount: number };

function TogetherLinks({ creators }: { creators: readonly TogetherLink[] }) {
  return (
    <section className={s.by} aria-labelledby="by-creator-h">
      <h2 id="by-creator-h" className={s.h}>
        크리에이터별로 보기
      </h2>
      <ul className={s.cards}>
        {creators.map((c) => (
          <li key={c.creatorId}>
            <Link className={`card ${s.tg}`} href={c.href}>
              <CreatorPhoto photoUrl={c.photoUrl} tone="var(--face-6)" className="face" />
              <span className={s["tg-text"]}>
                <strong>{c.name}님과 함께한 시간</strong>
                <span className="t-meta">
                  선물 {c.giftCount}개 · 답장 {c.replyCount}통
                </span>
              </span>
              <svg className={s.chev} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GiftRow({ gift, faceTone }: { gift: FanGiftView; faceTone: string | undefined }) {
  const badge = fanBadge(gift);
  const progress = fanProgress(gift);
  const who = `${gift.creatorName}님께`;
  return (
    <li className="card gcard">
      <div className="gcard-top">
        <CreatorFace tone={faceTone ?? "var(--face-1)"} />
        <div>
          <p className="t-strong">{who}</p>
          <p className="t-meta">
            {gift.itemKind} · 상자 {gift.boxCount}개
          </p>
        </div>
      </div>
      <p className="t-meta">
        등록 {formatDate(gift.registeredAt)} · 주문번호 {gift.orderNo}
      </p>
      <p>
        <span className={statusTagClass(badge.tone)}>{badge.text}</span>
      </p>
      {gift.outcome === "in_progress" ? (
        <div>
          <div
            className="dots"
            role="progressbar"
            aria-label={`${who} 보낸 선물 ${gift.orderNo} 진행 단계`}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-valuetext={`${progress.total}단계 중 ${progress.done}단계 완료, ${badge.text}`}
          >
            {gift.steps.map((st) => (
              <span key={st.key} className={st.state === "done" ? "on" : undefined} />
            ))}
          </div>
          <p className={`t-meta ${s.meter}`}>
            {progress.done}/{progress.total} 단계
          </p>
        </div>
      ) : null}
      <Link className={`btn btn--line btn--sm btn--block ${s.go}`} href={`/gifts/${gift.orderNo}`} aria-label={`${who} 보낸 선물 ${gift.orderNo} 상세`}>
        상세 보기
      </Link>
    </li>
  );
}

function Rows({
  gifts,
  empty,
  faceToneByName,
}: {
  gifts: readonly FanGiftView[];
  empty: string;
  faceToneByName: Readonly<Record<string, string>>;
}) {
  if (gifts.length === 0) {
    return (
      <div className="empty">
        <p>{empty}</p>
        <Link className="link-arrow" href="/gifts/new">
          선물 보내기 ›
        </Link>
      </div>
    );
  }
  return (
    <ul className={s.cards}>
      {gifts.map((g) => (
        <GiftRow key={g.orderNo} gift={g} faceTone={faceToneByName[g.creatorName]} />
      ))}
    </ul>
  );
}

export function GiftListPage({
  gifts,
  faceToneByName,
  creators = [],
  title = "보낸 선물",
}: {
  /** 선물한 크리에이터마다 「함께한 시간」 줄 — 비면 그리지 않는다 */
  creators?: readonly TogetherLink[];
  /** 페이지 머리 제목 — 사이드바 메뉴 이름과 같게(팬·크리에이터 모두 「보낸 선물」, design-rules 00절) */
  title?: string;
  gifts: readonly FanGiftView[];
  /** 크리에이터 이름 → 얼굴 면 색. 메인 화면과 같은 색을 쓴다. */
  faceToneByName: Readonly<Record<string, string>>;
}) {
  // 묶음 기준은 fanGiftBucket 하나 — 메인 「진행 중인 선물」과 같은 수가 나온다
  const ongoing = gifts.filter((g) => fanGiftBucket(g) === "ongoing");
  const ended = gifts.filter((g) => fanGiftBucket(g) === "ended");
  const notAccepted = gifts.filter((g) => fanGiftBucket(g) === "not_accepted");

  return (
    <>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            {title}
            <span className="ph-count">{gifts.length}</span>
          </h1>
          <Link className="btn btn--sm" href="/gifts/new">
            선물 보내기
          </Link>
        </div>
        <p className="ph-desc">크리에이터별로 보낸 선물과 받은 답장을 한곳에서 볼 수 있어요.</p>
      </header>
      {creators.length > 0 ? <TogetherLinks creators={creators} /> : null}
      <GiftTabs
        tabs={[
          {
            id: "ongoing",
            label: `진행 중 ${ongoing.length}`,
            panel: <Rows gifts={ongoing} faceToneByName={faceToneByName} empty="지금 진행 중인 선물이 없어요." />,
          },
          {
            id: "ended",
            label: `끝난 선물 ${ended.length}`,
            panel: <Rows gifts={ended} faceToneByName={faceToneByName} empty="아직 끝난 선물이 없어요." />,
          },
          {
            id: "not-accepted",
            label: `받지 않은 선물 ${notAccepted.length}`,
            panel: (
              <>
                <p className={s["note-line"]}>
                  크리에이터가 받지 않기로 했거나 승인 시간이 지난 선물이에요. 사무실 도착 전이면 결제 금액을 모두, 도착 뒤면 반송 택배비를 뺀 금액을 돌려드려요.
                </p>
                <Rows gifts={notAccepted} faceToneByName={faceToneByName} empty="받지 않은 선물이 없어요." />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
