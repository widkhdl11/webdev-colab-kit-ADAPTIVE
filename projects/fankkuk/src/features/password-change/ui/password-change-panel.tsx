"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { PASSWORD_MIN } from "@/entities/session/model/password-rule";
import { sendPasswordChange, type ChangePasswordField } from "../api/change-password-client";
import s from "./password-change.module.css";

// 내 정보의 「비밀번호 변경」(session-login INV-L12). 지금 비밀번호와 새 비밀번호를 서버에 보낸다 — 판정은 서버가 한다.
// 내 정보 저장 폼 안에 놓이므로 폼을 따로 두지 않는다: 버튼은 type="button", 칸에서 Enter 를 누르면 이 칸의 저장을 부른다
// (안 그러면 바깥 저장 폼이 제출된다). 입력칸에 name 이 없어 바깥 폼 저장에 비밀번호가 실리지 않는다.
// 실패하면 문구는 role="alert" 로 읽히고, 서버가 알려 준 칸(모르면 첫 칸)에 aria-invalid 를 달고 포커스를 옮긴다.

type Values = Record<ChangePasswordField, string>;
type Notice = { kind: "ok"; text: string } | { kind: "error"; field: ChangePasswordField; text: string } | null;

const EMPTY: Values = { currentPassword: "", newPassword: "", newPasswordConfirm: "" };

export function PasswordChangePanel({ id, onLoginExpired }: { id: string; onLoginExpired: () => void }) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const [values, setValues] = useState<Values>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const inputs = useRef<Partial<Record<ChangePasswordField, HTMLInputElement | null>>>({});

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await sendPasswordChange(values);
    setBusy(false);
    if (r.kind === "login") return onLoginExpired();
    if (r.kind === "failed") {
      const field = r.field ?? "currentPassword";
      setNotice({ kind: "error", field, text: r.message });
      inputs.current[field]?.focus();
      return;
    }
    setValues(EMPTY);
    setNotice({ kind: "ok", text: r.message ?? "비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요." });
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void submit();
  };

  const field = (key: ChangePasswordField, label: string, autoComplete: string, hint?: string) => {
    const invalid = notice?.kind === "error" && notice.field === key;
    const describedBy = [hint ? f(`${key}-h`) : null, invalid ? f("err") : null].filter(Boolean).join(" ");
    return (
      <div className="field">
        <label htmlFor={f(key)}>{label}</label>
        <input
          ref={(el) => {
            inputs.current[key] = el;
          }}
          className="input"
          id={f(key)}
          type="password"
          autoComplete={autoComplete}
          maxLength={72}
          value={values[key]}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          onKeyDown={onEnter}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy || undefined}
        />
        {hint && (
          <p className="hint" id={f(`${key}-h`)}>
            {hint}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className={s.panel} id={id} role="group" aria-label="비밀번호 변경">
      {field("currentPassword", "지금 비밀번호", "current-password")}
      {field("newPassword", "새 비밀번호", "new-password", `${PASSWORD_MIN}자 이상, 아이디와 다르게 적어 주세요. 바꾸면 다른 기기에서는 로그아웃돼요.`)}
      {field("newPasswordConfirm", "새 비밀번호 확인", "new-password")}
      <div>
        <p className={s.error} id={f("err")} role="alert">
          {notice?.kind === "error" ? notice.text : ""}
        </p>
        <p className={s.msg} role="status">
          {notice?.kind === "ok" ? notice.text : ""}
        </p>
      </div>
      <div className={s.actions}>
        <button className="btn" type="button" onClick={() => void submit()} aria-disabled={busy} aria-busy={busy || undefined}>
          {busy ? "바꾸는 중" : "비밀번호 바꾸기"}
        </button>
      </div>
    </div>
  );
}
