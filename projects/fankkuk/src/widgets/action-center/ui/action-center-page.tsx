import Link from "next/link";
import type { ReactNode } from "react";
import type { ActionItem } from "@/entities/action-item/model/action-items";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";
import { DifferencePayButton } from "./difference-pay-button";
import { formatDeadline } from "@/shared/lib/format/datetime";
import s from "./action-center.module.css";

// 처리할 일 (action-center INV-J1·J2·J4, design-rules 12절, 시안 v21-addendum3/fan-action-center.html). 본문 틀은 목록형 880 — 라우트가 MyShell(list)로 감싼다.
// 카드는 처리할 일 읽기 한 번의 결과 그대로 — 제목 옆 숫자는 그 줄 수이고 사이드바 숫자와 같은 결과다(J2). 0건이면 빈 상태.
// 카드는 위아래 한 줄씩. 버튼은 새 처리 길을 만들지 않고 기존 처리를 그대로 부른다(J4):
//   추가 결제 = 차액 결제 준비 → 결제창(선물 상세와 같은 길) · 도착이 늦어요 = 「받는 주소 없이 보냈어요」 찾기(그 상자 하나) · 선물 받기 = 기존 받기 화면.
// 처리가 끝나면 다음 읽기에서 카드가 없다 — 카드는 누른 기록이 아니라 원천 상태로 사라진다.

type Props = { items: readonly ActionItem[]; clientKey: string };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function tierName(t: string): string {
  return t in PARCEL_TIER_GUIDE ? PARCEL_TIER_GUIDE[t as keyof typeof PARCEL_TIER_GUIDE].name : t;
}

const ICONS = {
  card: (
    <>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  truck: (
    <>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  gift: (
    <>
      <path d="M12 7v14" />
      <path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
      <path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5" />
      <rect x="3" y="7" width="18" height="4" rx="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 9-5.5 5.5L8 12" />
    </>
  ),
} as const;

function Svg({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

function Due({ at }: { at: string }) {
  return (
    <p>
      <span className={`${s.due} action-due`}>
        <Svg name="clock" />
        {formatDeadline(at)}까지
      </span>
    </p>
  );
}

function Card({ item, icon, title, meta, children }: { item: ActionItem; icon: keyof typeof ICONS; title: string; meta: string; children: ReactNode }) {
  const id = `ac-${item.kind}-${item.orderNo}-${"boxSeq" in item ? item.boxSeq : "r"}`;
  return (
    <section className={`card action-card ${s.card}`} data-kind={item.kind} aria-labelledby={id}>
      <div className={s.top}>
        <span className={s.ico} aria-hidden="true">
          <Svg name={icon} />
        </span>
        <div>
          <h2 id={id}>{title}</h2>
          <p className={`t-meta ${s.meta}`}>{meta}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ActionCard({ item, clientKey }: { item: ActionItem; clientKey: string }) {
  if (item.kind === "difference") {
    const declared = tierName(item.declaredTier);
    const measured = tierName(item.measuredTier);
    return (
      <Card item={item} icon="card" title="추가 결제" meta={`${item.creatorName}님께 보낸 선물 · 상자 ${item.boxSeq}`}>
        <p className={s.why}>
          검수해 보니 실제 크기가 신고한 {declared}보다 커서 {measured} 요금이 필요해요. 차액만 결제하면 바로 이어서 보내 드려요.
        </p>
        <div className={s.payBox}>
          <div className={s.payLine}>
            <span>신고한 크기</span>
            <b>{declared}</b>
          </div>
          <div className={s.payLine}>
            <span>실제 크기</span>
            <b>{measured}</b>
          </div>
          <div className={`${s.payLine} pay-total`}>
            <span>결제할 차액</span>
            <strong>{won(item.amountKrw)}</strong>
          </div>
        </div>
        <Due at={item.dueAt} />
        <DifferencePayButton boxId={item.boxId} orderNo={item.orderNo} amountKrw={item.amountKrw} clientKey={clientKey} />
      </Card>
    );
  }
  if (item.kind === "missing_box") {
    const tier = tierName(item.declaredTier);
    return (
      <Card item={item} icon="truck" title="도착이 늦어요" meta={`${item.creatorName}님께 보낸 선물 · 상자 ${item.boxSeq} (${tier})`}>
        <p className={s.why}>예상한 날짜가 지났는데 아직 도착하지 않았어요.</p>
        <Due at={item.dueAt} />
        <FindMyBox boxes={[{ target: { kind: "box", id: item.boxId }, label: item.boxLabel, name: `${item.boxLabel} · ${tier} 상자` }]} />
      </Card>
    );
  }
  return (
    <Card item={item} icon="gift" title="선물 받기" meta={`${item.creatorName}님이 보낸 선물`}>
      <Due at={item.dueAt} />
      <Link className={`btn ${s.go}`} href={`/me/revgifts/${item.orderNo}`} aria-label={`${item.creatorName}님이 보낸 선물 받기`}>
        받기
      </Link>
    </Card>
  );
}

export function ActionCenterPage({ items, clientKey }: Props) {
  return (
    <>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            처리할 일{items.length > 0 ? <span className="ph-count">{items.length}</span> : null}
          </h1>
        </div>
        <p className="ph-desc">끝내면 여기서 사라져요.</p>
      </header>
      {items.length > 0 ? (
        <div className="stack">
          {items.map((it) => (
            <ActionCard key={`${it.kind}-${it.orderNo}-${"boxId" in it ? it.boxId : ""}`} item={it} clientKey={clientKey} />
          ))}
        </div>
      ) : (
        <section className={`card ${s.empty}`} aria-labelledby="ac-empty" data-testid="action-empty">
          <span className={s.emptyIco} aria-hidden="true">
            <Svg name="check" />
          </span>
          <h2 id="ac-empty">지금 처리할 일이 없어요</h2>
          <p>처리할 일이 생기면 여기에 알려 드릴게요.</p>
          <Link className="btn btn--line" href="/gifts">
            보낸 선물 보기
          </Link>
        </section>
      )}
    </>
  );
}
