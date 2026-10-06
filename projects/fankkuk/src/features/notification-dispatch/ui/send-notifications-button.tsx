"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/shared/ui/admin.module.css";
import { postDispatch, type DispatchCountsView } from "../api/post-dispatch-client";

// 「알림 지금 보내기」 (notifications INV-N5). 발송 대기 줄을 지금 보낸다 — 무엇을 누구에게 보낼지는 줄이 이미 정했다.
// 정해진 시각마다 부르는 장치가 생기기 전까지 운영자가 누른다. 누르는 중에는 다시 누를 수 없다.

function summary(c: DispatchCountsView): string {
  const parts = [`보냄 ${c.sent}건`, `건너뜀 ${c.skipped}건`];
  if (c.retrying) parts.push(`다시 보낼 예정 ${c.retrying}건`);
  if (c.failed) parts.push(`실패 ${c.failed}건`);
  if (c.unfinished) parts.push(`결과 확인 중 ${c.unfinished}건(10분 뒤 다시 정리)`);
  return parts.join(" · ");
}

export function SendNotificationsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const outcome = await postDispatch();
    setBusy(false);
    setMessage(outcome.kind === "ok" ? { ok: true, text: summary(outcome.counts) } : { ok: false, text: outcome.message });
    // 보내지 못한 알림 목록을 새로 읽는다
    router.refresh();
  }

  return (
    <div>
      <button type="button" className={`${a.btn} ${a.btnSm}`} onClick={send} aria-disabled={busy} aria-busy={busy}>
        {busy ? "보내는 중…" : "알림 지금 보내기"}
      </button>
      <div role="status" style={{ marginTop: 8 }}>
        {busy && <p className={a.hint}>알림을 보내는 중이에요.</p>}
        {message &&
          (message.ok ? (
            <p className={a.hint}>{message.text}</p>
          ) : (
            <p className={a.errorLine}>
              <span className={a.errorMark} aria-hidden="true">
                !
              </span>
              {message.text}
            </p>
          ))}
      </div>
    </div>
  );
}
