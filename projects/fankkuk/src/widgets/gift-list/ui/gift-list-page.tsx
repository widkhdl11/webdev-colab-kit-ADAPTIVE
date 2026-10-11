import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { fanBadge, fanGiftBucket, fanProgress } from "@/entities/order/ui/fan-stage-copy";
import { formatDate } from "@/shared/lib/format/datetime";
import { GiftTabs } from "./gift-tabs";
import s from "./gift-list.module.css";

// 보낸 선물 목록(「내 팬꾹」 안) — 팬은 「선물 내역」, 크리에이터는 「보낸 선물」. 시안: docs/design/mockups/site/v9-pages/me-b.html
// 진행 중 · 끝난 선물 · 받지 않은 선물, 선물마다 경계 카드 한 장(상태 배지 + 진행 중이면 진행 막대 + 상세 보기). 받지 않은 선물은 거절·자동 반려 모두 같은 모습이다(fan-view).
// 내 정보 틀(제목·왼쪽 메뉴)과 <main> 은 라우트가 붙인다.
// 목록 위 「크리에이터별로 보기」 — 선물한 크리에이터마다 「함께한 시간」(together)으로 가는 줄. 숫자는 본인에게만 보이는 기록이다(추가분 F-7).

/** 「함께한 시간」으로 가는 줄 하나 — 라우트가 my_together 로 읽어 넘긴다. */
export type TogetherLink = { creatorId: string; name: string; href: string; photoUrl: string | null; giftCount: number; replyCount: number };

function TogetherLinks({ creators }: { creators: readonly TogetherLink[] }) {
  return (
    <section className={s.by} aria-labelledby="by-creator-h">
      <h3 id="by-creator-h">크리에이터별로 보기</h3>
      <ul className={s["by-list"]}>
        {creators.map((c) => (
          <li key={c.creatorId}>
            <Link className={s["by-row"]} href={c.href}>
              <CreatorPhoto photoUrl={c.photoUrl} tone="var(--face-6)" className={`face ${s["by-face"]}`} />
              <span className={s["by-text"]}>
                <strong>{c.name}님과 함께한 시간</strong>
                <span className={s.says}>
                  선물 {c.giftCount}개 · 답장 {c.replyCount}통
                </span>
              </span>
              <span className={s["by-go"]} aria-hidden="true">
                ›
              </span>
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
    <li className={s.g}>
      <div className={s["g-top"]}>
        <CreatorFace tone={faceTone ?? "var(--face-1)"} />
        <div className={s["g-who"]}>
          <p className={s.who}>{who}</p>
          <p className={s.says}>
            {gift.itemKind} · 상자 {gift.boxCount}개 · 등록 {formatDate(gift.registeredAt)} · 주문번호 {gift.orderNo}
          </p>
        </div>
        <span className={statusTagClass(badge.tone, s.badge)}>{badge.text}</span>
      </div>
      <div className={s["g-foot"]}>
        {gift.outcome === "in_progress" ? (
          <div className={s.meter}>
            <div
              className={`dots ${s.dots}`}
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
            <small>
              {progress.done}/{progress.total} 단계
            </small>
          </div>
        ) : null}
        <Link className={`link-arrow ${s.go}`} href={`/gifts/${gift.orderNo}`} aria-label={`${who} 보낸 선물 ${gift.orderNo} 상세`}>
          상세 보기 ›
        </Link>
      </div>
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
      <div className={s.empty}>
        <p>{empty}</p>
        <Link className="link-arrow" href="/gifts/new">
          선물 보내기 ›
        </Link>
      </div>
    );
  }
  return (
    <ul className={s.rows}>
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
  title = "선물 내역",
}: {
  /** 선물한 크리에이터마다 「함께한 시간」 줄 — 비면 그리지 않는다 */
  creators?: readonly TogetherLink[];
  /** 본문 머리 — 「내 팬꾹」 메뉴 이름과 같게(팬 「선물 내역」, 크리에이터 「보낸 선물」) */
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
    <div>
      <div className={s["my-h"]}>
        <h2>{title}</h2>
      </div>
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
    </div>
  );
}
