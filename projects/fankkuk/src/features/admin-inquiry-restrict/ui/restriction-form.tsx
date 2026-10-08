"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { postInquiryRestriction } from "../api/post-restriction-client";
import { RESTRICTION_REASON_MAX } from "../model/restrict-inquiry-author";

// 1:1 문의 제한·풀기 (admin-console INV-K12). 대표 화면에만 그린다(부르는 쪽이 고른다 — 최종 판정은 DB).
// 버튼을 누르면 사유 칸이 열리고, 사유를 적어 확인해야 바뀐다. 제한은 그 문의를 쓴 계정 전체에 걸린다.
// 부르는 쪽은 문의가 바뀔 때 key 를 바꿔 칸을 비운다. 양식이 닫히면(취소·저장) 포커스를 다시 보이는 버튼으로 돌려준다.

export function RestrictionForm({ inquiryId, restricted }: { inquiryId: string; restricted: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusToggleNext = useRef(false);
  useEffect(() => {
    if (open || !focusToggleNext.current) return;
    focusToggleNext.current = false;
    toggleRef.current?.focus();
  }, [open]);
  const close = () => {
    focusToggleNext.current = true;
    setOpen(false);
    setReason("");
    setError(null);
  };
  const count = charCount(reason.trim());
  const valid = count >= 1 && count <= RESTRICTION_REASON_MAX;
  const fieldId = `restriction-${inquiryId}`;
  const verb = restricted ? "제한 풀기" : "문의 제한하기";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!valid) {
      setError(`사유를 1~${RESTRICTION_REASON_MAX}자로 적어 주세요.`);
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postInquiryRestriction({ id: inquiryId, restricted: !restricted, reason });
    setBusy(false);
    if (outcome.kind === "failed") {
      setError(outcome.message);
      if (isStaleFailure(outcome)) router.refresh();
      return;
    }
    close();
    router.refresh(); // 목록의 「문의 제한 중」 표시가 바뀌게 다시 읽는다
  }

  if (!open) {
    return (
      <button ref={toggleRef} type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={() => setOpen(true)}>
        {verb}
      </button>
    );
  }

  return (
    <form className={a.stack} style={{ gap: 8 }} onSubmit={submit} noValidate>
      <div className={a.field}>
        <label htmlFor={fieldId}>{restricted ? "푸는 사유" : "제한 사유"}</label>
        <input
          id={fieldId}
          className={a.input}
          type="text"
          autoFocus
          placeholder={restricted ? "예: 같은 문의를 더 보내지 않기로 함" : "예: 같은 내용의 문의를 하루 50건 넘게 보냄"}
          aria-describedby={error ? `${fieldId}-count ${fieldId}-hint ${fieldId}-error` : `${fieldId}-count ${fieldId}-hint`}
          aria-invalid={count > RESTRICTION_REASON_MAX || (error !== null && count < 1)}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
        />
        <span className={a.count} id={`${fieldId}-count`}>
          {count} / {RESTRICTION_REASON_MAX}
        </span>
        <p className={a.hint} id={`${fieldId}-hint`} style={{ margin: 0 }}>
          {restricted ? "풀면 이 사람이 다시 문의를 남길 수 있어요." : "제한하면 이 사람은 새 문의를 남길 수 없어요. 지난 문의와 답은 그대로 보여요."}
        </p>
      </div>
      <div role="status">
        {error && (
          <p className={a.errorLine} id={`${fieldId}-error`}>
            <span className={a.errorMark} aria-hidden="true">
              !
            </span>
            {error}
          </p>
        )}
      </div>
      <div className={a.btnRow}>
        <button type="submit" className={`${a.btn} ${a.btnSm} ${restricted ? "" : a.btnInk}`} aria-disabled={!valid || busy}>
          {busy ? "저장하는 중…" : verb}
        </button>
        <button
          type="button"
          className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
          onClick={close}
        >
          취소
        </button>
      </div>
    </form>
  );
}
