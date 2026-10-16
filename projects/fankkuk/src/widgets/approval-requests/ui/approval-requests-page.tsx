import type { DecidedRequestView } from "@/entities/order/model/decided-request";
import { DecidedRequestList } from "@/features/approval-request/ui/decided-request-list";

// 크리에이터 — 승인 내역(승인·받지 않기를 마친 요청). 시안: docs/design/mockups/site/v18/creator-requests.html 의 「처리한 요청」 구간.
// 2026-10-16 크리에이터 처리할 일(action-center INV-J5·J6, design-rules 13절)로 「승인 대기」 메뉴와 이 화면의 대기 구간·「확인할 선물」 탭은 없어졌다 —
// 대기 중인 승인 요청과 확인 대기 상자는 처리할 일에서 창으로 처리한다(따로 세는 숫자가 없다). 사이드바 「승인 내역」은 #done 으로 온다.
// 받은 선물(상자·받았어요·답장)은 /creator/boxes. 헤더·푸터는 라우트(app)가 붙인다 — 위젯끼리는 서로 import 하지 않는다(FSD).
export function ApprovalRequestsPage({ decided }: { decided: readonly DecidedRequestView[] }) {
  return (
    <div>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">승인 내역</h1>
        </div>
      </header>
      <DecidedRequestList decided={decided} />
    </div>
  );
}
