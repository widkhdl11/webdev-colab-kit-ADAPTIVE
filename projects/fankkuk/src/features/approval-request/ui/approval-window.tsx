"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import { priorHistoryLabel } from "@/entities/order/model/prior-history";
import { formatDeadline, formatMonthDayTimeKo } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import { PROMISE } from "@/shared/config/site-copy";
import { sendApprove } from "../api/send-approve";
import { sendDecline } from "../api/send-decline";

// 승인 요청 창 (approval-signature INV-S7·S11·S13, decline-block INV-D1, action-center INV-J8 · 시안 v21-addendum3/cre-action-center-c.html 의 dlg-d).
// 처리할 일의 승인 요청 줄이 연다. 새 승인 길을 만들지 않는다 — 승인은 지금처럼 카카오톡 서명 요청(서버 검증을 통과해야 승인), 받지 않기는 서명 없이.
// 단계: 고르기(받지 않기 · 카카오톡으로 승인) → 서명(받는 주소 단계 INV-S13 + 서명 요청) 또는 받지 않기 확인 → 완료(승인 내역으로 가는 링크).
// 주소 칸은 위젯이 주소 기능으로 조립해 넘긴다(기능끼리는 서로 import 하지 않는다 — FSD). 서버에 저장된 뒤에만 완료로 바꾼다.

/** 승인 창의 주소 단계 — 위젯이 넘긴다(INV-S13). */
export type ApprovalAddressStep = {
  /** 받는 주소가 등록돼 있는가 — 서명 단계 머리가 「입력」인지 「확인」인지 가른다 */
  registered: boolean;
  /** 받는 주소가 등록돼 있고 바꾸는 중이 아니다 — 이때만 서명 요청 버튼을 보인다 */
  ready: boolean;
  /** 주소 칸. closeSheet 는 등록 전 입력을 그만둘 때 창을 닫는다 */
  renderStep: (closeSheet: () => void) => ReactNode;
  /** 창을 열 때마다 — 바꾸던 입력을 접는다 */
  onOpen: () => void;
  /** 서버가 「주소 없음」으로 거부했다 — 주소 단계가 등록 전으로 돌아간다 */
  onMissing: () => void;
};

type Step = "ask" | "sign" | "no" | "ok" | "noed";

/** 서명 단계 머리(INV-S13) — 주소가 없으면 입력, 바꾸는 중이면 새 주소, 준비됐으면 확인 */
function addressHead(address: ApprovalAddressStep): string {
  if (!address.registered) return "주소를 입력해 주세요";
  return address.ready ? "주소를 확인해 주세요" : "새 주소를 입력해 주세요";
}

/** 사이드바 「승인 내역」과 같은 자리 — 승인·받지 않기를 마친 요청이 간다 */
export const DECIDED_HREF = "/creator/requests#done";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
      <path d="m16 9-5.5 5.5L8 12" />
    </svg>
  );
}

export function ApprovalWindow({
  request,
  dueAt,
  daysLeftText,
  open,
  onClose,
  address,
}: {
  request: ApprovalRequestView;
  /** 자동 반려 기한(결제 완료 + 168시간) — 처리할 일 읽기가 준 값 */
  dueAt: string;
  daysLeftText: string;
  open: boolean;
  onClose: () => void;
  address: ApprovalAddressStep;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("ask");
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<HTMLButtonElement>(null);
  const signHeadRef = useRef<HTMLParagraphElement>(null);
  const addressHeadRef = useRef<HTMLParagraphElement>(null);
  const wasReady = useRef(address.ready);
  const done = step === "ok" || step === "noed";

  useEffect(() => {
    if (!open) return;
    setStep("ask");
    setBlock(false);
    setError(null);
  }, [open]);
  useEffect(() => {
    if (open) focusRef.current?.focus();
  }, [open, step]);
  // 주소가 없으면(처음부터 없거나 서버가 「주소 없음」으로 돌려보냄) 초점을 주소 단계 머리 「주소를 입력해 주세요」로 — 무엇을 해야 하는지부터 읽히게(INV-S13)
  useEffect(() => {
    if (open && step === "sign" && !address.registered) addressHeadRef.current?.focus();
  }, [open, step, address.registered]);
  // 창 안에서 주소를 저장해 서명 칸이 새로 붙으면 그 머리로 포커스를 옮긴다 — 저장한 폼이 사라져 포커스가 창 밖으로 나가지 않게
  useEffect(() => {
    if (open && step === "sign" && address.ready && !wasReady.current) signHeadRef.current?.focus();
    wasReady.current = address.ready;
  }, [open, step, address.ready]);

  // 완료 뒤 닫으면 목록을 새로 읽는다 — 그 줄은 다음 읽기에서 없다(INV-J8)
  function close() {
    if (busy) return;
    onClose();
    if (done) router.refresh();
  }

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await sendApprove(request.requestId);
    setBusy(false);
    if (r.kind === "ok") return setStep("ok");
    if (r.kind === "login") return router.push("/login");
    if (r.kind === "refused" && r.noAddress) return address.onMissing(); // 창은 그대로 두고 주소 입력으로 돌아간다
    setError(r.kind === "refused" ? r.message : "승인하지 못했어요. 잠시 뒤 다시 해 주세요.");
  }

  async function decline() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await sendDecline(request.requestId, block);
    setBusy(false);
    if (r.kind === "ok") return setStep("noed");
    if (r.kind === "login") return router.push("/login");
    setError(r.kind === "refused" ? r.message : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
  }

  return (
    <BottomSheet open={open} title="승인 요청" meta={`${formatMonthDayTimeKo(request.registeredAt)} 요청`} busy={busy} onClose={close}>
      <div className={d.stack}>
        <div className={d.who}>
          <span className={d.avatar} aria-hidden="true">
            {request.fanNickname.slice(0, 1)}
          </span>
          <div>
            <b>{request.fanNickname}님</b>
            <span className="t-meta">{priorHistoryLabel(request.priorHistory)}</span>
          </div>
        </div>
        <dl className={d.boxInfo}>
          <div className={d.kv}>
            <dt>선물 종류</dt>
            <dd>{request.itemKind}</dd>
          </div>
          <div className={d.kv}>
            <dt>상자</dt>
            <dd>{request.boxCount}개</dd>
          </div>
          <div className={d.kv}>
            <dt>전자기기·금속</dt>
            <dd>{request.hasElectronicsOrMetal ? "있음" : "없음"}</dd>
          </div>
          <div className={d.kv}>
            <dt>기한</dt>
            <dd>
              {formatDeadline(dueAt)} · {daysLeftText}
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

        {step === "ask" ? (
          <div className={`${d.btns} ${d.two}`}>
            <button className="btn btn--line" type="button" onClick={() => setStep("no")}>
              받지 않기
            </button>
            <button
              ref={focusRef}
              className="btn btn--kakao"
              type="button"
              onClick={() => {
                address.onOpen();
                setStep("sign");
              }}
            >
              <KakaoBubble />
              카카오톡으로 승인
            </button>
          </div>
        ) : null}

        {step === "sign" ? (
          <div className={d.stack}>
            <p ref={addressHeadRef} tabIndex={-1} className={d.q}>
              {addressHead(address)}
            </p>
            {address.renderStep(onClose)}
            {address.ready ? (
              <>
                <p ref={signHeadRef} tabIndex={-1} className={d.q}>
                  카카오톡으로 승인해 주세요
                </p>
                {/* 승인 버튼 바로 위 — 승인해도 보내는 팬에게 주소가 가지 않는다는 것과 검수를 다시 말한다(2026-10-14 추가분 3, 용어집 11절 고정 문장) */}
                <p className="t-strong">
                  {PROMISE.addressFan} {PROMISE.inspection}
                </p>
                <div className={`${d.btns} ${d.two}`}>
                  <button className="btn btn--line" type="button" onClick={() => setStep("ask")}>
                    돌아가기
                  </button>
                  <button ref={focusRef} className="btn btn--kakao" type="button" disabled={busy} onClick={() => void approve()}>
                    <KakaoBubble />
                    {busy ? "보내는 중…" : "카카오톡으로 승인하기"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {step === "no" ? (
          <div className={d.stack}>
            <p className={d.q}>이 선물을 받지 않을까요?</p>
            {/* 차단은 받지 않기 창에서만 고른다(decline-block — 차단하는 다른 길이 없다) */}
            <label className={d.check}>
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
              <span>이 팬의 선물을 앞으로 받지 않기(차단)</span>
            </label>
            <div className={`${d.btns} ${d.two}`}>
              <button className="btn btn--line" type="button" onClick={() => setStep("ask")}>
                돌아가기
              </button>
              <button ref={focusRef} className="btn" type="button" disabled={busy} onClick={() => void decline()}>
                {busy ? "저장하는 중…" : "받지 않기"}
              </button>
            </div>
          </div>
        ) : null}

        {done ? (
          <div className={d.stack} role="status">
            <p className={d.done}>
              <CheckIcon />
              {step === "ok" ? "승인 완료" : "받지 않기 완료"}
            </p>
            <div className={`${d.btns} ${d.two}`}>
              <Link className="btn btn--line" href={DECIDED_HREF}>
                승인 내역
              </Link>
              <button ref={focusRef} className="btn" type="button" onClick={close}>
                확인
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
