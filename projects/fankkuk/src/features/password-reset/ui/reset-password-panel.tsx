"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PASSWORD_HINT } from "@/entities/session/model/password-rule";
import { sendNewPassword, type NewPasswordField } from "../api/reset-client";
import s from "./reset-password.module.css";

// 재설정 메일의 링크로 연 화면(session-login INV-L11). 시안: docs/design/mockups/site/v11/password-reset.html (가운데 기둥 .auth 안 카드 한 장). 새 비밀번호를 적고 저장해야 바뀐다 — 링크를 여는 것만으로는 아무것도 바뀌지 않는다.
// 링크 값의 꼴·만료·한 번만 쓰기는 서버와 DB 가 본다. 이 화면은 값을 저장 요청에 실어 보내기만 한다.
// 바뀌면 이 계정의 모든 기기에서 로그아웃되므로 로그인으로 안내하고, 로그인 링크로 포커스를 옮긴다.
// 저장이 실패하면 틀린 칸(모르면 새 비밀번호 칸)이 오류 문단을 aria-describedby 로 가리키고, 그 칸으로 포커스를 옮긴다.

type State =
  | { kind: "ready" }
  | { kind: "sending" }
  | { kind: "done"; message: string | null }
  | { kind: "failed"; field: NewPasswordField | null; message: string; at: number };

export function ResetPasswordPanel({ token }: { token: string }) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const [state, setState] = useState<State>({ kind: "ready" });
  const loginRef = useRef<HTMLAnchorElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const pw2Ref = useRef<HTMLInputElement>(null);
  const linkDead = state.kind === "failed" && state.field === "link";
  // 실패한 칸 — 서버가 칸을 알려 주지 않았으면 새 비밀번호 칸
  const badField: "password" | "passwordConfirm" | null =
    state.kind === "failed" && !linkDead ? (state.field === "passwordConfirm" ? "passwordConfirm" : "password") : null;
  const failedAt = state.kind === "failed" ? state.at : 0;

  useEffect(() => {
    if (state.kind === "done" || linkDead) loginRef.current?.focus();
  }, [state.kind, linkDead]);

  useEffect(() => {
    if (badField) (badField === "passwordConfirm" ? pw2Ref : pwRef).current?.focus();
  }, [badField, failedAt]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state.kind === "sending") return;
    const form = e.currentTarget;
    const password = (form.elements.namedItem(f("pw")) as HTMLInputElement | null)?.value ?? "";
    const confirm = (form.elements.namedItem(f("pw2")) as HTMLInputElement | null)?.value ?? "";
    setState({ kind: "sending" });
    const r = await sendNewPassword(token, password, confirm);
    setState(r.ok ? { kind: "done", message: r.message } : { kind: "failed", field: r.field, message: r.message, at: Date.now() });
  };

  const fieldError = (field: "password" | "passwordConfirm") => badField === field;

  let body;
  if (token === "") {
    body = (
      <div className="form">
        <p className="err" role="alert">
          링크가 올바르지 않아요. 로그인 화면에서 재설정 메일을 다시 받아 주세요.
        </p>
        <Link className="btn btn--block" href="/login">
          로그인 화면으로
        </Link>
      </div>
    );
  } else if (state.kind === "done" || linkDead) {
    body = (
      <div className="form">
        <p className={state.kind === "done" ? "okmsg" : "err"} role={state.kind === "done" ? "status" : "alert"}>
          {state.kind === "done"
            ? (state.message ?? "비밀번호를 바꿨어요. 모든 기기에서 로그아웃됐으니 새 비밀번호로 로그인해 주세요.")
            : state.message}
        </p>
        <Link className="btn btn--block" href="/login" ref={loginRef}>
          로그인하러 가기
        </Link>
      </div>
    );
  } else {
    body = (
      <form className="form" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor={f("pw")}>
            새 비밀번호
          </label>
          <input
            className="field"
            id={f("pw")}
            type="password"
            autoComplete="new-password"
            maxLength={72}
            required
            ref={pwRef}
            aria-invalid={fieldError("password") || undefined}
            aria-describedby={fieldError("password") ? `${f("pw-h")} ${f("err")}` : f("pw-h")}
          />
          <p className="hint" id={f("pw-h")}>
            {PASSWORD_HINT}
          </p>
        </div>
        <div>
          <label className="label" htmlFor={f("pw2")}>
            새 비밀번호 확인
          </label>
          <input
            className="field"
            id={f("pw2")}
            type="password"
            autoComplete="new-password"
            maxLength={72}
            required
            ref={pw2Ref}
            aria-invalid={fieldError("passwordConfirm") || undefined}
            aria-describedby={fieldError("passwordConfirm") ? f("err") : undefined}
          />
        </div>
        <p className={`err ${s.msg}`} id={f("err")} role="alert">
          {state.kind === "failed" ? state.message : ""}
        </p>
        <button className="btn btn--block" type="submit" aria-disabled={state.kind === "sending"} aria-busy={state.kind === "sending" || undefined}>
          {state.kind === "sending" ? "바꾸는 중" : "비밀번호 바꾸기"}
        </button>
      </form>
    );
  }

  return (
    <section className="section section--compact" aria-labelledby={f("title")}>
      <div className="container auth">
        <div className="card">
          <div className="head">
            <h1 className="t-title" id={f("title")}>
              새 비밀번호 정하기
            </h1>
            <p className="t-lead t-desc">새 비밀번호로 바꾸면 모든 기기에서 로그아웃돼요.</p>
          </div>
          {body}
        </div>
      </div>
    </section>
  );
}
