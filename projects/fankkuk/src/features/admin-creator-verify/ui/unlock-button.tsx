"use client";

import { VERIFICATION_TRIES } from "@/entities/creator/model/creator-verification";
import { DecisionDialog } from "./decision-dialog";

// 신청 횟수 풀기 (creator-verification INV-V15). 1:1 문의를 보고 그 계정·그 채널의 횟수를 다시 센다.
// 누가·언제·어느 계정·어느 채널을 풀었는지와 메모가 지울 수 없게 남는다.

type Props = {
  applicationId: string;
  creatorName: string;
  channelLabel: string;
  usedCount: number;
  returnFocusId: string;
  onDone: (text: string) => void;
};

export function UnlockButton({ applicationId, creatorName, channelLabel, usedCount, returnFocusId, onDone }: Props) {
  return (
    <DecisionDialog
      idBase={`unlock-${applicationId}`}
      buttonLabel="횟수 풀기"
      buttonAriaLabel={`${creatorName} ${channelLabel} 신청 횟수 풀기`}
      title="신청 횟수를 풀까요?"
      body={
        <p>
          <b>{creatorName}</b>님의 <b>{channelLabel}</b> 채널 신청 횟수(지금 {usedCount}번 씀)를 비워서, 이 채널로 다시 {VERIFICATION_TRIES}번까지 신청할 수 있게
          해요. 지난 신청 기록은 그대로 남고, 누가 언제 풀었는지도 남아요.
        </p>
      }
      confirmLabel="횟수 풀기"
      busyLabel="푸는 중…"
      reasons={null}
      reasonLabels={null}
      memoLabel="메모 (운영자만 봐요, 적지 않아도 돼요)"
      memoPlaceholder="예: 1:1 문의로 채널 주인임을 확인"
      decision={(_reason, memo) => ({ action: "unlock", applicationId, memo })}
      doneText={`${creatorName}님의 신청 횟수를 풀었어요.`}
      returnFocusId={returnFocusId}
      onDone={onDone}
    />
  );
}
