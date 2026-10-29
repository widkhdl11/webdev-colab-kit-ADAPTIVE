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
import { checkSign, startSign, type SignClientOutcome } from "../api/approval-sign-client";
import { sendDecline } from "../api/send-decline";
import a from "./approval-request.module.css";

// 승인 요청 창 (approval-signature INV-S7·S13·S17, decline-block INV-D1, action-center INV-J8 · UX 명세 docs/ux/pages/creator-actions.md · 시안 v21-addendum3 dlg-d).
// 처리할 일의 승인 요청 줄이 연다. 단계(명세 상태표):
//   ask(거절 · 승인) → address(받는 주소 단계 INV-S13 + 「승인 요청 보내기」) → waiting(「카카오톡에서 인증을 마쳐 주세요」·남은 시간, 3초마다 결과를 묻는다)
//   → approved(서버가 승인을 저장한 뒤에만) / ended(시간 지남·실패 — 「다시 요청」). 거절은 받지 않기 확인(no → noed) 그대로.
// 화면은 서버에 「끝났나」만 묻는다 — 서명 결과는 서버가 게이트웨이에 직접 묻고, 화면이 스스로 「승인됨」으로 바꾸지 않는다.
// 창을 닫아도 서명 요청은 그대로 기다린다 — 다시 열면 서버가 기다리는 요청을 돌려주고 남은 시간부터 이어 센다.
// 결과 묻기는 「지금 요청」에만 답한다 — 「다시 요청」 뒤에 늦게 온 앞 답이 새 상태를 덮지 않게 차례 번호로 거른다.

/** 승인 창의 주소 단계 — 위젯이 넘긴다(INV-S13). */
export type ApprovalAddressStep = {
  /** 받는 주소가 등록돼 있는가 — 주소 단계 머리가 「입력」인지 「확인」인지 가른다 */
  registered: boolean;
  /** 받는 주소가 등록돼 있고 바꾸는 중이 아니다 — 이때만 「승인 요청 보내기」를 보인다 */
  ready: boolean;
  /** 주소 칸. closeSheet 는 등록 전 입력을 그만둘 때 창을 닫는다 */
  renderStep: (closeSheet: () => void) => ReactNode;
  /** 창을 열 때마다 — 바꾸던 입력을 접는다 */
  onOpen: () => void;
  /** 서버가 「주소 없음」으로 거부했다 — 주소 단계가 등록 전으로 돌아간다 */
  onMissing: () => void;
};

type Step = "ask" | "address" | "waiting" | "approved" | "ended" | "no" | "noed";

const POLL_MS = 3000;
const SIGN_WINDOW_SECONDS = 300;

/** 주소 단계 머리(INV-S13) — 주소가 없으면 입력, 바꾸는 중이면 새 주소, 준비됐으면 확인 */
function addressHead(address: ApprovalAddressStep): string {
  if (!address.registered) return "배송지 등록";
  return address.ready ? "등록된 배송지 확인" : "배송지 변경";
}

/** 남은 시간 「m:ss」 */
function leftText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 로그인이 풀렸을 때 갈 곳 — 다시 로그인하면 이 주문의 승인 창으로 돌아온다(?order= 유지) */
export function approvalLoginHref(orderNo: string): string {
  return `/login?next=${encodeURIComponent(`/creator/actions?order=${encodeURIComponent(orderNo)}`)}`;
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
  start = "ask",
}: {
  request: ApprovalRequestView;
  /** 자동 반려 기한(결제 완료 + 168시간) — 처리할 일 읽기가 준 값 */
  dueAt: string;
  daysLeftText: string;
  open: boolean;
  onClose: () => void;
  address: ApprovalAddressStep;
  /** 창을 열 때의 단계 — 처리할 일 강조 판의 「받지 않기」는 받지 않기 확인부터 연다(고르는 단계를 한 번 건너뛸 뿐, 확인·차단 고르기는 그대로) */
  start?: "ask" | "no";
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(start);
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooMany, setTooMany] = useState(false);
  const [endedReason, setEndedReason] = useState<"expired" | "failed">("expired");
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const focusRef = useRef<HTMLButtonElement>(null);
  const signHeadRef = useRef<HTMLParagraphElement>(null);
  const addressHeadRef = useRef<HTMLParagraphElement>(null);
  const wasReady = useRef(address.ready);
  // 지금 상태를 만든 차례 — 늦게 온 앞 답은 버린다
  const turn = useRef(0);
  const done = step === "approved" || step === "noed";

  // 서버 답을 화면 상태로. 같은 차례의 답만 받는다.
  function applyOutcome(r: SignClientOutcome, myTurn: number) {
    if (turn.current !== myTurn) return;
    if (r.kind === "login") return router.push(approvalLoginHref(request.orderNo));
    if (r.kind === "view") {
      const v = r.view;
      if (v.state === "waiting") {
        setExpiresAt(Date.parse(v.expiresAt));
        setNow(Date.now());
        setStep("waiting");
      } else if (v.state === "approved") setStep("approved");
      else if (v.state === "ended") {
        setEndedReason(v.reason);
        setStep("ended");
      } else {
        // 요청이 사라졌다(서버 「요청 없음」) — 시간이 지났는지 알 수 없으니 「인증을 완료하지 못했습니다.」로 두고 다시 요청하게
        setEndedReason("failed");
        setStep("ended");
      }
      return;
    }
    if (r.kind === "refused" && r.code === "no_address") {
      // 창은 그대로 두고 주소 입력으로 돌아간다(INV-S13)
      address.onMissing();
      setStep("address");
      return;
    }
    setTooMany(r.kind === "refused" && r.code === "too_many");
    setError(r.kind === "refused" ? r.message : "요청하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  useEffect(() => {
    if (!open) return;
    turn.current += 1;
    const myTurn = turn.current;
    setStep(start);
    setBlock(false);
    setError(null);
    setTooMany(false);
    if (start !== "ask") return;
    // 창을 다시 열면 기다리는 요청을 이어 보인다(서버가 남은 시간을 준다). 그 밖의 답은 고르기 단계 그대로.
    // 답이 오기 전에 「거절」·「승인」을 누르면 그 차례가 바뀌어(choose) 늦게 온 답이 고른 단계를 덮지 않는다.
    void checkSign(request.requestId).then((r) => {
      if (turn.current !== myTurn) return;
      if (r.kind === "view" && (r.view.state === "waiting" || r.view.state === "approved")) applyOutcome(r, myTurn);
    });
    // 창을 열 때 한 번만 묻는다(applyOutcome 은 렌더마다 새로 만들어지므로 의존 목록에 넣지 않는다)
  }, [open, start, request.requestId]);

  // 기다리는 동안: 3초마다 결과를 묻고, 1초마다 남은 시간을 센다
  useEffect(() => {
    if (!open || step !== "waiting") return;
    const myTurn = turn.current;
    let asking = false;
    const ask = async () => {
      if (asking) return;
      asking = true;
      const r = await checkSign(request.requestId);
      asking = false;
      // 연결이 잠깐 끊긴 것은 실패로 치지 않는다 — 다음 확인에서 다시 묻는다
      if (r.kind === "failed") return;
      applyOutcome(r, myTurn);
    };
    const poll = window.setInterval(() => void ask(), POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    void ask();
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [open, step, request.requestId]);

  useEffect(() => {
    if (open) focusRef.current?.focus();
  }, [open, step]);
  // 주소가 없으면(처음부터 없거나 서버가 「주소 없음」으로 돌려보냄) 초점을 주소 단계 머리 「배송지 등록」로 — 무엇을 해야 하는지부터 읽히게(INV-S13)
  useEffect(() => {
    if (open && step === "address" && !address.registered) addressHeadRef.current?.focus();
  }, [open, step, address.registered]);
  // 창 안에서 주소를 저장해 요청 칸이 새로 붙으면 그 머리로 포커스를 옮긴다 — 저장한 폼이 사라져 포커스가 창 밖으로 나가지 않게
  useEffect(() => {
    if (open && step === "address" && address.ready && !wasReady.current) signHeadRef.current?.focus();
    wasReady.current = address.ready;
  }, [open, step, address.ready]);

  // 완료 뒤 닫으면 목록을 새로 읽는다 — 그 줄은 다음 읽기에서 없다(INV-J8). 기다리는 중에 닫아도 요청은 서버에서 그대로 기다린다.
  function close() {
    if (busy) return;
    turn.current += 1;
    onClose();
    if (done) router.refresh();
  }

  async function requestSign() {
    if (busy) return;
    turn.current += 1;
    const myTurn = turn.current;
    setBusy(true);
    setError(null);
    setTooMany(false);
    const r = await startSign(request.requestId);
    setBusy(false);
    applyOutcome(r, myTurn);
  }

  // 고르기 단계에서 「거절」·「승인」을 골랐다 — 창을 열 때 보낸 확인의 늦은 답이 이 선택을 덮지 않게 차례를 올린다
  function choose(next: "no" | "address") {
    turn.current += 1;
    if (next === "address") address.onOpen();
    setStep(next);
  }

  // 고르기 단계로 돌아간다 — 앞 단계의 오류 줄·한도 표시를 지운다
  function backToAsk() {
    setError(null);
    setTooMany(false);
    setStep("ask");
  }

  async function decline() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await sendDecline(request.requestId, block);
    setBusy(false);
    if (r.kind === "ok") return setStep("noed");
    if (r.kind === "login") return router.push(approvalLoginHref(request.orderNo));
    setError(r.kind === "refused" ? r.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const left = Math.max(0, (expiresAt - now) / 1000);

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
            <dt>주문번호</dt>
            <dd>{request.orderNo}</dd>
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
            <button className="btn btn--line" type="button" onClick={() => choose("no")}>
              거절
            </button>
            <button ref={focusRef} className="btn btn--kakao" type="button" onClick={() => choose("address")}>
              <KakaoBubble />
              승인
            </button>
          </div>
        ) : null}

        {step === "address" ? (
          <div className={d.stack}>
            <p ref={addressHeadRef} tabIndex={-1} className={d.q}>
              {addressHead(address)}
            </p>
            {address.renderStep(onClose)}
            {address.ready ? (
              <>
                <p ref={signHeadRef} tabIndex={-1} className={d.q}>
                  카카오톡으로 선물 승인
                </p>
                {/* 승인 버튼 바로 위 — 승인해도 보내는 팬에게 주소가 가지 않는다는 것과 검수를 다시 말한다(2026-10-14 추가분 3, 용어집 11절 고정 문장) */}
                <p className="t-strong">
                  {PROMISE.addressFan} {PROMISE.inspection}
                </p>
                <div className={`${d.btns} ${d.two}`}>
                  <button className="btn btn--line" type="button" onClick={backToAsk}>
                    돌아가기
                  </button>
                  <button ref={focusRef} className="btn btn--kakao" type="button" disabled={busy || tooMany} onClick={() => void requestSign()}>
                    <KakaoBubble />
                    {busy ? "요청 중…" : "승인 요청 보내기"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {step === "waiting" ? (
          <div className={d.stack}>
            {/* 안내 문구만 알림 영역 — 남은 시간은 매초 바뀌므로 알림 밖(timer, aria-live off)에 둬 화면 읽기 프로그램이 매초 읽지 않게 */}
            <p className={a.signing}>
              <span role="status">카카오톡에서 인증을 마쳐 주세요</span>
              <span className={a["wait-time"]} role="timer" aria-live="off" aria-label="남은 시간">
                {leftText(left)}
              </span>
            </p>
            <progress className={a["wait-bar"]} max={SIGN_WINDOW_SECONDS} value={Math.min(SIGN_WINDOW_SECONDS, Math.round(left))} aria-label="남은 인증 시간" />
            <div className={d.btns}>
              <button ref={focusRef} className="btn btn--line" type="button" onClick={close}>
                닫기
              </button>
            </div>
          </div>
        ) : null}

        {step === "ended" ? (
          <div className={d.stack}>
            <p className={d.q} role="status">
              {endedReason === "expired" ? "인증 시간이 지났습니다." : "인증을 완료하지 못했습니다."}
            </p>
            <div className={d.btns}>
              {tooMany ? (
                <button ref={focusRef} className="btn btn--line" type="button" onClick={close}>
                  닫기
                </button>
              ) : (
                <button ref={focusRef} className="btn btn--kakao" type="button" disabled={busy} onClick={() => void requestSign()}>
                  <KakaoBubble />
                  {busy ? "요청 중…" : "다시 요청"}
                </button>
              )}
            </div>
          </div>
        ) : null}

        {step === "no" ? (
          <div className={d.stack}>
            <p className={d.q}>이 선물을 거절할까요?</p>
            {/* 차단은 받지 않기 창에서만 고른다(decline-block — 차단하는 다른 길이 없다) */}
            <label className={d.check}>
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
              <span>이 팬의 선물을 앞으로 받지 않기(차단)</span>
            </label>
            <div className={`${d.btns} ${d.two}`}>
              <button className="btn btn--line" type="button" onClick={backToAsk}>
                돌아가기
              </button>
              <button ref={focusRef} className="btn" type="button" disabled={busy} onClick={() => void decline()}>
                {busy ? "저장 중…" : "받지 않기"}
              </button>
            </div>
          </div>
        ) : null}

        {done ? (
          <div className={d.stack} role="status">
            <p className={d.done}>
              <CheckIcon />
              {step === "approved" ? "승인됨" : "거절 완료"}
            </p>
            <div className={`${d.btns} ${d.two}`}>
              <Link className="btn btn--line" href={DECIDED_HREF}>
                {step === "approved" ? "승인 내역 보기" : "승인 내역"}
              </Link>
              <button ref={focusRef} className="btn" type="button" onClick={close}>
                {step === "approved" ? "닫기" : "확인"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
