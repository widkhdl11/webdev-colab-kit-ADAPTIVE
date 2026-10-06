import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import type { DecidedRequestView } from "@/entities/order/model/decided-request";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import { ApprovalRequestList } from "@/features/approval-request/ui/approval-request-list";
import s from "./approval-requests.module.css";

// 크리에이터 — 승인 요청. 한 건씩 보고 승인·거절한다. 전체 승인은 없다.
// 시안: docs/design/mockups/site/v4/creator-requests.html
// 헤더·푸터는 라우트(app)가 붙인다 — 위젯끼리는 서로 import 하지 않는다(FSD).
export function ApprovalRequestsPage({
  requests,
  decided,
  now,
}: {
  requests: readonly ApprovalRequestView[];
  decided: readonly DecidedRequestView[];
  /** 남은 기간을 세는 기준 시각 — 화면을 그리는 서버가 넘긴다 */
  now: string;
}) {
  return (
    <div>
      <div className="panel-title">
        <h2 className="panel-h">승인 요청</h2>
        <p>팬이 보낸 선물을 받을지 정하는 곳이에요. {APPROVAL_DEADLINE_DAYS}일 안에 정하지 않으면 자동으로 받지 않음 처리돼요.</p>
      </div>

      <div className={s["rule-line"]}>
        <img className={`asset ${s.ico}`} src="/img/icon-approve.png" alt="" aria-hidden="true" width={56} height={56} />
        <p>
          <strong>승인은 한 건씩, 카카오톡 인증서로 서명해요.</strong>
        </p>
      </div>

      <ApprovalRequestList requests={requests} decided={decided} now={now} />
    </div>
  );
}
