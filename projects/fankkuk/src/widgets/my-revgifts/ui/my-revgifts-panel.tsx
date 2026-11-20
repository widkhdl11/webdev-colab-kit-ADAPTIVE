import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import { giftDetailHref } from "@/entities/action-item/model/action-items";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { ReceivedRevgift } from "@/entities/revgift/model/revgift-rows";
import { daysLeft, isOngoingStage, receivedStage, type ReceivedStage } from "@/entities/revgift/model/received-stage";
import { receivedStageCopy } from "@/entities/revgift/ui/received-status";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";
import { EmptyState } from "@/shared/ui/empty-state";
import { RevgiftTabs } from "./revgift-tabs";
import s from "./my-revgifts.module.css";

// 받은 선물 본문(팬 — 크리에이터가 보낸 역조공). 시안: docs/design/mockups/revgifts-received-compact-20261118 ④ 작은 타일 (design-rules 45절).
// 2026-11-18 사용자: 상태·남은 날이 먼저 보이고 그다음 선물 정보 · 「팬꾹은 사진이 적어 줄 목록은 같은 모양만 반복돼 단조롭다 — 거래·중고 앱의 타일이 사진 없이도 자연스럽다」.
// 탭 「받는 중」·「완료」 — 나눔은 그대로(받기 대기·수락·출고 / 나머지)(2026-10-21 카드 d104).
// 받을지 정해야 하는 타일만 하늘 면 + 남은 날 + 「확인하기」(→ 그 선물 상세의 「지금 할 일」 칸), 나머지 타일은 전체가 선물 상세 링크(action-center INV-J12).
// 팬 본인에게는 거절과 기한 지남을 나눠 보여 준다. 상자 크기·주문번호는 타일에서 빼고 링크 이름과 상세에 둔다.

type Row = { item: ReceivedRevgift; stage: ReceivedStage; copy: ReturnType<typeof receivedStageCopy> };

const tier = (item: ReceivedRevgift) => `${PARCEL_TIER_GUIDE[item.tier].name} 상자`;
const giftName = (item: ReceivedRevgift) => `${item.creatorName}님이 보낸 선물`;

function Tile({ row, nowMs }: { row: Row; nowMs: number }) {
  const { item, stage, copy } = row;
  const waiting = stage === "waiting";
  return (
    <li className={waiting ? `${s.tile} ${s.wait}` : s.tile} data-revgift-row="" data-waiting={waiting ? "" : undefined}>
      <span className={statusTagClass(copy.tone, "tag--dot")}>{copy.tag}</span>
      {waiting ? (
        <p className={s.days}>
          {daysLeft(item.deadline, nowMs)}일<small>남음</small>
          <span className="sr-only"> · {formatMonthDayKo(item.deadline)}까지</span>
        </p>
      ) : (
        <p className={s.now}>{copy.note}</p>
      )}
      <div className={s.who}>
        <CreatorFace tone="var(--face-1)" className={`face ${s.face}`} />
        {waiting ? (
          <strong className={s.name}>
            {item.creatorName}님
          </strong>
        ) : (
          <Link className={`stretch ${s.name}`} href={giftDetailHref(item.orderNo)} aria-label={`${giftName(item)} · ${tier(item)} · 주문번호 ${item.orderNo}`}>
            {item.creatorName}님
          </Link>
        )}
      </div>
      {waiting ? (
        <Link className={`btn btn--sm ${s.go}`} href={giftDetailHref(item.orderNo, true)} aria-label={`${giftName(item)} · ${tier(item)} · 주문번호 ${item.orderNo} 받기 — 확인하기`}>
          확인하기
        </Link>
      ) : null}
    </li>
  );
}

function Panel({ rows, nowMs, empty }: { rows: readonly Row[]; nowMs: number; empty: string }) {
  if (rows.length === 0) return <p className={`empty ${s.tabEmpty}`}>{empty}</p>;
  // 받을지 정해야 하는 것이 맨 앞
  const ordered = [...rows.filter((r) => r.stage === "waiting"), ...rows.filter((r) => r.stage !== "waiting")];
  return (
    <ul className={`${s.tiles} v34`}>
      {ordered.map((r) => (
        <Tile key={r.item.orderNo} row={r} nowMs={nowMs} />
      ))}
    </ul>
  );
}

export function MyRevgiftsPanel({ items, nowMs }: { items: readonly ReceivedRevgift[]; nowMs: number }) {
  const rows: Row[] = items.map((item) => {
    const stage = receivedStage(item, nowMs);
    return { item, stage, copy: receivedStageCopy(stage, item.deadline, nowMs) };
  });
  const ongoing = rows.filter((r) => isOngoingStage(r.stage));
  const past = rows.filter((r) => !isOngoingStage(r.stage));
  return (
    <div>
      <header className="page-head">
        <h1 className="ph-title">받은 선물</h1>
        <p className="ph-desc">팔로우한 크리에이터가 내게 보낸 선물입니다.</p>
      </header>
      {rows.length === 0 ? (
        <EmptyState
          id="rv-empty"
          className={s.epanel}
          art="/images/home/icon-gift.webp"
          title="받은 선물이 없습니다"
          body="팔로우한 크리에이터가 보낸 선물은 이곳에 표시됩니다."
          action={{ href: "/creators", label: "크리에이터 찾기" }}
        />
      ) : (
        <RevgiftTabs
          tabs={[
            { id: "ongoing", label: `받는 중 ${ongoing.length}`, panel: <Panel rows={ongoing} nowMs={nowMs} empty="받는 중인 선물이 없습니다." /> },
            {
              id: "past",
              label: `완료 ${past.length}`,
              panel: (
                <>
                  <Panel rows={past} nowMs={nowMs} empty="완료된 선물이 없습니다." />
                  <p className={`t-meta ${s["past-note"]}`}>수락하지 않은 선물은 크리에이터에게 반송됩니다. 수락하지 않은 이유는 크리에이터에게 공개하지 않습니다.</p>
                </>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
