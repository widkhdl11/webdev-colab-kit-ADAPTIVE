"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { BOX_CAPACITY_MAX, BOX_NAME_MAX } from "@/entities/revgift-box/model/box-rules";
import { ConfirmDialog, StepDialog } from "@/shared/ui/step-dialog";
import { sendCreateBox } from "../api/box-requests";
import s from "./box-manage.module.css";

// 선물함 만들기 모달 (revgift-box INV-GB3 · UX 명세 creator-revgifts-new 「만들기 모달 — 상태표」 · design-rules 43절).
// 1/3 이름 → 2/3 받을 인원(1~100) → 3/3 공개 범위(공개 미리 선택) → 만들었습니다. 값 검사는 「다음」을 누를 때 그 칸 아래 한 줄.
// 입력이 있는데 닫기·Esc·바깥을 누르면 「입력한 내용을 지울까요?」. 만든 뒤 신청 관리로 갈지는 크리에이터가 고른다(바로 이동하지 않는다).

type Step = 1 | 2 | 3 | "done";
const STEP_NAME = { 1: "이름", 2: "받을 인원", 3: "공개 범위" } as const;
const STEP_NEXT = { 1: "다음: 받을 인원", 2: "다음: 공개 범위", 3: "다음: 신청 링크 받기" } as const;

export function BoxCreateDialog({
  open,
  onClose,
  onCreated,
  onOpenManage,
  linkFor,
  manageReady,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  /** 저장됐다 — 부르는 쪽이 목록을 다시 읽는다 */
  onCreated: (boxId: string) => void;
  /** 「신청 관리 열기」 — 이 창을 닫고 신청 관리 모달로 바꿔 연다 */
  onOpenManage: (boxId: string) => void;
  /** 만든 선물함의 신청 링크 — 목록을 다시 읽기 전이면 null */
  linkFor: (boxId: string) => string | null;
  /** 만든 선물함의 신청 관리 내용이 도착했는가 */
  manageReady: (boxId: string) => boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 단계가 바뀌면 그 단계의 입력 칸으로 초점을 옮긴다(누른 「다음」이 사라지는 자리)
  useEffect(() => {
    if (open && (step === 1 || step === 2)) inputRef.current?.focus();
  }, [open, step]);

  const reset = () => {
    setStep(1);
    setName("");
    setCapacity("");
    setIsPublic(true);
    setFieldError(null);
    setSaveError(null);
    setDiscard(false);
    setCreatedId(null);
    setCopyMsg("");
  };
  const close = () => {
    reset();
    onClose();
  };
  const requestClose = () => {
    if (busy) return;
    if (step !== "done" && (name.trim() !== "" || capacity.trim() !== "")) setDiscard(true);
    else close();
  };

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    if (step === 1) {
      if (!name.trim()) {
        setFieldError("선물함 이름을 입력해 주세요.");
        inputRef.current?.focus();
        return;
      }
      setFieldError(null);
      setStep(2);
      return;
    }
    if (step === 2) {
      const n = Number(capacity);
      if (!Number.isInteger(n) || n < 1 || n > BOX_CAPACITY_MAX) {
        setFieldError(`받을 인원을 1~${BOX_CAPACITY_MAX}명으로 입력해 주세요.`);
        inputRef.current?.focus();
        return;
      }
      setFieldError(null);
      setStep(3);
      return;
    }
    if (step === 3) void create();
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setSaveError(null);
    const o = await sendCreateBox({ name: name.trim(), capacity: Number(capacity), isPublic });
    setBusy(false);
    if (o.kind === "ok") {
      setCreatedId(o.data);
      setStep("done");
      onCreated(o.data);
      return;
    }
    if (o.kind === "login") {
      router.push(`/login?next=${encodeURIComponent("/creator/revgift-boxes/new")}`);
      return;
    }
    setSaveError(o.kind === "refused" ? o.message : "선물함을 만들지 못했습니다. 입력한 내용은 그대로 있습니다.");
  };

  const link = createdId ? linkFor(createdId) : null;
  const ready = createdId ? manageReady(createdId) : false;

  const errorLine = (id: string, text: string | null) =>
    text ? (
      <p className={s.ferr} id={id} role="alert">
        <ErrorIcon />
        <span>{text}</span>
      </p>
    ) : null;

  let body: ReactNode;
  let footer: ReactNode;
  if (step === "done") {
    body = (
      <>
        <div className={s.made}>
          <p className={s.madeName}>{name.trim()}</p>
          <span className="tag tag--dot tag--info">신청 받는 중</span>
        </div>
        <div className={s.linkbox}>
          <p className={s.lkLabel} id="bc-link-l">
            신청 링크
          </p>
          <div className={s.lkRow}>
            <p className={s.lk} aria-labelledby="bc-link-l">
              {link ?? "링크를 불러오는 중입니다."}
            </p>
            <button
              className="btn btn--line"
              type="button"
              disabled={!link}
              onClick={() => {
                if (!link) return;
                if (typeof navigator === "undefined" || !navigator.clipboard) {
                  setCopyMsg("복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.");
                  return;
                }
                navigator.clipboard.writeText(link).then(
                  () => setCopyMsg("링크를 복사했습니다."),
                  () => setCopyMsg("복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요."),
                );
              }}
            >
              링크 복사
            </button>
          </div>
          <p className="hint" role="status">
            {copyMsg}
          </p>
        </div>
      </>
    );
    footer = (
      <>
        <button className="btn btn--text" type="button" onClick={close}>
          닫기
        </button>
        <button
          className="btn"
          type="button"
          aria-disabled={!ready || undefined}
          aria-busy={!ready || undefined}
          onClick={() => {
            if (!createdId || !ready) return;
            const id = createdId;
            reset();
            onOpenManage(id);
          }}
        >
          신청 관리 열기
        </button>
      </>
    );
  } else {
    body = (
      <form id="bc-form" className={s.stepForm} onSubmit={next} noValidate>
        {step === 1 ? (
          <div className="field">
            <label htmlFor="bc-name">선물함 이름</label>
            <input
              ref={inputRef}
              id="bc-name"
              className="input"
              type="text"
              autoComplete="off"
              maxLength={BOX_NAME_MAX}
              value={name}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "bc-err" : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setFieldError(null);
              }}
            />
            {errorLine("bc-err", fieldError)}
          </div>
        ) : step === 2 ? (
          <div className="field">
            <label htmlFor="bc-count">받을 인원</label>
            <div className={s.suffix}>
              <input
                ref={inputRef}
                id="bc-count"
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={BOX_CAPACITY_MAX}
                step={1}
                value={capacity}
                  aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "bc-err bc-count-hint" : "bc-count-hint"}
                onChange={(e) => {
                  setCapacity(e.target.value);
                  setFieldError(null);
                }}
              />
              <span aria-hidden="true">명</span>
            </div>
            <p className="hint" id="bc-count-hint">{`1~${BOX_CAPACITY_MAX}명`}</p>
            {errorLine("bc-err", fieldError)}
          </div>
        ) : (
          <>
            <fieldset className={s.scope} disabled={busy}>
              <legend>공개 범위</legend>
              <label className={s.scopeOpt}>
                <input type="radio" name="bc-scope" checked={isPublic} onChange={() => setIsPublic(true)} />
                <span>
                  <b>공개</b>
                  <small>내 크리에이터 페이지에서 신청</small>
                </span>
              </label>
              <label className={s.scopeOpt}>
                <input type="radio" name="bc-scope" checked={!isPublic} onChange={() => setIsPublic(false)} />
                <span>
                  <b>비공개</b>
                  <small>신청 링크로만 신청</small>
                </span>
              </label>
            </fieldset>
            <dl className={s.sum}>
              <div>
                <dt>선물함 이름</dt>
                <dd>{name.trim()}</dd>
              </div>
              <div>
                <dt>받을 인원</dt>
                <dd>{`${Number(capacity)}명`}</dd>
              </div>
            </dl>
            {saveError ? (
              <p className={`${s.ferr} ${s.ferrBox}`} role="alert">
                <ErrorIcon />
                <span>{saveError}</span>
              </p>
            ) : null}
          </>
        )}
      </form>
    );
    footer = (
      <>
        {step !== 1 ? (
          <button
            className="btn btn--line"
            type="button"
            disabled={busy}
            onClick={() => {
              setFieldError(null);
              setSaveError(null);
              setStep(step === 3 ? 2 : 1);
            }}
          >
            이전
          </button>
        ) : null}
        <button className="btn" type="submit" form="bc-form" aria-busy={busy || undefined} aria-disabled={busy || undefined}>
          {step === 3 ? (busy ? "만드는 중…" : saveError ? "다시 만들기" : "선물함 만들기") : "다음"}
        </button>
      </>
    );
  }

  return (
    <>
      <StepDialog
        open={open}
        title={
          step === "done" ? (
            <span className={s.doneTitle}>
              <DoneIcon />
              <span>선물함을 만들었습니다</span>
            </span>
          ) : (
            "선물함 만들기"
          )
        }
        progress={step === "done" ? undefined : { step, total: 3, name: STEP_NAME[step], next: STEP_NEXT[step], label: "선물함 만들기 진행" }}
        footer={footer}
        busy={busy}
        onRequestClose={requestClose}
        returnFocusRef={returnFocusRef}
      >
        {body}
      </StepDialog>
      <ConfirmDialog
        open={discard}
        title="입력한 내용을 지울까요?"
        description={name.trim() ? `선물함 이름 · ${name.trim()}` : undefined}
        onCancel={() => setDiscard(false)}
      >
        <button className="btn btn--line" type="button" onClick={close}>
          지우기
        </button>
        <button className="btn" type="button" onClick={() => setDiscard(false)}>
          계속 만들기
        </button>
      </ConfirmDialog>
    </>
  );
}

export function ErrorIcon() {
  return (
    <svg className="ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

function DoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 10" />
    </svg>
  );
}
