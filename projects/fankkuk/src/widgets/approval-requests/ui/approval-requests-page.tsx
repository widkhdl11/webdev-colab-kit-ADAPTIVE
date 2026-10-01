import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import { ApprovalRequestList } from "@/features/approval-request/ui/approval-request-list";
import { AppHeader } from "@/shared/ui/app-header";
import s from "@/shared/ui/screen.module.css";

// 크리에이터 — 승인 요청 목록. 한 건씩 보고 승인·거절한다. 전체 승인은 없다.
export function ApprovalRequestsPage({ creatorName, requests }: { creatorName: string; requests: readonly ApprovalRequestView[] }) {
  return (
    <div className={`${s.root} ${s.page}`}>
      <AppHeader />
      <main className={s.main}>
        <p className={s.eyebrow}>{creatorName}님의 승인 요청</p>
        <h1>{requests.length > 0 ? `${requests.length}건이 승인을 기다려요` : "승인 요청"}</h1>
        <p className={s.lead}>한 건씩 확인하고 승인해 주세요. 승인 없이는 저희 시스템이 주소를 열지 않습니다.</p>
        <div className={s.section}>
          <ApprovalRequestList requests={requests} />
        </div>
      </main>
    </div>
  );
}
