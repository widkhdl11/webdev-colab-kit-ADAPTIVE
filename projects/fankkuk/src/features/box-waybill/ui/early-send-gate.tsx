"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { postEarlySend } from "../api/post-waybill-client";
import s from "./box-waybill.module.css";

// 「먼저 보내기」 (approval-signature INV-S9, 2026-10-08 사용자 지시). 크리에이터가 아직 승인하지 않은 주문에서
// 받는 주소 대신 그린다. 누르면 DB 가 누른 시각을 남기고, 새로고침된 화면에서 받는 주소 6자리가 나온다.
// 받는 주소를 감추는 판정은 DB 가 한다 — 이 칸은 안내와 버튼뿐이다.

/** focusAfterId: 누른 뒤 이 칸이 사라지면 포커스를 옮길, 새로고침 뒤에도 남는 요소(tabIndex -1)의 id */
type Props = { orderNo: string; creatorName: string; focusAfterId: string };

export function EarlySendGate({ orderNo, creatorName, focusAfterId }: Props) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postEarlySend(orderNo);
    setBusy(false);
    if (outcome.kind === "ok") {
      // 버튼이 사라져도 키보드·화면낭독기 위치가 페이지 맨 앞으로 떨어지지 않게
      document.getElementById(focusAfterId)?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh();
  }

  return (
    <div className={s.early} role="group" aria-labelledby={`${id}-q`}>
      <p id={`${id}-q`}>
        <strong>{creatorName}님이 아직 승인하지 않았어요.</strong>
      </p>
      <p>선물을 미리 보내면 배송 기간을 줄일 수 있지만, 크리에이터가 거절하면 다시 반송될 수 있어요. 그래도 먼저 보내시겠어요?</p>
      <p className="hint">거절돼 반송되면 반송 택배비를 뺀 금액을 돌려드려요. 승인을 기다렸다가 보내셔도 돼요 — 승인되면 팬꾹 주소가 바로 보여요.</p>
      <div className={s["early-row"]}>
        <button type="button" className="btn btn--sm" aria-disabled={busy} onClick={() => void send()}>
          {busy ? "여는 중…" : "먼저 보내기"}
        </button>
      </div>
      {error ? (
        <p className={s.error} role="alert">
          <span className={s["error-mark"]} aria-hidden="true">
            !
          </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
