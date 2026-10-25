"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { buildReportMail, REPORT_BODY_MAX, REPORT_KIND_LABELS, REPORT_KINDS, type ReportDraft, type ReportField } from "../model/report-mail";
import s from "./report-form.module.css";

// 신고·문의 양식 — 고객센터 1:1 문의 양식과 같은 칸 모양. 보내기를 누르면 이메일 앱이 열린다(서버에 저장하지 않는다).
// 이메일 앱이 안 열리는 환경도 있어, 받는 이메일을 양식 아래에 늘 보여 준다.
// 버튼을 누르면 무엇이 일어나는지는 버튼 바로 위 한 줄로 알린다(design-rules 28절 — 예전에는 머리 아래 요약 판에 있었다).

type Props = { to: string; toLabel: string };

const EMPTY: ReportDraft = { kind: "", replyTo: "", pageUrl: "", body: "" };

const FIELD_IDS: Readonly<Record<ReportField, string>> = { kind: "r-kind", replyTo: "r-reply", pageUrl: "r-page", body: "r-body" };

function Chevron({ className }: { className: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReportForm({ to, toLabel }: Props) {
  const [draft, setDraft] = useState<ReportDraft>(EMPTY);
  const [error, setError] = useState<{ field: ReportField | null; message: string } | null>(null);
  const [opened, setOpened] = useState(false);

  const edit = (field: keyof ReportDraft, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setError(null);
    setOpened(false);
  };
  const invalid = (field: ReportField) => (error?.field === field ? true : undefined);
  const describedBy = (field: ReportField, hint?: string) => [hint, error?.field === field ? "r-error" : undefined].filter(Boolean).join(" ") || undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    const mail = buildReportMail(draft, to);
    if (!mail.ok) {
      setError({ field: mail.field, message: mail.message });
      if (mail.field) document.getElementById(FIELD_IDS[mail.field])?.focus();
      return;
    }
    setError(null);
    setOpened(true);
    window.location.href = mail.href;
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="r-kind">분류</label>
        <div className={s["select-wrap"]}>
          <select
            className={`input ${s.select}`}
            id="r-kind"
            value={draft.kind}
            aria-invalid={invalid("kind")}
            aria-describedby={describedBy("kind")}
            onChange={(e) => edit("kind", e.target.value)}
          >
            <option value="">분류를 골라 주세요</option>
            {REPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {REPORT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <Chevron className={s["select-chev"]} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="r-reply">답변받을 이메일</label>
        <input
          className="input"
          id="r-reply"
          type="email"
          autoComplete="email"
          value={draft.replyTo}
          aria-invalid={invalid("replyTo")}
          aria-describedby={describedBy("replyTo")}
          onChange={(e) => edit("replyTo", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="r-page">
          페이지 주소 <span className={s.optional}>(선택)</span>
        </label>
        <input
          className="input"
          id="r-page"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={draft.pageUrl}
          aria-invalid={invalid("pageUrl")}
          aria-describedby={describedBy("pageUrl", "r-page-hint")}
          onChange={(e) => edit("pageUrl", e.target.value)}
        />
        <p className="hint" id="r-page-hint">
          신고할 페이지나 사진이 있는 페이지의 주소를 적어 주세요.
        </p>
      </div>
      <div className="field">
        <label htmlFor="r-body">내용</label>
        <textarea
          className={`input ${s.textarea}`}
          id="r-body"
          rows={6}
          maxLength={REPORT_BODY_MAX}
          value={draft.body}
          aria-invalid={invalid("body")}
          aria-describedby={describedBy("body", "r-body-hint")}
          onChange={(e) => edit("body", e.target.value)}
        />
        <p className="hint" id="r-body-hint">
          {REPORT_BODY_MAX.toLocaleString("ko-KR")}자까지 적을 수 있어요.
        </p>
      </div>
      {/* 오류·열림 문장과 버튼 위 안내는 버튼과 한 묶음 — 빈 알림 영역이 칸 사이 간격을 더 벌리지 않게 */}
      <div>
        <div role="alert">
          {error && (
            <p className={s.error} id="r-error">
              {error.message}
            </p>
          )}
        </div>
        <div role="status">{opened && <p className={s.done}>이메일 앱을 열었어요. 열리지 않으면 {toLabel}로 보내 주세요.</p>}</div>
        <p className={`hint ${s.btnHint}`}>「이메일로 보내기」를 누르면 적은 내용이 담긴 이메일 앱이 열려요. 이 화면에서는 파일을 첨부할 수 없어요.</p>
        <button type="submit" className="btn btn--block">
          이메일로 보내기
        </button>
        <p className={`t-meta ${s.to}`}>
          받는 이메일: {toLabel} · 회원은 <Link href="/support">고객센터의 1:1 문의</Link>도 이용할 수 있어요.
        </p>
      </div>
    </form>
  );
}
