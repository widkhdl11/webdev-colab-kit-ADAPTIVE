import Link from "next/link";
import { StatusPage } from "./status-page";

// 탈퇴한 크리에이터의 크리에이터 페이지 (approval-signature INV-S15, UX 명세 docs/ux/pages/handle.md 의 withdrawn, 용어집 7절).
// 탈퇴 때 이름·사진·소개를 지웠고(my-account INV-A15) 선물을 보낼 수 없으므로 제목과 「홈으로」만 둔다.
export const WITHDRAWN_CREATOR_TITLE = "탈퇴한 크리에이터입니다.";

export function WithdrawnCreatorStatus() {
  return (
    <StatusPage
      title={WITHDRAWN_CREATOR_TITLE}
      actions={
        <Link className="btn" href="/">
          홈으로
        </Link>
      }
    />
  );
}
