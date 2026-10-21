import { disposeDueText, type ActionItem } from "@/entities/action-item/model/action-items";
import { TodoBox, TodoTask } from "@/entities/action-item/ui/todo-box";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";
import { formatMonthDayKo, seoulDaysUntil } from "@/shared/lib/format/datetime";
import { DifferencePayButton } from "./difference-pay-button";
import { ReturnAddressButton, type FanReturnAddress } from "./return-address-button";

// 보낸 선물 상세 맨 위 「지금 할 일」 칸 (action-center INV-J13, design-rules 21절, 시안 v34-part1/gift-detail.html).
// items 는 라우트가 처리할 일 읽기 결과를 이 주문으로 거른 줄이다 — 비면 칸을 그리지 않는다(상세가 따로 「할 일이 있는가」를 계산하지 않는다).
// 지금 할 일 페이지의 카드에 있던 처리를 이 칸으로 옮겼다. 새 처리 길은 없다 — 기존 처리를 그대로 부른다(INV-J4):
//   추가 결제 = 차액 결제 준비 → 결제창 · 도착이 늦어요 = 「받는 주소 없이 보냈어요」 찾기(그 상자 하나) · 돌려받을 주소 확인 = 반송 주소 확인 창.
// 같은 주문의 일이 여럿이면 모두 칸 안에 줄로 쌓는다. 역조공 받기는 받은 역조공 상세가 칸을 그린다(features/revgift-receive).

type Props = { items: readonly ActionItem[]; clientKey: string; now: string; address: FanReturnAddress };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function tierName(t: string): string {
  return t in PARCEL_TIER_GUIDE ? PARCEL_TIER_GUIDE[t as keyof typeof PARCEL_TIER_GUIDE].name : t;
}

/** 「10월 30일까지 · 7일 남음」(시안). 남은 날은 서울 날짜로 세고, 기한 당일(0일)에는 붙이지 않는다 */
function dueLine(at: string, now: string): string {
  const days = seoulDaysUntil(at, now);
  return `${formatMonthDayKo(at)}까지${days > 0 ? ` · ${days}일 남음` : ""}`;
}

function Task({ item, clientKey, now, address }: { item: ActionItem; clientKey: string; now: string; address: FanReturnAddress }) {
  const titleId = `todo-${item.kind}-${"boxSeq" in item ? item.boxSeq : "r"}`;
  if (item.kind === "difference") {
    return (
      <TodoTask
        kind={item.kind}
        titleId={titleId}
        title="추가 결제"
        // 기한은 검수 완료 스캔 뒤에 생긴다(payment INV-M13) — 그 전이면 상자만
        sub={item.dueAt ? `상자 ${item.boxSeq} · ${dueLine(item.dueAt, now)}` : `상자 ${item.boxSeq}`}
        figure={<p className="num-big num-big--32">{won(item.amountKrw)}</p>}
        action={<DifferencePayButton boxId={item.boxId} orderNo={item.orderNo} amountKrw={item.amountKrw} clientKey={clientKey} />}
      />
    );
  }
  if (item.kind === "missing_box") {
    const tier = tierName(item.declaredTier);
    return (
      <TodoTask
        kind={item.kind}
        titleId={titleId}
        title="도착이 늦어요"
        sub={`상자 ${item.boxSeq} (${tier}) · ${dueLine(item.dueAt, now)}`}
        wide
        action={<FindMyBox box={{ target: { kind: "box", id: item.boxId }, label: item.boxLabel, name: `${item.boxLabel} · ${tier} 상자` }} />}
      />
    );
  }
  if (item.kind === "return_address") {
    const meta = `${item.creatorName}님께 보낸 선물 · 상자 ${item.boxSeq}`;
    return (
      <TodoTask
        kind={item.kind}
        titleId={titleId}
        title="돌려받을 주소 확인"
        sub={`상자 ${item.boxSeq} · ${disposeDueText(item.dueAt)}`}
        action={<ReturnAddressButton target={{ orderNo: item.orderNo, boxSeq: item.boxSeq }} meta={meta} address={address} />}
      />
    );
  }
  // 역조공 몫은 RG- 주문번호라 보낸 선물 상세에 오지 않는다
  return null;
}

export function GiftTodoBox({ items, clientKey, now, address }: Props) {
  if (items.length === 0) return null;
  return (
    <TodoBox>
      {items.map((it) => (
        <Task key={`${it.kind}-${"boxId" in it ? it.boxId : it.orderNo}`} item={it} clientKey={clientKey} now={now} address={address} />
      ))}
    </TodoBox>
  );
}
