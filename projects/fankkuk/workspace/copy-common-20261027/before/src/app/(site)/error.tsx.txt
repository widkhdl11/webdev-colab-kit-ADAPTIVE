"use client";

import Link from "next/link";
import { StatusPage } from "@/widgets/status-page/ui/status-page";

// 화면을 그리다 난 오류 — 상단 바도 같은 페이지 안에서 그려지므로 함께 사라진다. 다시 시도와 홈으로만 둔다(용어집 13절).
// 「다시 시도」는 retry — 서버에서 다시 받아 그린다(reset 은 오류 표시만 지워 같은 오류가 되풀이된다, next docs error.md)
export default function SiteError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <StatusPage
      title="화면을 열지 못했어요"
      description="잠시 뒤 다시 시도해 주세요. 계속되면 고객센터로 알려 주세요."
      actions={
        <>
          <button className="btn" type="button" onClick={() => retry()}>
            다시 시도
          </button>
          <Link className="btn btn--line" href="/">
            홈으로
          </Link>
        </>
      }
    />
  );
}
