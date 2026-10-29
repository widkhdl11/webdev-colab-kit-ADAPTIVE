"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { daysLeftOf, type BluetoothItem, type CreatorCheckChoice } from "@/entities/action-item/model/creator-action-items";
import { priorHistoryLabel } from "@/entities/order/model/prior-history";
import { tierName } from "@/entities/parcel/model/size-tier";
import { detectedSignalText, isCreatorCheckDeadlinePassed } from "@/entities/parcel/model/creator-check";
import { formatDeadline, formatMonthDayKo } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import c from "./creator-check.module.css";
import { sendCheckChoice } from "../api/send-check-choice";

// 탐지기 반응 물품 확인 창 (office-workflow INV-W13, action-center INV-J8 · 시안 v21-addendum3/cre-action-center-c.html 의 dlg-c).
// 「받기」·「거절」은 고르기만 한다 — 상자는 팬꾹이 처리 버튼을 누를 때(또는 기한에) 움직이고, 그 전까지는 취소할 수 있다.
// 서버에 저장된 뒤에만 단계를 바꾼다. 고른 상자를 다시 열면 고른 쪽과 취소가 먼저 보인다. 칸은 처리할 일 읽기가 준 것뿐이다(INV-J7).

type Step = "ask" | "chosen" | "picked";

export const choiceText = (c: CreatorCheckChoice) => (c === "accept" ? "받기 선택" : "받지 않기 선택");
export const signalThing = (it: Pick<BluetoothItem, "bluetooth" | "rf">) => `${detectedSignalText(it)} 기기`;

export function boxPlace(it: Pick<BluetoothItem, "boxCount" | "boxSeq">): string {
  return it.boxCount > 1 ? `상자 ${it.boxCount}개 중 ${it.boxSeq}번` : `상자 ${it.boxCount}개`;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
      <path d="m16 9-5.5 5.5L8 12" />
    </svg>
  );
}

export function BluetoothWindow({ item, now, open, onClose }: { item: BluetoothItem; now: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(item.choice ? "picked" : "ask");
  const [chosen, setChosen] = useState<CreatorCheckChoice | null>(item.choice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<HTMLButtonElement>(null);
  // 창을 열 때마다 서버가 준 선택에서 시작한다
  useEffect(() => {
    if (!open) return;
    setStep(item.choice ? "picked" : "ask");
    setChosen(item.choice);
    setError(null);
  }, [open, item.choice]);
  useEffect(() => {
    if (open) focusRef.current?.focus();
  }, [open, step]);

  const lapsed = isCreatorCheckDeadlinePassed(item.dueAt, now);
  const left = daysLeftOf(item.dueAt, now);

  async function send(write: { action: "choose"; choice: CreatorCheckChoice } | { action: "cancel" }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await sendCheckChoice({ ...write, orderNo: item.orderNo, boxSeq: item.boxSeq });
    setBusy(false);
    if (r.kind === "ok") {
      if (write.action === "choose") {
        setChosen(write.choice);
        setStep("chosen");
      } else {
        setChosen(null);
        setStep("ask");
      }
      router.refresh(); // 줄의 「받기 선택」·「취소」를 새로 읽는다 — 줄은 운영자가 처리해야 빠진다(INV-J8)
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    setError(r.kind === "refused" ? r.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    router.refresh();
  }

  return (
    <BottomSheet open={open} title="탐지기 반응 물품 확인" meta={`${item.itemKind} · ${boxPlace(item)}`} busy={busy} onClose={onClose}>
      <div className={d.stack}>
        <div className={d.who}>
          <span className={d.avatar} aria-hidden="true">
            {item.nickname.slice(0, 1)}
          </span>
          <div>
            <b>{item.nickname}님</b>
            <span className="t-meta">{priorHistoryLabel(item.priorHistory)}</span>
          </div>
        </div>
        <dl className={d.boxInfo}>
          <div className={d.kv}>
            <dt>선물 종류</dt>
            <dd>{item.itemKind}</dd>
          </div>
          <div className={d.kv}>
            <dt>상자</dt>
            <dd>
              {item.boxCount > 1 ? `${item.boxCount}개 중 ${item.boxSeq}번` : `${item.boxCount}개`} · {tierName(item.tier)}
            </dd>
          </div>
          <div className={d.kv}>
            <dt>등록일</dt>
            <dd>{formatMonthDayKo(item.sentAt)}</dd>
          </div>
          {item.receivedAt ? (
            <div className={d.kv}>
              <dt>팬꾹 도착일</dt>
              <dd>{formatMonthDayKo(item.receivedAt)}</dd>
            </div>
          ) : null}
        </dl>
        <dl className={d.boxInfo}>
          <div className={d.kv}>
            <dt>발견 물품</dt>
            <dd>{signalThing(item)}</dd>
          </div>
          <div className={d.kv}>
            <dt>검수 결과</dt>
            <dd>추적 장치 아님</dd>
          </div>
          <div className={d.kv}>
            <dt>기한</dt>
            <dd>
              {formatDeadline(item.dueAt)} · {left.text}
            </dd>
          </div>
        </dl>

        {error ? (
          <p className={d.error} role="alert">
            <span className={d.errorMark} aria-hidden="true">
              !
            </span>
            {error}
          </p>
        ) : null}

        {lapsed ? null : step === "ask" ? (
          <div className={`${d.btns} ${d.two}`}>
            <button className="btn btn--line" type="button" disabled={busy} onClick={() => void send({ action: "choose", choice: "return" })}>
              받지 않기
            </button>
            <button ref={focusRef} className="btn" type="button" disabled={busy} onClick={() => void send({ action: "choose", choice: "accept" })}>
              받기
            </button>
          </div>
        ) : chosen ? (
          <div className={d.stack} role="status">
            <p className={d.done}>
              <CheckIcon />
              {choiceText(chosen)}
            </p>
            {step === "chosen" ? <p className={d.note}>팬꾹이 처리하기 전까지 선택을 취소할 수 있습니다.</p> : null}
            <div className={`${d.btns} ${d.two}`}>
              <button className="btn btn--line" type="button" disabled={busy} onClick={() => void send({ action: "cancel" })}>
                선택 취소
              </button>
              <button ref={focusRef} className="btn" type="button" onClick={onClose}>
                확인
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/** 줄의 「취소」 링크 — 고른 것을 고르기 전으로 돌린다(INV-W13). 운영자가 처리했거나 기한이 지났으면 서버가 거부하고 줄을 다시 읽는다 */
export function CancelChoiceButton({ item, label }: { item: Pick<BluetoothItem, "orderNo" | "boxSeq" | "nickname">; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await sendCheckChoice({ action: "cancel", orderNo: item.orderNo, boxSeq: item.boxSeq });
    setBusy(false);
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    if (r.kind !== "ok") setError(r.kind === "refused" ? r.message : "선택을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    router.refresh();
  }
  return (
    <>
      <button className={c.lnk} type="button" disabled={busy} aria-label={`${item.nickname}님 선물 ${label} 취소`} onClick={() => void cancel()}>
        선택 취소
      </button>
      {error ? (
        <span className="t-meta" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
