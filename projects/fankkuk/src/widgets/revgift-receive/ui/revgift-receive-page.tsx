import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { ReceivedRevgift } from "@/entities/revgift/model/revgift-rows";
import { daysLeft, receivedStage } from "@/entities/revgift/model/received-stage";
import { replyDeadlineText, revgiftTierName } from "@/entities/revgift/ui/received-status";
import { ReceiveFlow } from "@/features/revgift-receive/ui/receive-flow";

// 받은 역조공 하나(팬). 시안: docs/design/mockups/site/v4/revgift-receive.html
// 남은 날·기한 문구는 서버에서 한 번 계산해 넘긴다 — 브라우저 시계로 다시 계산하면 첫 화면과 글자가 달라질 수 있다.
export function RevgiftReceivePage({ item, nowMs, sealingKeyPem }: { item: ReceivedRevgift; nowMs: number; sealingKeyPem: string | null }) {
  const tierRule = item.tier === "large" ? "" : PARCEL_TIER_GUIDE[item.tier].rule;
  const stage = receivedStage(item, nowMs);
  return (
    <main id="main">
      <div className="container">
        {/* key: 새로 읽은 상태가 달라지면(이미 정해졌다는 응답 뒤 새로고침) 화면 상태를 처음부터 다시 잡는다 */}
        <ReceiveFlow
          key={stage}
          orderNo={item.orderNo}
          creatorName={item.creatorName}
          tierName={revgiftTierName(item.tier)}
          tierRule={tierRule}
          stage={stage}
          daysLeftText={`${daysLeft(item.deadline, nowMs)}일 남음`}
          deadlineText={replyDeadlineText(item.deadline)}
          sealingKeyPem={sealingKeyPem}
        />
      </div>
    </main>
  );
}
