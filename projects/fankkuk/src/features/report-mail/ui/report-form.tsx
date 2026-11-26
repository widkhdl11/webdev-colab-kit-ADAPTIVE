"use client";

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
    <svg data-icon="line" className={className} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
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
            <option value="">분류 선택</option>
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
          신고할 페이지나 사진이 있는 페이지의 주소를 입력해 주세요.
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
          최대 {REPORT_BODY_MAX.toLocaleString("ko-KR")}자 · 파일은 이메일 앱에서 첨부할 수 있습니다
        </p>
      </div>
      {/* 오류·열림 문장은 버튼과 한 묶음 — 빈 알림 영역이 칸 사이 간격을 더 벌리지 않게 */}
      <div>
        <div role="alert">
          {error && (
            <p className={s.error} id="r-error">
              {error.message}
            </p>
          )}
        </div>
        <div role="status">{opened && <p className={s.done}>이메일 앱에서 내용을 확인하고 전송해 주세요. 앱이 열리지 않으면 {toLabel}으로 직접 보내 주세요.</p>}</div>
        <button type="submit" className="btn btn--block">
          {/* 편지봉투 — lucide-static@0.544.0 icons/mail.svg 경로 그대로. 16 · 선 2 · 글자색(design-rules 크리에이터 카드 버튼 아이콘과 같은 값). 꾸밈이라 읽지 않는다 */}
          <svg data-icon="line" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
            <rect data-duo="" x="2" y="4" width="20" height="16" rx="2" />
          </svg>
          이메일로 보내기
        </button>
        <p className={`t-meta ${s.to}`}>
          받는 이메일: {toLabel}
        </p>
      </div>
    </form>
  );
}
