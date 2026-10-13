import type { ReceivedBox } from "@/entities/gift-reply/api/gift-reply-reads";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import type { DecidedRequestView } from "@/entities/order/model/decided-request";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import type { CreatorCheckView } from "@/entities/parcel/model/creator-check";
import { ApprovalRequestList } from "@/features/approval-request/ui/approval-request-list";
import { CreatorCheckList } from "@/features/creator-check/ui/creator-check-list";
import { ReceivedBoxList } from "@/features/gift-reply/ui/received-box-list";
import { CreatorGiftTabs } from "./creator-gift-tabs";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./approval-requests.module.css";

// 크리에이터 — 승인·받은 선물. 탭: 승인 요청(한 건씩 보고 승인·거절, 전체 승인은 없다) · 확인할 선물(추적기 아님 블루투스·RF 상자를 받을지 —
// 답을 기다리는 상자가 있거나 그 탭으로 들어왔을 때만, 2026-10-12 (2) D3 ②) · 받은 선물(출고된 상자마다 받았어요·답장, gift-reply).
// 시안: docs/design/mockups/site/v11/creator-requests.html(승인 요청) · creator-boxes.html(받은 선물). 바깥 탭(승인 요청·확인할 선물·받은 선물)은
// 시안에도 있다 — 주소(?tab=)로 고르는 동작과 확인할 선물 탭의 기억(INV-W4)은 그대로 둔다. 시안이 없앤 「안쪽 탭」은 승인 요청 목록 안의 대기/처리 구분이다.
// 헤더·푸터는 라우트(app)가 붙인다 — 위젯끼리는 서로 import 하지 않는다(FSD).
export function ApprovalRequestsPage({
  requests,
  decided,
  now,
  received,
  replyPending,
  checks = [],
  initialTab = "requests",
}: {
  requests: readonly ApprovalRequestView[];
  decided: readonly DecidedRequestView[];
  /** 남은 기간을 세는 기준 시각 — 화면을 그리는 서버가 넘긴다 */
  now: string;
  /** 출고된 상자(본인 것만, my_received_boxes) */
  received: readonly ReceivedBox[];
  /** 아직 답장 안 한 선물 수(본인 것만, INV-G10) */
  replyPending: number;
  /** 답을 기다리는 확인할 선물(본인 것만, my_creator_checks) */
  checks?: readonly CreatorCheckView[];
  initialTab?: "requests" | "checks" | "received";
}) {
  const showChecks = checks.length > 0 || initialTab === "checks";
  return (
    <>
      <div className="page-head">
        <h2 className="t-title">승인·받은 선물</h2>
        <p className="t-lead t-desc">팬이 보낸 선물을 받을지 정하고, 받은 선물에 답장을 남기는 곳이에요.</p>
      </div>

      <CreatorGiftTabs
        initial={initialTab}
        tabs={[
          {
            id: "requests",
            label: "승인 요청",
            count: requests.length,
            panel: (
              <>
                <section className="card card--soft" aria-labelledby="rule-h">
                  <img className={s.ico} src="/img/icon-approve.png" alt="" aria-hidden="true" width={56} height={56} />
                  <h3 className="t-card" id="rule-h">
                    선물은 한 건씩, 카카오톡으로 승인해요.
                  </h3>
                  <p>
                    {PROMISE.address} {APPROVAL_DEADLINE_DAYS}일 안에 정하지 않으면 자동으로 받지 않음 처리돼요.
                  </p>
                </section>
                <ApprovalRequestList requests={requests} decided={decided} now={now} />
              </>
            ),
          },
          ...(showChecks
            ? [{ id: "checks" as const, label: "확인할 선물", count: checks.length, panel: <CreatorCheckList checks={checks} now={now} /> }]
            : []),
          { id: "received", label: "받은 선물", count: received.length, panel: <ReceivedBoxList boxes={received} pending={replyPending} /> },
        ]}
      />
    </>
  );
}
