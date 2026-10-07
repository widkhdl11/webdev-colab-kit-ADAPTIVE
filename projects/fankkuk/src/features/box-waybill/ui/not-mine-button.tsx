"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { postNotMine, type WaybillTarget } from "../api/post-waybill-client";
import s from "./box-waybill.module.css";

// 제가 보낸 게 아니에요 (inbound-address-code INV-C8). 입고된 뒤 출고 확정 전에만 부르는 쪽이 그린다.
// 누르기 전에 한 번 묻는다 — 누르면 그 상자는 출고를 멈추고 운영자가 확인하며, 누른 기록은 지울 수 없다.
// 누구 상자인지·출고 전인지는 DB 가 로그인 토큰으로 다시 판정한다.

type Props = { target: WaybillTarget; boxName: string; reported: boolean };

export function NotMineButton({ target, boxName, reported }: Props) {
  const id = useId();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(reported);
  // 방금 알린 경우에만 결과 문단으로 커서를 옮긴다(처음부터 알린 상태로 그려질 때는 옮기지 않는다)
  const [justDone, setJustDone] = useState(false);
  const askRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (justDone) statusRef.current?.focus();
  }, [justDone]);

  if (done) {
    return (
      <p ref={statusRef} tabIndex={-1} className={`hint ${s.notmine}`} role="status">
        「제가 보낸 게 아니에요」를 알려 주셨어요. 이 상자는 출고를 멈추고 팬꾹이 확인하고 있어요.
      </p>
    );
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postNotMine(target);
    setBusy(false);
    if (outcome.kind === "ok") {
      setDone(true);
      setJustDone(true);
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh();
  }

  return (
    <div className={s.notmine}>
      {!asking ? (
        <button
          ref={triggerRef}
          type="button"
          className="btn btn--text btn--sm"
          aria-label={`${boxName} 제가 보낸 게 아니에요`}
          onClick={() => {
            setAsking(true);
            requestAnimationFrame(() => askRef.current?.focus());
          }}
        >
          제가 보낸 게 아니에요
        </button>
      ) : (
        <div ref={askRef} tabIndex={-1} className={s["notmine-ask"]} role="group" aria-labelledby={`${id}-q`}>
          <p id={`${id}-q`}>
            <strong>이 상자를 보낸 적이 없나요?</strong> 알려 주시면 이 상자는 출고를 멈추고 팬꾹이 확인해요. 알린 기록은 되돌릴 수 없어요.
          </p>
          <div className={s["notmine-row"]}>
            <button type="button" className="btn btn--sm" aria-disabled={busy} onClick={() => void confirm()}>
              {busy ? "알리는 중…" : "네, 제가 보낸 게 아니에요"}
            </button>
            <button type="button" className="btn btn--line btn--sm" aria-disabled={busy} onClick={() => {
                setAsking(false);
                setError(null);
                // 묻는 칸이 사라지면 원래 버튼으로 커서를 돌려준다
                requestAnimationFrame(() => triggerRef.current?.focus());
              }}
            >
              취소
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
      )}
    </div>
  );
}
