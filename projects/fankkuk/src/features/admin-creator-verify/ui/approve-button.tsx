"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postCreatorVerify } from "../api/post-verify-client";

// 크리에이터 「승인」 버튼 (admin-console INV-K10, 시안 admin/creators.html 의 승인 대기 표).
// 시안처럼 확인 창 없이 바로 승인한다 — 잘못 눌렀으면 「승인 취소」로 되돌릴 수 있고 둘 다 기록이 남는다.
// 두 사람이 동시에 눌러도 DB 가 한 번만 바꾸고 늦은 쪽은 「이미 처리됐어요」를 보고 표가 다시 읽힌다.

type Props = { creatorId: string; creatorName: string; returnFocusId: string; onDone: (text: string) => void };

export function ApproveButton({ creatorId, creatorName, returnFocusId, onDone }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postCreatorVerify({ creatorId, verified: true, reason: "" });
    setBusy(false);
    if (outcome.kind === "ok") {
      onDone(`${creatorName}님을 승인했어요.`);
      document.getElementById(returnFocusId)?.focus();
      router.refresh();
      return;
    }
    if (isStaleFailure(outcome)) {
      // 이 줄은 다시 읽으면 표에서 사라질 수 있다 — 문구는 화면 쪽 알림 칸에 남긴다
      onDone(`${creatorName}: ${outcome.message}`);
      router.refresh();
      return;
    }
    setError(outcome.message);
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm}`} onClick={approve} aria-disabled={busy} aria-label={`${creatorName} 승인`}>
        {busy ? "승인하는 중…" : "승인"}
      </button>
      <span role="status">
        {error && (
          <span className={a.errorLine} style={{ display: "inline-flex", marginLeft: 8 }}>
            <span className={a.errorMark} aria-hidden="true">
              !
            </span>
            {error}
          </span>
        )}
      </span>
    </>
  );
}
