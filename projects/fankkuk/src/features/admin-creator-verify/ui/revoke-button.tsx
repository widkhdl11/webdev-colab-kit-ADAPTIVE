"use client";

import { REVOKE_REASON_LABEL, REVOKE_REASONS } from "@/entities/creator/model/creator-verification";
import { DecisionDialog } from "./decision-dialog";

// 크리에이터 「승인 취소」 + 확인 창 (admin-console INV-K10, creator-verification INV-V9·V10, 시안 admin/creators.html 의 cancel 창).
// 사유는 목록에서 하나(크리에이터에게 보인다), 메모는 운영자끼리만. 누가 언제 취소했는지는 DB 가 남긴다.

type Props = { creatorId: string; creatorName: string; returnFocusId: string; onDone: (text: string) => void };

export function RevokeButton({ creatorId, creatorName, returnFocusId, onDone }: Props) {
  return (
    <DecisionDialog
      idBase={`revoke-${creatorId}`}
      buttonLabel="승인 취소"
      buttonAriaLabel={`${creatorName} 승인 취소`}
      title="승인을 취소할까요?"
      body={
        <p>
          <b>{creatorName}</b>님이 팬의 크리에이터 찾기에서 사라지고, 새 선물 등록과 팔로우가 막혀요. 이미 등록된 주문은 그대로 가요. 진행 중인 채널 이사
          신청도 함께 끝나요. 누가 언제 취소했는지 남아요.
        </p>
      }
      confirmLabel="승인 취소"
      busyLabel="취소하는 중…"
      reasons={REVOKE_REASONS}
      reasonLabels={REVOKE_REASON_LABEL}
      memoLabel="메모 (운영자만 봐요, 적지 않아도 돼요)"
      memoPlaceholder="예: 채널이 삭제됨 · 다른 사람에게 넘어갔다는 문의 확인"
      decision={(reasonCode, memo) => ({ action: "revoke", creatorId, reasonCode: reasonCode ?? "other", memo })}
      doneText={`${creatorName}님의 승인을 취소했어요.`}
      returnFocusId={returnFocusId}
      onDone={onDone}
    />
  );
}
