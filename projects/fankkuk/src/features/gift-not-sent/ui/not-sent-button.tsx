"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendNotSent } from "../api/send-not-sent";

// 「아직 보내지 않음」 버튼 (office-workflow INV-W10 S10f, 용어집 not-sent-yet — 2026-10-22 d113 진단 C-1).
// 기존 기록 처리(/api/gifts/not-sent)를 그대로 부른다 — 그 주문에 누른 시각만 남고 기한은 바뀌지 않는다.
// 끝나면 다시 읽는다 — 지금 할 일의 「도착이 늦어요」 줄은 누른 기록이 있는 주문에서 빠지므로(action-center INV-J1) 칸이 원천 상태로 사라진다.

const FAILED_TEXT = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";

export function NotSentButton({ orderNo, className = "btn btn--line" }: { orderNo: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await sendNotSent({ orderNo });
    setBusy(false);
    if (r.kind === "ok") {
      router.refresh();
      return;
    }
    if (r.kind === "login") {
      router.push(`/login?next=${encodeURIComponent(`/gifts/${orderNo}`)}`);
      return;
    }
    setError(r.kind === "refused" ? r.message : FAILED_TEXT);
    // 거부면 그 사이 상태가 바뀌었을 수 있다(상자가 도착함·주문이 끝남) — 다시 읽어 칸이 원천 상태를 따르게 한다
    if (r.kind === "refused") router.refresh();
  }

  return (
    <>
      <button className={className} type="button" onClick={() => void send()} aria-disabled={busy} aria-busy={busy || undefined}>
        아직 보내지 않음
      </button>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
