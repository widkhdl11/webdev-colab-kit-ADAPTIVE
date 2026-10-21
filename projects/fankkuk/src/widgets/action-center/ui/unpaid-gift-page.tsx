import type { ActionItem } from "@/entities/action-item/model/action-items";
import { GiftTodoBox } from "./gift-todo-box";
import type { FanReturnAddress } from "./return-address-button";

// 결제를 마치지 않은 선물의 상세 (action-center INV-J12·J13, payment INV-M22). 결제 대기 주문은 보낸 선물 읽기(my_gifts)에 없어
// 보낸 선물 상세를 그릴 수 없다 — 지금 할 일 읽기가 그 주문의 「결제 미완료」 줄을 돌려줄 때만 라우트가 이 화면을 연다.
// 칸은 보낸 선물 상세와 같은 「지금 할 일」 칸이고, 줄 밖의 칸(크리에이터 주소 등)은 없다. 결제는 칸의 「결제하기」를 눌러야 시작된다.

type Props = { items: readonly ActionItem[]; creatorName: string; orderNo: string; clientKey: string; now: string; address: FanReturnAddress };

export function UnpaidGiftPage({ items, creatorName, orderNo, clientKey, now, address }: Props) {
  return (
    <>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">{creatorName}님께 보낼 선물</h1>
        </div>
        <p className="ph-desc">{orderNo}</p>
      </header>
      <GiftTodoBox items={items} clientKey={clientKey} now={now} address={address} />
    </>
  );
}
