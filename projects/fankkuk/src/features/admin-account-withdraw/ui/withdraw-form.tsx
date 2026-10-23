"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import a from "@/shared/ui/admin.module.css";
import { postWithdraw } from "../api/post-withdraw-client";
import { MESSAGE_LOGIN_ID, shapeLoginId } from "../model/login-id";

// 대표의 「회원 탈퇴」 칸 (my-account INV-A15, UX 명세 docs/ux/pages/admin-inquiries.md). 탈퇴 신청은 1:1 문의로 오고 대표가 아이디로 처리한다.
// 대표 화면에만 그린다(부르는 쪽이 고른다 — 최종 판정은 DB). 상태: closed → open → confirm → done, 거절이면 open 에 거절 문장(error).
// 되돌릴 수 없는 처리라 아이디를 적은 뒤 한 번 더 묻는다. 칸이 닫히면(닫기·처리됨) 포커스를 다시 보이는 「회원 탈퇴 처리하기」로 돌려준다.

const FIELD_ID = "account-withdraw";

type Step = "closed" | "open" | "confirm";

export function WithdrawForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [loginId, setLoginId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ loginId: string; note: string | null } | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusToggleNext = useRef(false);
  useEffect(() => {
    if (step !== "closed" || !focusToggleNext.current) return;
    focusToggleNext.current = false;
    toggleRef.current?.focus();
  }, [step]);

  const close = () => {
    focusToggleNext.current = true;
    setStep("closed");
    setLoginId("");
    setError(null);
  };
  const shaped = shapeLoginId(loginId);

  function ask(e: FormEvent) {
    e.preventDefault();
    if (!shaped) {
      setError(MESSAGE_LOGIN_ID);
      return;
    }
    setError(null);
    setStep("confirm");
  }

  async function confirm() {
    if (busy || !shaped) return;
    setBusy(true);
    const outcome = await postWithdraw({ loginId: shaped });
    setBusy(false);
    if (outcome.kind === "failed") {
      setStep("open");
      setError(outcome.message);
      return;
    }
    const note = typeof outcome.body.message === "string" ? outcome.body.message : null;
    setDone({ loginId: shaped, note });
    close();
    router.refresh(); // 탈퇴한 회원의 문의가 「탈퇴한 회원」으로 보이게 다시 읽는다
  }

  return (
    <section className={a.card} aria-labelledby={`${FIELD_ID}-title`}>
      <div className={a.sectionH}>
        <h2 id={`${FIELD_ID}-title`}>회원 탈퇴</h2>
      </div>
      <div role="status">
        {done && step === "closed" && (
          <>
            <p className={a.doneLine}>{done.loginId} 계정을 탈퇴 처리했어요.</p>
            {done.note && (
              <p className={a.errorLine}>
                <span className={a.errorMark} aria-hidden="true">
                  !
                </span>
                {done.note}
              </p>
            )}
          </>
        )}
      </div>
      {step === "closed" && (
        <button
          ref={toggleRef}
          type="button"
          className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
          onClick={() => {
            setDone(null);
            setStep("open");
          }}
        >
          회원 탈퇴 처리하기
        </button>
      )}
      {step === "open" && (
        <form className={a.stack} style={{ gap: 8 }} onSubmit={ask} noValidate>
          <div className={a.field}>
            <label htmlFor={`${FIELD_ID}-id`}>아이디</label>
            <input
              id={`${FIELD_ID}-id`}
              className={a.input}
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-describedby={error ? `${FIELD_ID}-error` : undefined}
              aria-invalid={error !== null}
              value={loginId}
              onChange={(e) => {
                setLoginId(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div role="status">
            {error && (
              <p className={a.errorLine} id={`${FIELD_ID}-error`}>
                <span className={a.errorMark} aria-hidden="true">
                  !
                </span>
                {error}
              </p>
            )}
          </div>
          <div className={a.btnRow}>
            <button type="submit" className={`${a.btn} ${a.btnSm} ${a.btnInk}`}>
              탈퇴 처리
            </button>
            <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={close}>
              닫기
            </button>
          </div>
        </form>
      )}
      {step === "confirm" && shaped && (
        <div className={a.stack} style={{ gap: 8 }} role="alertdialog" aria-labelledby={`${FIELD_ID}-confirm`}>
          <p id={`${FIELD_ID}-confirm`} className={a.hint}>
            {shaped} 계정을 탈퇴 처리할까요? 되돌릴 수 없어요.
          </p>
          <div className={a.btnRow}>
            <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnInk}`} aria-disabled={busy} onClick={confirm} autoFocus>
              {busy ? "처리하는 중…" : "탈퇴 처리"}
            </button>
            <button
              type="button"
              className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
              onClick={() => {
                if (busy) return;
                setStep("open");
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
