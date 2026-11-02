"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { previewApprovalCancel, type ApprovalCancelPreview, type ApprovalCancelTarget } from "@/entities/order/model/approval-cancel";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import { sendCancelApproval } from "../api/send-cancel-approval";
import a from "./approval-request.module.css";

// 「승인 취소」 글자 버튼과 확인 창 (approval-cancel INV-AC1·AC2·AC4 · UX 명세 docs/ux/pages/creator-requests.md · 시안 approval-cancel-20261102).
// 승인 내역 줄과 선물 현황 받는 선물 카드가 같은 부품을 쓴다. 버튼을 그릴지는 부르는 쪽이 서버 값 cancelable 로 정한다.
// 창 문구 갈래는 서버가 준 도착한 상자 수·승인 기한으로만 정한다(previewApprovalCancel). 저장할 때는 서버가 다시 판정한다 —
// 창을 연 사이 상자가 도착하면 서버 판정(거절)이 이긴다. 성공하면 창을 닫고 보던 화면 그대로 목록만 새로 읽는다(2026-11-02 사용자 결정).

/** 확인 창 결과 문장(명세 상태표 confirm-before · confirm-expired · confirm-after) */
export function approvalCancelSentence(preview: ApprovalCancelPreview, approvalDeadlineAt: string): string {
  if (preview === "ends_declined") return "팬꾹에 도착한 상자가 있어 취소하면 거절로 끝나고 상자는 팬에게 반송됩니다. 다시 승인할 수 없습니다.";
  if (preview === "back_to_waiting_expired") return "승인 기한이 지나 다시 승인할 수 없습니다. 취소하면 기한 만료로 반려됩니다.";
  return `승인 대기로 돌아갑니다. ${formatMonthDayKo(approvalDeadlineAt)}까지 다시 승인할 수 있습니다.`;
}

export function ApprovalCancelButton({
  target,
  fanNickname,
  itemKind,
  boxCount,
  now,
}: {
  target: ApprovalCancelTarget;
  fanNickname: string;
  itemKind: string;
  boxCount: number;
  /** 라우트가 화면을 그린 서버 시각(ISO) — 기한 지남을 브라우저 시계로 가르지 않는다 */
  now: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ApprovalCancelPreview>("back_to_waiting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) focusRef.current?.focus();
  }, [open, error]);

  function openSheet() {
    // 기한 지남은 서버가 그린 시각으로 가른다(브라우저 시계가 틀려도 같은 문구). 저장 때는 서버가 다시 판정한다
    setPreview(previewApprovalCancel(target, new Date(now)));
    setError(null);
    setOpen(true);
  }

  // 오류 뒤 닫으면 목록을 새로 읽는다(그사이 송장 출력·이미 처리됨 — 명세 cancel-error)
  function close() {
    if (busy) return;
    setOpen(false);
    if (error) router.refresh();
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await sendCancelApproval(target.requestId);
    setBusy(false);
    if (r.kind === "ok") {
      setOpen(false);
      router.refresh();
      return;
    }
    if (r.kind === "login") return router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    setError(r.kind === "refused" ? r.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  return (
    <>
      <button className={`btn btn--text btn--sm ${a["cancel-btn"]}`} type="button" data-cancel-approval="" aria-label={`${fanNickname}님 선물 승인 취소`} onClick={openSheet}>
        {/* 되돌리기 화살표 — lucide rotate-ccw(lucide-static@0.544.0 icons/rotate-ccw.svg) 경로 그대로. 보일지·크기는 .cancel-icon 한 곳에서 */}
        <svg className={a["cancel-icon"]} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        승인 취소
      </button>
      {open ? (
        <BottomSheet open={open} title="승인을 취소할까요?" busy={busy} onClose={close}>
          <div className={d.stack}>
            <div className={d.who}>
              <span className={d.avatar} aria-hidden="true">
                {fanNickname.slice(0, 1)}
              </span>
              <div>
                <b>{fanNickname}님</b>
              </div>
            </div>
            <dl className={d.boxInfo}>
              <div className={d.kv}>
                <dt>선물 종류</dt>
                <dd>{itemKind}</dd>
              </div>
              <div className={d.kv}>
                <dt>상자</dt>
                <dd>{boxCount}개</dd>
              </div>
              <div className={d.kv}>
                <dt>주문번호</dt>
                <dd>{target.orderNo}</dd>
              </div>
            </dl>
            {error ? (
              <>
                <p className={d.error} role="alert">
                  <span className={d.errorMark} aria-hidden="true">
                    !
                  </span>
                  {error}
                </p>
                <div className={d.btns}>
                  <button ref={focusRef} className="btn btn--line" type="button" onClick={close}>
                    닫기
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="t-strong" data-sentence="">
                  {approvalCancelSentence(preview, target.approvalDeadlineAt)}
                </p>
                <div className={`${d.btns} ${d.two}`}>
                  <button className="btn btn--line" type="button" disabled={busy} onClick={close}>
                    닫기
                  </button>
                  <button ref={focusRef} className="btn" type="button" disabled={busy} onClick={() => void cancel()}>
                    {busy ? "취소 중…" : "승인 취소"}
                  </button>
                </div>
              </>
            )}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}
