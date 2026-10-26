"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PASSWORD_HINT } from "@/entities/session/model/password-rule";
import { Sentences } from "@/shared/ui/sentences";
import { sendNewPassword, type NewPasswordField } from "../api/reset-client";
import { FORGOT_PATH, FORGOT_SCREEN_NAME, RESET_NO_TOKEN } from "../model/reset-messages";
import s from "./reset-password.module.css";

// 재설정 메일의 링크로 연 화면(session-login INV-L11). 시안: docs/design/mockups/site/part6-2026-10-25/password-reset.html (머리는 카드 밖, 가운데 카드 480 — design-rules 29절).
// 새 비밀번호를 적고 저장해야 바뀐다 — 링크를 여는 것만으로는 아무것도 바뀌지 않는다.
// 링크 값의 꼴·만료·한 번만 쓰기는 서버와 DB 가 본다. 이 화면은 값을 저장 요청에 실어 보내기만 한다.
// 바뀌면 이 계정의 모든 기기에서 로그아웃되므로 로그인으로 안내하고, 로그인 링크로 포커스를 옮긴다.
// 링크가 없거나 죽었으면 「비밀번호 찾기」(/password/forgot)에서 메일을 다시 받게 한다. 저장해 본 뒤 죽은 것이 드러나면 그 링크로 포커스를 옮기고,
// 처음부터 링크가 없으면 옮기지 않는다 — 화면을 열자마자 포커스를 옮기지 않는다(접근성 관례).
// 저장이 실패하면 틀린 칸 바로 아래에 「!」 줄(가입 2단계와 같은 모양)을 띄우고 그 칸으로 포커스를 옮긴다(aria-describedby 로 그 줄을 가리킨다).
// 칸을 모르는 실패(연결 실패 등)는 버튼 위 상자 — 포커스는 새 비밀번호 칸.

type State =
  | { kind: "ready" }
  | { kind: "sending" }
  | { kind: "done"; message: string | null }
  | {
      kind: "failed";
      field: NewPasswordField | null;
      message: string;
      at: number;
    };

const DONE_MESSAGE = "비밀번호가 변경되어 모든 기기에서 로그아웃되었습니다. 새\u00a0비밀번호로 로그인해\u00a0주세요.";
const KEEP = [FORGOT_SCREEN_NAME] as const;

export function ResetPasswordPanel({ token }: { token: string }) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const [state, setState] = useState<State>({ kind: "ready" });
  const nextRef = useRef<HTMLAnchorElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const pw2Ref = useRef<HTMLInputElement>(null);
  const linkDead = state.kind === "failed" && state.field === "link";
  // 오류 줄이 붙는 칸 — 서버가 칸을 알려 준 실패만. 칸을 모르면 상자에 띄우고 포커스는 새 비밀번호 칸
  const lineField: "password" | "passwordConfirm" | null =
    state.kind === "failed" && (state.field === "password" || state.field === "passwordConfirm") ? state.field : null;
  const boxFailed = state.kind === "failed" && state.field === null;
  const focusField = lineField ?? (boxFailed ? "password" : null);
  const failedAt = state.kind === "failed" ? state.at : 0;

  useEffect(() => {
    if (state.kind === "done" || linkDead) nextRef.current?.focus();
  }, [state.kind, linkDead]);

  useEffect(() => {
    if (focusField) (focusField === "passwordConfirm" ? pw2Ref : pwRef).current?.focus();
  }, [focusField, failedAt]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state.kind === "sending") return;
    const form = e.currentTarget;
    const password = (form.elements.namedItem(f("pw")) as HTMLInputElement | null)?.value ?? "";
    const confirm = (form.elements.namedItem(f("pw2")) as HTMLInputElement | null)?.value ?? "";
    setState({ kind: "sending" });
    const r = await sendNewPassword(token, password, confirm);
    setState(
      r.ok
        ? { kind: "done", message: r.message }
        : {
            kind: "failed",
            field: r.field,
            message: r.message,
            at: Date.now(),
          },
    );
  };

  /** 칸 바로 아래 「!」 줄 */
  const badLine = (field: "password" | "passwordConfirm", lineId: string) =>
    lineField === field && state.kind === "failed" ? (
      <p className={s.bad} id={lineId} role="alert" key={failedAt}>
        {state.message}
      </p>
    ) : null;
  const describedBy = (field: "password" | "passwordConfirm", hintId: string | null, lineId: string) =>
    [hintId, lineField === field ? lineId : null, boxFailed && field === "password" ? f("err") : null].filter(Boolean).join(" ") ||
    undefined;
  const invalid = (field: "password" | "passwordConfirm") => (focusField === field ? true : undefined);

  // 링크가 없거나 죽었을 때 — 같은 모양(상자 + 채운 버튼 하나), 버튼은 비밀번호 찾기로
  const deadLink = (message: string) => (
    <div className="form">
      <p className="err" role="alert">
        <Sentences text={message} keep={KEEP} />
      </p>
      <Link className="btn btn--block" href={FORGOT_PATH} ref={nextRef}>
        {"재설정\u00a0메일 다시 받기"}
      </Link>
    </div>
  );

  let body;
  if (token === "") {
    body = deadLink(RESET_NO_TOKEN);
  } else if (state.kind === "failed" && linkDead) {
    body = deadLink(state.message);
  } else if (state.kind === "done") {
    body = (
      <div className="form">
        <p className="okmsg" role="status">
          <Sentences text={state.message ?? DONE_MESSAGE} />
        </p>
        <Link className="btn btn--block" href="/login" ref={nextRef}>
          로그인
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
            aria-invalid={invalid("password")}
            aria-describedby={describedBy("password", f("pw-h"), f("pw-m"))}
          />
          {badLine("password", f("pw-m"))}
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
            aria-invalid={invalid("passwordConfirm")}
            aria-describedby={describedBy("passwordConfirm", null, f("pw2-m"))}
          />
          {badLine("passwordConfirm", f("pw2-m"))}
        </div>
        <p className="err" id={f("err")} role="alert">
          {boxFailed && state.kind === "failed" ? <Sentences text={state.message} /> : null}
        </p>
        <button
          className="btn btn--block"
          type="submit"
          aria-disabled={state.kind === "sending"}
          aria-busy={state.kind === "sending" || undefined}
        >
          {state.kind === "sending" ? "변경 중" : "비밀번호 변경"}
        </button>
      </form>
    );
  }

  return (
    <section className="auth-page" aria-labelledby={f("title")}>
      <div className={`container auth ${s.box}`}>
        <div className="head">
          <h1 className="t-title" id={f("title")}>
            비밀번호 재설정
          </h1>
          <p className="t-lead t-desc">{"비밀번호를 재설정하면 모든 기기에서 로그아웃됩니다."}</p>
        </div>
        <div className="card">{body}</div>
      </div>
    </section>
  );
}
