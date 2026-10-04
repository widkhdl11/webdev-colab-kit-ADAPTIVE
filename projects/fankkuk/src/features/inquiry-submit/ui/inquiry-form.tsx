"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { INQUIRY_KIND_LABELS, INQUIRY_KINDS } from "@/entities/inquiry/model/inquiry-kind";
import { postInquiry } from "../api/post-inquiry-client";
import { checkInquiryInput, type InquiryField } from "../model/inquiry-input";
import s from "./inquiry-form.module.css";

// 1:1 문의 양식 (admin-console INV-K11, 결정 d25). 시안: docs/design/mockups/site/v4/support.html
// 로그인하지 않았으면 칸은 보이되 버튼이 로그인 화면으로 간다. 로그인했으면 실제로 보낸다 —
// 보내기 전에 서버와 같은 검사를 하고, 성공하면 칸을 비우고 화면을 다시 읽어 「내 문의」에 새 문의가 보이게 한다.

function Chevron({ className }: { className: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Draft = { kind: string; orderNo: string; title: string; body: string };

const MESSAGE_NEED_SIGN_IN = "로그인이 필요해요. 로그인하고 문의를 남겨 주세요.";

const EMPTY: Draft = { kind: "", orderNo: "", title: "", body: "" };

const FIELD_IDS: Readonly<Record<InquiryField, string>> = { kind: "q-cat", orderNo: "q-order", title: "q-title", body: "q-body" };

export function InquiryForm({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: InquiryField | null; message: string } | null>(null);
  const [done, setDone] = useState(false);

  const edit = (field: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setError(null);
    setDone(false);
  };
  const invalid = (field: InquiryField) => (error?.field === field ? true : undefined);
  const describedBy = (field: InquiryField, hint?: string) => [hint, error?.field === field ? "q-error" : undefined].filter(Boolean).join(" ") || undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!signedIn) {
      // 로그인 전에는 버튼 대신 로그인 링크가 있지만, 칸에서 Enter 로도 제출될 수 있다 — 조용히 끝내지 않는다
      setError({ field: null, message: MESSAGE_NEED_SIGN_IN });
      return;
    }
    const checked = checkInquiryInput(draft);
    if (!checked.ok) {
      setError({ field: checked.field, message: checked.message });
      document.getElementById(FIELD_IDS[checked.field])?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postInquiry(draft);
    setBusy(false);
    if (outcome.kind === "failed") {
      // 보내기 전에 서버와 같은 검사를 했으므로 여기 오는 것은 로그인 만료·연결 실패 같은 것이다 — 문구만 보인다
      setError({ field: null, message: outcome.message });
      return;
    }
    setDraft(EMPTY);
    setDone(true);
    router.refresh(); // 「내 문의」에 방금 남긴 문의가 보이게 다시 읽는다
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="q-cat">분류</label>
        <div className={s["select-wrap"]}>
          <select
            className={`input ${s.select}`}
            id="q-cat"
            value={draft.kind}
            aria-invalid={invalid("kind")}
            aria-describedby={describedBy("kind")}
            onChange={(e) => edit("kind", e.target.value)}
          >
            <option value="">분류를 골라 주세요</option>
            {INQUIRY_KINDS.map((k) => (
              <option key={k} value={k}>
                {INQUIRY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <Chevron className={s["select-chev"]} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="q-order">
          주문번호 <span className={s.optional}>(선택)</span>
        </label>
        <input
          className="input"
          id="q-order"
          type="text"
          placeholder="예: FC-7K3M9"
          autoCapitalize="characters"
          spellCheck={false}
          value={draft.orderNo}
          aria-invalid={invalid("orderNo")}
          aria-describedby={describedBy("orderNo", "q-order-h")}
          onChange={(e) => edit("orderNo", e.target.value)}
        />
        <p className="hint" id="q-order-h">
          선물에 관한 문의라면 적어 주시면 더 빨리 확인할 수 있어요.
        </p>
      </div>
      <div className="field">
        <label htmlFor="q-title">제목</label>
        <input
          className="input"
          id="q-title"
          type="text"
          placeholder="문의 제목을 적어 주세요"
          value={draft.title}
          aria-invalid={invalid("title")}
          aria-describedby={describedBy("title")}
          onChange={(e) => edit("title", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="q-body">내용</label>
        <textarea
          className={`input ${s.textarea}`}
          id="q-body"
          rows={6}
          placeholder="궁금한 점을 자세히 적어 주세요"
          value={draft.body}
          aria-invalid={invalid("body")}
          aria-describedby={describedBy("body")}
          onChange={(e) => edit("body", e.target.value)}
        />
      </div>
      {/* 오류는 바로 읽히게(alert), 성공은 차례를 기다려 읽히게(status). 영역은 늘 있어야 바뀐 내용이 읽힌다 */}
      <div role="alert">
        {error && (
          <p className={s.error} id="q-error">
            {error.message}
          </p>
        )}
      </div>
      <div role="status">{done && <p className={s.done}>문의를 남겼어요. 답변이 달리면 아래 「내 문의」에서 볼 수 있어요.</p>}</div>
      {signedIn ? (
        <button type="submit" className="btn btn--block" aria-disabled={busy}>
          {busy ? "보내는 중…" : "문의 남기기"}
        </button>
      ) : (
        <Link className="btn btn--block" href="/login">
          로그인하고 문의 남기기
        </Link>
      )}
    </form>
  );
}
