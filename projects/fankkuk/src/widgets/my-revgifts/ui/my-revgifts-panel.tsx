import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import { giftDetailHref } from "@/entities/action-item/model/action-items";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { ReceivedRevgift } from "@/entities/revgift/model/revgift-rows";
import { daysLeft, isOngoingStage, receivedStage, type ReceivedStage } from "@/entities/revgift/model/received-stage";
import { receivedStageCopy } from "@/entities/revgift/ui/received-status";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";
import { RevgiftTabs } from "./revgift-tabs";
import s from "./my-revgifts.module.css";

// 받은 선물 본문(팬 — 크리에이터가 보낸 역조공). 시안: docs/design/mockups/site/v34-part1/revgifts.html (design-rules 21절).
// 탭 「받는 중」·「완료」 — 나눔은 그대로(받기 대기·수락·출고 / 나머지), 이름만 바뀌었다(2026-10-21 카드 d104).
// 받을지 정해야 하는 줄만 강조 칸(남은 날·「바로 하기」 → 그 선물 상세의 「지금 할 일」 칸), 나머지는 촘촘한 줄 → 선물 상세(action-center INV-J12).
// 팬 본인에게는 거절과 기한 지남을 나눠 보여 준다.

type Row = { item: ReceivedRevgift; stage: ReceivedStage; copy: ReturnType<typeof receivedStageCopy> };

const tier = (item: ReceivedRevgift) => `${PARCEL_TIER_GUIDE[item.tier].name} 상자`;

function Featured({ row, nowMs }: { row: Row; nowMs: number }) {
  const { item } = row;
  const id = `rv-feat-${item.orderNo}`;
  return (
    <article className={`feat ${s.feat}`} data-revgift-row="" data-waiting="" aria-labelledby={id}>
      <div className="feat-who">
        <span className="face" aria-hidden="true">
          {item.creatorName.slice(0, 1)}
        </span>
        <div>
          <strong id={id}>{item.creatorName}님이 보낸 선물</strong>
          <span className="meta">
            {tier(item)} · 주문번호 {item.orderNo}
          </span>
          <span className={statusTagClass("warn")}>{row.copy.tag}</span>
        </div>
      </div>
      <div className="feat-days">
        <p className="num-big">
          {daysLeft(item.deadline, nowMs)}일<small>남음</small>
        </p>
        <span className="lab">{formatMonthDayKo(item.deadline)}까지</span>
      </div>
      <Link className="btn" href={giftDetailHref(item.orderNo, true)} aria-label={`${item.creatorName}님이 보낸 선물 받기 — 바로 하기`}>
        바로 하기
      </Link>
    </article>
  );
}

function RowList({ rows }: { rows: readonly Row[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className={`lrows ${s.rows}`}>
      {rows.map(({ item, copy }) => (
        <li key={item.orderNo} className="lrow" data-revgift-row="">
          <span className="face" aria-hidden="true">
            {item.creatorName.slice(0, 1)}
          </span>
          <p className="lrow-txt">
            <Link className="stretch" href={giftDetailHref(item.orderNo)}>
              <strong>{item.creatorName}님이 보낸 선물</strong>
            </Link>
            <span className="meta">
              {tier(item)} · 주문번호 {item.orderNo} · {copy.note}
            </span>
          </p>
          <div className="lrow-side">
            <span className={statusTagClass(copy.tone)}>{copy.tag}</span>
          </div>
          <svg className="lrow-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </li>
      ))}
    </ul>
  );
}

function Panel({ rows, nowMs, empty }: { rows: readonly Row[]; nowMs: number; empty: string }) {
  if (rows.length === 0) return <p className={`empty ${s.tabEmpty}`}>{empty}</p>;
  const waiting = rows.filter((r) => r.stage === "waiting");
  const rest = rows.filter((r) => r.stage !== "waiting");
  return (
    <>
      {waiting.map((r) => (
        <Featured key={r.item.orderNo} row={r} nowMs={nowMs} />
      ))}
      <RowList rows={rest} />
    </>
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
        <p className="ph-desc">내가 팔로우한 크리에이터가 나에게 보낸 선물이에요.</p>
      </header>
      {rows.length === 0 ? (
        <div className={s.epanel}>
          <img src="/images/home/creator-cat.webp" alt="" aria-hidden="true" width={160} height={160} />
          <p>
            아직 받은 선물이 없어요.
            <br />
            크리에이터가 선물을 보내면 여기에 나와요.
          </p>
        </div>
      ) : (
        <RevgiftTabs
          tabs={[
            { id: "ongoing", label: `받는 중 ${ongoing.length}`, panel: <Panel rows={ongoing} nowMs={nowMs} empty="지금 받는 중인 선물이 없어요." /> },
            {
              id: "past",
              label: `완료 ${past.length}`,
              panel: (
                <>
                  <Panel rows={past} nowMs={nowMs} empty="아직 완료된 선물이 없어요." />
                  <p className={`t-meta ${s["past-note"]}`}>받지 않은 선물의 상자는 크리에이터에게 돌아가요. 크리에이터에게는 받지 않은 이유를 알리지 않아요.</p>
                </>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
