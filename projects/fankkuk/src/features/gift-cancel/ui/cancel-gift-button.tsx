"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { postGiftCancel } from "../api/post-cancel-client";
import s from "./gift-cancel.module.css";

// 팬의 입고 전 취소 (payment INV-M16). 그릴지는 부르는 쪽이 model/cancellable 로 정한다 — 최종 판정은 DB.
// 누르면 바로 취소하지 않고 한 번 묻는다 — 취소는 되돌릴 수 없다. 성공하면 화면을 다시 읽어 취소된 상태로 그린다.
// 정상 경로(주소 복사·보내기)와 같은 버튼 모양이 아니라 글자 링크 모양 — 사용자가 스스로 여는 예외 길이라 눈에 띄지 않게(UX 정돈 시범 B-4). 확인 단계는 그대로.
// addressShown: 받는 주소가 보인 뒤(승인·「먼저 보내기」)면 상자가 이미 오고 있을 수 있어 택배비를 뺀 금액을 먼저 돌려준다(payment INV-M16·M18).

export function CancelGiftButton({ orderNo, addressShown }: { orderNo: string; addressShown: boolean }) {
  const id = useId();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const askRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (done) statusRef.current?.focus();
  }, [done]);

  if (done) {
    return (
      <p ref={statusRef} tabIndex={-1} className={`hint ${s.cancel}`} role="status">
        선물을 취소했어요. 환불은 팬꾹이 확인한 뒤 진행돼요.
      </p>
    );
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postGiftCancel(orderNo);
    setBusy(false);
    if (outcome.kind === "ok") {
      setDone(true);
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh();
  }

  return (
    <div className={s.cancel}>
      {!asking ? (
        <button
          ref={triggerRef}
          type="button"
          className={s.textlink}
          onClick={() => {
            setAsking(true);
            requestAnimationFrame(() => askRef.current?.focus());
          }}
        >
          취소하기
        </button>
      ) : (
        <div ref={askRef} tabIndex={-1} className={s.ask} role="group" aria-labelledby={`${id}-q`}>
          <p id={`${id}-q`}>
            <strong>이 선물을 취소할까요?</strong>{" "}
            {addressShown
              ? "상자가 이미 오고 있을 수 있어 택배비를 뺀 금액을 먼저 돌려드려요. 도착한 상자는 돌려보내 드리고, 7일 안에 도착하지 않으면 택배비도 돌려드려요."
              : "아직 팬꾹 주소가 보이기 전이라 결제 금액을 모두 돌려드려요."}{" "}
            환불은 팬꾹이 확인한 뒤 진행돼요. 취소는 되돌릴 수 없어요.
          </p>
          <div className={s.row}>
            <button type="button" className="btn btn--sm" aria-disabled={busy} onClick={() => void confirm()}>
              {busy ? "취소하는 중…" : "네, 취소할게요"}
            </button>
            <button
              type="button"
              className="btn btn--line btn--sm"
              aria-disabled={busy}
              onClick={() => {
                // 취소 요청 중에는 칸을 닫지 않는다 — 닫으면 실패 문구가 보일 자리가 없다
                if (busy) return;
                setAsking(false);
                setError(null);
                // 묻는 칸이 사라지면 원래 버튼으로 커서를 돌려준다
                requestAnimationFrame(() => triggerRef.current?.focus());
              }}
            >
              아니요
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
