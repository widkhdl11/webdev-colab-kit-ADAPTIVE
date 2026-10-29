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
        <strong>{creatorName}님의 승인 대기 중입니다.</strong>
      </p>
      {/* 문단 대신 짧은 줄 셋(design-rules 33절, 사용자 「주절주절 설명하지 말고」 — 시안 v41 detail-after ?state=before) */}
      <ul className={s.pts}>
        <li>승인 전에도 팬꾹으로 선물을 발송할 수 있습니다. 크리에이터가 거절하면 반송됩니다.</li>
        <li>반송 시 반송 배송비를 차감해 환불합니다.</li>
        <li>승인을 기다린 뒤 발송해도 됩니다. 승인되면 팬꾹 주소가 표시됩니다.</li>
      </ul>
      <div className={s["early-row"]}>
        <button type="button" className="btn btn--sm" aria-disabled={busy} onClick={() => void send()}>
          {busy ? "불러오는 중…" : "먼저 보내기"}
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
