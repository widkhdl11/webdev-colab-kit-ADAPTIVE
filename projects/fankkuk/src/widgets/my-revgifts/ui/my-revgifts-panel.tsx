import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { ReceivedRevgift } from "@/entities/revgift/model/revgift-rows";
import { isOngoingStage, receivedStage } from "@/entities/revgift/model/received-stage";
import { receivedStageCopy } from "@/entities/revgift/ui/received-status";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { RevgiftTabs } from "./revgift-tabs";
import s from "./my-revgifts.module.css";

// 내 정보 — 받은 역조공 본문(팬). 시안: docs/design/mockups/site/v4/my-revgifts.html
// 상태는 팬 본인에게는 거절과 기한 지남을 나눠 보여 준다. 행마다 상세(받기 화면)로 간다.

type Row = { item: ReceivedRevgift; copy: ReturnType<typeof receivedStageCopy>; waiting: boolean };

function RowList({ rows }: { rows: readonly Row[] }) {
  if (rows.length === 0) return <p className={s["empty-line"]}>여기에 해당하는 선물이 없어요.</p>;
  return (
    <ul className={s.rows}>
      {rows.map(({ item, copy, waiting }, i) => (
        <li key={item.orderNo} className={s.row}>
          <FaceAvatar index={i} />
          <div>
            <p className={s.who}>{item.creatorName}님이 보낸 선물</p>
            <p className={s.says}>
              {PARCEL_TIER_GUIDE[item.tier].name} 상자 · 주문번호 {item.orderNo}
            </p>
          </div>
          <div className={s.state}>
            <span className={statusTagClass(copy.tone)}>{copy.tag}</span>
            <small className={copy.urgent ? s.urgent : undefined}>{copy.note}</small>
          </div>
          {waiting ? (
            <Link className={`btn btn--sm ${s.go}`} href={`/me/revgifts/${item.orderNo}`} aria-label={`${item.creatorName}님이 보낸 선물 받기`}>
              받기
            </Link>
          ) : (
            <Link className={`link-arrow ${s.go}`} href={`/me/revgifts/${item.orderNo}`} aria-label={`${item.creatorName}님이 보낸 선물 자세히 보기`}>
              자세히 ›
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MyRevgiftsPanel({ items, nowMs }: { items: readonly ReceivedRevgift[]; nowMs: number }) {
  const rows = items.map((item) => {
    const stage = receivedStage(item, nowMs);
    return { item, stage, copy: receivedStageCopy(stage, item.deadline, nowMs), waiting: stage === "waiting" };
  });
  const ongoing = rows.filter((r) => isOngoingStage(r.stage));
  const past = rows.filter((r) => !isOngoingStage(r.stage));
  return (
    <div>
      <div className={s.head}>
        <h2>받은 역조공</h2>
      </div>
      <p className={s.lead}>내가 팔로우한 크리에이터가 나에게 보낸 선물이에요. 받을 때마다 주소를 새로 입력해요.</p>
      {rows.length === 0 ? (
        <p className={s["empty-line"]}>아직 받은 역조공이 없어요. 크리에이터가 선물을 보내면 여기에 나와요.</p>
      ) : (
        <RevgiftTabs
          tabs={[
            { id: "ongoing", label: `진행 중 ${ongoing.length}`, panel: <RowList rows={ongoing} /> },
            {
              id: "past",
              label: `지난 것 ${past.length}`,
              panel: (
                <>
                  <RowList rows={past} />
                  <p className={s["empty-line"]}>받지 않은 선물의 상자는 크리에이터에게 돌아가요. 크리에이터에게는 받지 않은 이유를 알리지 않아요.</p>
                </>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
