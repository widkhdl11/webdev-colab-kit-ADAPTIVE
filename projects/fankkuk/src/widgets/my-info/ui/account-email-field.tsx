"use client";

import { useState } from "react";
import { EMAIL_CUSTOM, EMAIL_DOMAINS, emailLocalTyped, joinEmail, splitEmail, type EmailParts } from "@/features/signup/model/signup-fields";
import s from "./my-info.module.css";

// 계정 설정(팬)의 이메일 칸 — 가입과 같은 「앞부분 @ 도메인 고르기」(design-rules 41절, 시안 part4-v4-20261101 · 가입 signup-page 의 이메일 칸).
// 처음 값은 가입의 나누기 규칙(splitEmail)대로: 목록에 있는 주소면 고르기에서 고르고, 아니면 「직접 입력」 칸에 넣는다.
// 서버로는 지금처럼 전체 주소 한 줄(name="email")만 간다 — 저장 폼(form 속성)에 붙은 숨은 칸이 joinEmail 로 합친 값을 싣는다.
// 보이는 칸 셋은 이름이 없어 폼 값에 들어가지 않지만 form 속성으로 같은 폼에 붙어 required 검사는 받는다.

export function AccountEmailField({
  id,
  formId,
  initial,
  describedBy,
}: {
  /** 앞부분 칸의 id — 「이메일」 라벨이 가리킨다 */
  id: string;
  /** 저장 폼의 id */
  formId: string;
  /** 지금 저장된 전체 주소(없으면 빈 값) */
  initial: string;
  /** 안내 글 id */
  describedBy: string;
}) {
  const customId = `${id}-custom`;
  const [parts, setParts] = useState<EmailParts>(() => splitEmail(initial));
  const empty = parts.local.trim() === "" && parts.choice === "";
  const joined = empty ? "" : joinEmail(parts);

  const focusCustom = () =>
    requestAnimationFrame(() => {
      const el = document.getElementById(customId);
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });

  return (
    <div className={s.emailBox}>
      <div className={s.email}>
        <input
          className="field"
          id={id}
          form={formId}
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="이메일 아이디"
          maxLength={254}
          required
          value={parts.local}
          aria-describedby={describedBy}
          onChange={(e) => {
            // @ 를 치거나 주소를 통째로 붙여 넣으면 @ 뒤를 주소 칸으로 옮긴다(가입과 같다)
            const next = emailLocalTyped(parts, e.target.value);
            setParts(next.parts);
            if (next.focusCustom) focusCustom();
          }}
        />
        <span className={s.at} aria-hidden="true">
          @
        </span>
        <select
          className="field"
          form={formId}
          aria-label="이메일 도메인 선택(@ 뒤)"
          required
          value={parts.choice}
          onChange={(e) => {
            const choice = e.currentTarget.value;
            setParts((p) => ({ ...p, choice }));
            if (choice === EMAIL_CUSTOM) focusCustom();
          }}
        >
          <option value="">이메일 도메인 선택</option>
          {EMAIL_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
          <option value={EMAIL_CUSTOM}>직접 입력</option>
        </select>
      </div>
      {parts.choice === EMAIL_CUSTOM ? (
        <input
          className={`field ${s.emailCustom}`}
          id={customId}
          form={formId}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="이메일 주소 직접 입력(@ 뒤)"
          placeholder="예: example.co.kr"
          required
          value={parts.custom}
          onChange={(e) => {
            const custom = e.target.value;
            setParts((p) => ({ ...p, custom }));
          }}
        />
      ) : null}
      <input type="hidden" name="email" form={formId} value={joined} />
    </div>
  );
}
