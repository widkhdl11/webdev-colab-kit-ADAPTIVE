"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/shared/ui/admin.module.css";

// 운영자 수동 조회 버튼 (delivery-status INV-DS14). 고른 조회 줄의 지금 상태를 배송 조회 서비스에서 받아 웹훅과 같은 처리로 저장한다.
// 누르는 중에는 다시 누를 수 없다. 결과는 수만 — 송장번호·이력은 오지 않는다.

type Outcome = { ok: true; text: string } | { ok: false; text: string };

async function postTrace(ids: readonly string[]): Promise<Outcome> {
  try {
    const res = await fetch("/api/admin/delivery/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const body: unknown = await res.json().catch(() => null);
    const b = (typeof body === "object" && body !== null ? body : {}) as { saved?: unknown; failed?: unknown; message?: unknown };
    if (!res.ok) return { ok: false, text: typeof b.message === "string" ? b.message : "조회하지 못했어요." };
    const saved = typeof b.saved === "number" ? b.saved : 0;
    const failed = typeof b.failed === "number" ? b.failed : 0;
    return { ok: true, text: failed > 0 ? `${saved}건 받음 · ${failed}건 조회 실패` : `${saved}건 받음` };
  } catch {
    return { ok: false, text: "조회하지 못했어요. 네트워크 연결을 확인해 주세요." };
  }
}

export function TraceButton({ ids, label }: { ids: readonly string[]; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function run() {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setOutcome(null);
    const result = await postTrace(ids);
    setBusy(false);
    setOutcome(result);
    router.refresh();
  }

  return (
    <div>
      <button type="button" className={`${a.btn} ${a.btnSm}`} onClick={run} aria-disabled={busy} aria-busy={busy}>
        {busy ? "조회 중…" : label}
      </button>
      <div role="status">{outcome?.ok && <p className={a.hint}>{outcome.text}</p>}</div>
      <div role="alert">
        {outcome && !outcome.ok && (
          <p className={a.errorLine}>
            <span className={a.errorMark} aria-hidden="true">
              !
            </span>
            {outcome.text}
          </p>
        )}
      </div>
    </div>
  );
}
