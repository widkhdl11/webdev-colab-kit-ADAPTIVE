"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useFormDraft } from "@/shared/lib/form-draft/use-form-draft";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { postInquiryAnswer } from "../api/post-answer-client";
import { ANSWER_MAX } from "../model/answer-inquiry";

// 1:1 문의 답변 양식 (admin-console INV-K11, 시안 admin/inquiries.html. 「자주 쓰는 답 넣기」는 뺐다).
// 답은 한 번만 보낸다 — 보내면 쓴 사람이 문의를 고칠 수 없고 답도 바뀌지 않는다.
// 다른 운영자가 먼저 답했으면(409) 화면을 다시 읽어 그 답을 보여 준다.
// 부르는 쪽은 문의가 바뀔 때 key 를 바꿔 칸을 비운다.

export function AnswerForm({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = charCount(answer.trim());
  const valid = count >= 1 && count <= ANSWER_MAX;
  const bad = count > ANSWER_MAX || (error !== null && count < 1);
  const fieldId = `answer-${inquiryId}`;
  // 쓰던 답 임시 저장(session-login INV-L20) — 문의마다 따로
  const formRef = useRef<HTMLFormElement>(null);
  const { clear } = useFormDraft(formRef, `admin-inquiry-answer:${inquiryId}`);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!valid) {
      setError(`답은 1~${ANSWER_MAX}자로 적어 주세요.`);
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postInquiryAnswer({ id: inquiryId, answer });
    setBusy(false);
    if (outcome.kind === "failed") {
      setError(outcome.message);
      if (isStaleFailure(outcome)) router.refresh();
      return;
    }
    clear();
    router.refresh(); // 보낸 답변이 상세에 보이게 다시 읽는다
  }

  return (
    <form ref={formRef} className={a.stack} style={{ gap: 10, marginTop: 16 }} onSubmit={submit} noValidate>
      <div className={a.field}>
        <label htmlFor={fieldId}>답변 쓰기</label>
        <textarea
          id={fieldId}
          className={a.textarea}
          placeholder="쉬운 말로 적어 주세요. 주소·전화번호 같은 개인정보는 적지 않아요."
          aria-describedby={error ? `${fieldId}-count ${fieldId}-error` : `${fieldId}-count`}
          aria-invalid={bad}
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            setError(null);
          }}
        />
        <span className={a.count} id={`${fieldId}-count`}>
          {count} / {ANSWER_MAX}
        </span>
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
        <button type="submit" className={a.btn} aria-disabled={!valid || busy}>
          {busy ? "보내는 중…" : "답변 보내기"}
        </button>
      </div>
    </form>
  );
}
