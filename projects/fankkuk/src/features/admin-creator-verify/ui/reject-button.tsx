"use client";

import { REJECT_REASON_LABEL, REJECT_REASONS } from "@/entities/creator/model/creator-verification";
import { DecisionDialog } from "./decision-dialog";

// 코드 받음·확인 대기 신청 「반려」 (creator-verification INV-V6·V9, 시안 admin/creators.html 의 반려 버튼).
// 사유는 목록에서 하나(크리에이터에게 보인다), 메모는 운영자끼리만. 반려하면 채널 점유가 풀린다(INV-V8).

type Props = { applicationId: string; creatorName: string; returnFocusId: string; onDone: (text: string) => void };

export function RejectButton({ applicationId, creatorName, returnFocusId, onDone }: Props) {
  return (
    <DecisionDialog
      idBase={`reject-${applicationId}`}
      buttonLabel="반려"
      buttonAriaLabel={`${creatorName} 반려`}
      title="이 신청을 반려할까요?"
      body={
        <p>
          <b>{creatorName}</b>님에게 고른 사유가 보여요. 메모는 보이지 않아요. 반려하면 그 채널을 다른 사람도 신청할 수 있고, 이 신청은 다시 살아나지 않아요.
        </p>
      }
      confirmLabel="반려"
      busyLabel="반려하는 중…"
      reasons={REJECT_REASONS}
      reasonLabels={REJECT_REASON_LABEL}
      memoLabel="메모 (운영자만 봐요, 적지 않아도 돼요)"
      memoPlaceholder="예: 설명란·최신 게시물 모두 코드 없음"
      decision={(reasonCode, memo) => ({ action: "reject", applicationId, reasonCode: reasonCode ?? "other", memo })}
      doneText={`${creatorName}님의 신청을 반려했어요.`}
      returnFocusId={returnFocusId}
      onDone={onDone}
    />
  );
}
