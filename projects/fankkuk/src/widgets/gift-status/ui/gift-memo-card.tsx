import type { GiftMemo } from "@/entities/order/model/gift-memo";
import s from "./gift-status.module.css";

// 선물 상세의 「나만 보는 메모」(together INV-F7) — 시안 docs/design/mockups/site/v21-addendum3/fan-gift-status.html 의 gift-head 카드.
// 선물 이름은 위 큰 글자, 내용은 자물쇠 표시와 「나만 보는 메모」 아래 연한 면에 줄바꿈 그대로. 한쪽만 있으면 그쪽만 그린다.
// 메모는 my_gift_memo 가 보낸 사람 본인에게만 준다 — 이 칸은 받은 값을 그릴 뿐이다.

function Lock() {
  return (
    <svg className={s["memo-lock"]} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function GiftMemoCard({ memo }: { memo: GiftMemo }) {
  return (
    <section className={`card ${s["memo-card"]}`} aria-labelledby={memo.title !== null ? "gift-memo-title" : "gift-memo-label"}>
      {memo.title !== null ? (
        <div>
          <p className="t-meta">선물 이름</p>
          <h2 className={s["memo-title"]} id="gift-memo-title">
            {memo.title}
          </h2>
        </div>
      ) : null}
      {memo.body !== null ? (
        <div className={s.memo}>
          <p className={s["memo-lab"]} id="gift-memo-label">
            <Lock />
            나만 보는 메모
          </p>
          <p className={s["memo-body"]}>{memo.body}</p>
        </div>
      ) : null}
    </section>
  );
}
