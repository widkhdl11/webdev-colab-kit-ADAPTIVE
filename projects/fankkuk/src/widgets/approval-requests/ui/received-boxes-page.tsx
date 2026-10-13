import Link from "next/link";
import type { ReceivedBox } from "@/entities/gift-reply/api/gift-reply-reads";
import { ReceivedBoxList } from "@/features/gift-reply/ui/received-box-list";
import s from "./approval-requests.module.css";

// 크리에이터 — 받은 선물(출고된 상자마다 받았어요·답장, gift-reply). v18 시안 creator-boxes.html 대로 승인 요청 화면에서 나눴다.
// 읽기·동작은 나누기 전 「받은 선물」 탭과 같다 — 같은 목록(ReceivedBoxList)에 같은 값을 넘긴다. 아직 답장 안 한 수는 본인에게만(INV-G10).
export function ReceivedBoxesPage({ received, replyPending }: { received: readonly ReceivedBox[]; replyPending: number }) {
  return (
    <div className={s.root}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            받은 선물<span className="ph-count">{received.length}</span>
          </h1>
          <Link className="btn btn--sm" href="/creator/requests">
            승인 요청 보기
          </Link>
        </div>
        <p className="ph-desc">팬이 보낸 선물을 받을지 정하고, 받은 선물에 답장을 남기는 곳이에요.</p>
      </header>
      <ReceivedBoxList boxes={received} pending={replyPending} />
    </div>
  );
}
