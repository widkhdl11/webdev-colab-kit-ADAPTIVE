"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { daysLeftOf, type TrackerItem, type TrackerReportChoice } from "@/entities/action-item/model/creator-action-items";
import { priorHistoryLabel } from "@/entities/order/model/prior-history";
import { tierName } from "@/entities/parcel/model/size-tier";
import { isCreatorCheckDeadlinePassed } from "@/entities/parcel/model/creator-check";
import { formatDeadline, formatMonthDayKo } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import { sendCheckChoice } from "../api/send-check-choice";
import { boxPlace } from "./bluetooth-window";

// 추적 장치가 나온 선물 창 (office-workflow INV-W14, action-center INV-J5·J8). 블루투스 발견 창과 같은 장치 — 고르기·취소·운영자 처리·기한이 같고
// 선택지만 「신고하기」「신고하지 않기」다. 고르기만 한다 — 상자는 팬꾹이 처리하거나 기한이 지나야 움직이고, 그 전까지는 취소할 수 있다.
// 글자는 용어집 tracker_hold·report_choice 행(크리에이터 화면): 라벨 「추적 장치 발견」, 문장 「신고할지 정해 주세요」, 버튼 「신고하기」「신고하지 않기」.

type Step = "ask" | "chosen" | "picked";

export const trackerChoiceText = (c: TrackerReportChoice) => (c === "report" ? "신고하기 선택" : "신고하지 않기 선택");

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
      <path d="m16 9-5.5 5.5L8 12" />
    </svg>
  );
}

export function TrackerWindow({ item, now, open, onClose }: { item: TrackerItem; now: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(item.choice ? "picked" : "ask");
  const [chosen, setChosen] = useState<TrackerReportChoice | null>(item.choice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<HTMLButtonElement>(null);
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

  async function send(write: { action: "choose"; choice: TrackerReportChoice } | { action: "cancel" }) {
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
      router.refresh();
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    setError(r.kind === "refused" ? r.message : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    router.refresh();
  }

  return (
    <BottomSheet open={open} title="추적 장치 발견" meta={`${item.itemKind} · ${boxPlace(item)}`} busy={busy} onClose={onClose}>
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
            <dt>보낸 날</dt>
            <dd>{formatMonthDayKo(item.sentAt)}</dd>
          </div>
          {item.receivedAt ? (
            <div className={d.kv}>
              <dt>사무실 도착</dt>
              <dd>{formatMonthDayKo(item.receivedAt)}</dd>
            </div>
          ) : null}
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
          <>
            <p className={d.q}>신고할지 정해 주세요</p>
            <div className={`${d.btns} ${d.two}`}>
              <button className="btn btn--line" type="button" disabled={busy} onClick={() => void send({ action: "choose", choice: "no_report" })}>
                신고하지 않기
              </button>
              <button ref={focusRef} className="btn" type="button" disabled={busy} onClick={() => void send({ action: "choose", choice: "report" })}>
                신고하기
              </button>
            </div>
          </>
        ) : chosen ? (
          <div className={d.stack} role="status">
            <p className={d.done}>
              <CheckIcon />
              {trackerChoiceText(chosen)}
            </p>
            {step === "chosen" ? <p className={d.note}>팬꾹이 처리하기 전까지 취소할 수 있어요.</p> : null}
            <div className={`${d.btns} ${d.two}`}>
              <button className="btn btn--line" type="button" disabled={busy} onClick={() => void send({ action: "cancel" })}>
                취소
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
