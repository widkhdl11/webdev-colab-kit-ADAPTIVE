import type { ReceivedBox } from "@/entities/gift-reply/api/gift-reply-reads";
import { ReceivedBoxList } from "@/features/gift-reply/ui/received-box-list";

// 크리에이터 — 받은 선물(출고된 상자마다 받았어요·답장, gift-reply). 시안 v37-part2/boxes.html(design-rules 23-3절) — 페이지 설명 문장·제목 줄 「지금 할 일」 버튼은 없앴다.
// 읽기·동작은 그대로 — 같은 목록(ReceivedBoxList)에 같은 값을 넘긴다. 아직 답장 안 한 수는 본인에게만(INV-G10).
export function ReceivedBoxesPage({ received, replyPending }: { received: readonly ReceivedBox[]; replyPending: number }) {
  return (
    <div className="v34">
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            받은 선물<span className="ph-count">{received.length}</span>
          </h1>
        </div>
      </header>
      <ReceivedBoxList boxes={received} pending={replyPending} />
    </div>
  );
}
