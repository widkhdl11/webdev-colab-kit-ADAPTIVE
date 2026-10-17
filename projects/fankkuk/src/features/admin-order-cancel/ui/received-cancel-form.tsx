"use client";

import { postReceivedGiftCancel } from "../api/post-order-cancel-client";
import { OrderCancelForm } from "./order-cancel-form";

// 대표의 입고 뒤 취소 (payment INV-M17). 환불 금액은 DB 가 도착한 상자의 칸을 빼서 정한다.
export function ReceivedCancelForm() {
  return (
    <OrderCancelForm
      fieldId="received-cancel"
      title="입고 뒤 취소"
      hint="1:1 문의로 받은 입고 뒤 취소예요. 도착한 상자의 검수비·반송 택배비를 뺀 금액이 환불 대기로 올라와요."
      openLabel="입고 뒤 취소하기"
      reasonPlaceholder="예: 1:1 문의로 입고 뒤 취소 요청"
      submitLabel="취소하고 환불 대기로"
      doneText={(no) => `${no} 주문을 취소했어요. 환불 대기 줄에서 환불해 주세요.`}
      send={postReceivedGiftCancel}
    />
  );
}
