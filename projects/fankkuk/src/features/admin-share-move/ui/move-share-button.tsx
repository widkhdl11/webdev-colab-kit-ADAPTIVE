"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { TIER_LABEL } from "@/entities/parcel/model/office-labels";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postMoveCandidates, postShareMove } from "../api/post-share-move-client";
import type { MoveCandidate } from "../model/move-share";

// 「다른 팬의 선물로 옮기기」 버튼 + 확인 창 (inbound-address-code INV-C11). 찾기로 입고된 보류 줄(입고 완료)에 부르는 쪽이 그린다.
// 창을 열면 그 상자를 이은 크리에이터의 도착 전 몫을 읽고, 하나를 골라 옮긴다. 옮길 수 있는지(검수 완료 전·찾기로 이은 몫 상자)는 DB 가 본다.
// 처리 중에는 창을 닫을 수 없다(결과를 놓치지 않게). 누가 옮겼는지는 DB 가 운영자 기록에 남긴다.

function isCandidate(v: unknown): v is MoveCandidate {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.shareId === "string" && typeof c.nickname === "string" && typeof c.tier === "string" && typeof c.orderNo === "string";
}

export function MoveShareButton({ id, waybillNo }: { id: string; waybillNo: string | null }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const base = useId();
  const [candidates, setCandidates] = useState<MoveCandidate[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `${base}-title`;
  const name = waybillNo ? `송장 ${waybillNo}` : "이 상자";

  async function openDialog() {
    setCandidates(null);
    setPicked(null);
    setError(null);
    dialog.current?.showModal();
    setBusy(true);
    const outcome = await postMoveCandidates(id);
    setBusy(false);
    if (outcome.kind !== "ok") {
      setError(outcome.message);
      return;
    }
    const rows = Array.isArray(outcome.body.candidates) ? outcome.body.candidates.filter(isCandidate) : [];
    setCandidates(rows);
    if (rows.length === 0) setError("옮길 수 있는 입고 전 팬별 선물이 없어요.");
  }

  async function confirm() {
    if (busy) return;
    if (!picked) {
      setError("옮길 팬별 선물을 골라 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postShareMove(id, picked);
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh();
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} aria-label={`${name} 다른 팬의 선물로 옮기기`} onClick={() => void openDialog()}>
        다른 팬의 선물로 옮기기
      </button>
      <dialog
        ref={dialog}
        className={a.dialog}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className={a.dlgBody}>
          <h2 id={titleId}>다른 팬의 선물로 옮기기</h2>
          <p className={a.mono}>{name}</p>
          {candidates && candidates.length > 0 ? (
            <fieldset className={a.field} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className={a.fieldLabel}>옮길 곳(같은 크리에이터가 보낸, 아직 입고 전인 팬별 선물)</legend>
              {candidates.map((c) => (
                <label key={c.shareId} className={a.check}>
                  <input type="radio" name={`${base}-share`} value={c.shareId} checked={picked === c.shareId} onChange={() => setPicked(c.shareId)} />
                  {c.nickname} · {c.tier in TIER_LABEL ? TIER_LABEL[c.tier as keyof typeof TIER_LABEL] : c.tier} · <span className={a.mono}>{c.orderNo}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <div role="status">
            {error ? (
              <p className={a.errorLine}>
                <span className={a.errorMark} aria-hidden="true">
                  !
                </span>
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <div className={a.dlgFoot}>
          <button type="button" className={`${a.btn} ${a.btnLine}`} onClick={() => !busy && dialog.current?.close()} aria-disabled={busy}>
            닫기
          </button>
          <button type="button" className={`${a.btn} ${a.btnInk}`} onClick={() => void confirm()} aria-disabled={busy}>
            {busy ? "처리하는 중…" : "옮기기"}
          </button>
        </div>
      </dialog>
    </>
  );
}
