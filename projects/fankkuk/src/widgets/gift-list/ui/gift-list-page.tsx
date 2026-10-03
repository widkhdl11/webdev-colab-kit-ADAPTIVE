import Link from "next/link";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { fanBadge, fanGiftBucket, fanProgress } from "@/entities/order/ui/fan-stage-copy";
import { formatDate } from "@/shared/lib/format/datetime";
import { GiftTabs } from "./gift-tabs";
import s from "./gift-list.module.css";

// 팬 — 선물 내역(내 정보 안). 시안: docs/design/mockups/site/v4/my-gifts.html
// 진행 중 · 끝난 선물 · 받지 않은 선물, 한 줄에 하나. 받지 않은 선물은 거절·자동 반려 모두 같은 모습이다(fan-view).
// 내 정보 틀(제목·왼쪽 메뉴)과 <main> 은 라우트가 붙인다.

function GiftRow({ gift, faceTone }: { gift: FanGiftView; faceTone: string | undefined }) {
  const badge = fanBadge(gift);
  const progress = fanProgress(gift);
  const who = `${gift.creatorName}님께`;
  return (
    <li className={s["gift-row"]}>
      <CreatorFace tone={faceTone ?? "var(--face-1)"} />
      <div>
        <p className={s.who}>{who}</p>
        <p className={s.says}>
          {gift.itemKind} · 상자 {gift.boxCount}개 · 등록 {formatDate(gift.registeredAt)} · 주문번호 {gift.orderNo}
        </p>
      </div>
      <div className={s.meter}>
        {gift.outcome === "in_progress" ? (
          <>
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
            <small>
              {badge.text} · {progress.done}/{progress.total}
            </small>
          </>
        ) : (
          <span className={badge.tone === "brand" ? "tag tag--brand" : "tag"}>{badge.text}</span>
        )}
      </div>
      <Link className={`link-arrow ${s.go}`} href={`/gifts/${gift.orderNo}`} aria-label={`${who} 보낸 선물 ${gift.orderNo} 상세`}>
        상세 보기 ›
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
      <div className={s.empty}>
        <p>{empty}</p>
        <Link className="link-arrow" href="/gifts/new">
          선물 보내기 ›
        </Link>
      </div>
    );
  }
  return (
    <ul className={s["gift-rows"]}>
      {gifts.map((g) => (
        <GiftRow key={g.orderNo} gift={g} faceTone={faceToneByName[g.creatorName]} />
      ))}
    </ul>
  );
}

export function GiftListPage({
  gifts,
  faceToneByName,
  showHeading = true,
}: {
  /** false = 화면 제목을 라우트가 이미 붙였다(크리에이터의 「보낸 선물」) — 두 번 나오지 않게 */
  showHeading?: boolean;
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
      {showHeading ? (
        <div className={s["my-h"]}>
          <h2>선물 내역</h2>
        </div>
      ) : null}
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
