"use client";

import { postCreatorCancel } from "../api/post-creator-cancel-client";
import { OrderCancelForm } from "./order-cancel-form";

// 대표의 크리에이터 사정 취소 (payment INV-M21, 용어집 3절 운영자 열). 크리에이터가 1:1 문의로 탈퇴 등을 요청해 더 받을 수 없게 된 출고 전 주문을 취소한다.
// 사유 1~200자 필수. 대표 판정·출고 전 확인·기록은 DB 가 최종으로 한다.
export function CreatorCancelForm() {
  return (
    <OrderCancelForm
      fieldId="creator-cancel"
      title="크리에이터 사정 취소"
      hint="1:1 문의로 크리에이터가 더 받을 수 없다고 한 선물을 취소해요. 출고 전 선물만 취소돼요."
      openLabel="크리에이터 사정 취소하기"
      reasonPlaceholder="예: 1:1 문의로 탈퇴 요청"
      submitLabel="크리에이터 사정으로 취소"
      doneText={(no) => `${no} 선물을 취소했어요.`}
      send={postCreatorCancel}
    />
  );
}
