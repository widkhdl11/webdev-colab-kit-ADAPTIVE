"use client";

import { useState } from "react";
import { postJson } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";

// 「알림 지금 보내기」 (notifications INV-N5). 발송 대기 줄을 지금 보낸다 — 무엇을 누구에게 보낼지는 줄이 이미 정했다.
// 정해진 시각마다 부르는 장치가 생기기 전까지 운영자가 누른다. 누르는 중에는 다시 누를 수 없다.

const FAILED = "알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요.";

type Counts = { sent: number; skipped: number; retrying: number; failed: number };

function summary(c: Counts): string {
  const parts = [`보냄 ${c.sent}건`, `건너뜀 ${c.skipped}건`];
  if (c.retrying) parts.push(`다시 보낼 예정 ${c.retrying}건`);
  if (c.failed) parts.push(`실패 ${c.failed}건`);
  return parts.join(" · ");
}

function readCounts(body: Record<string, unknown>): Counts | null {
  const c = body.counts as Partial<Counts> | undefined;
  if (!c || [c.sent, c.skipped, c.retrying, c.failed].some((n) => typeof n !== "number")) return null;
  return c as Counts;
}

export function SendNotificationsButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const outcome = await postJson("/api/admin/work/notifications", {}, FAILED);
    setBusy(false);
    if (outcome.kind === "failed") {
      setMessage({ ok: false, text: outcome.message });
      return;
    }
    const counts = readCounts(outcome.body);
    setMessage(counts ? { ok: true, text: summary(counts) } : { ok: false, text: FAILED });
  }

  return (
    <div>
      <button type="button" className={`${a.btn} ${a.btnSm}`} onClick={send} aria-disabled={busy}>
        {busy ? "보내는 중…" : "알림 지금 보내기"}
      </button>
      <div role="status">
        {message &&
          (message.ok ? (
            <p className={a.hint} style={{ marginTop: 8 }}>
              {message.text}
            </p>
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
