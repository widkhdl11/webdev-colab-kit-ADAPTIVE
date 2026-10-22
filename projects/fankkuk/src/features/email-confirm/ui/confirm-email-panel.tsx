"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postEmailConfirm } from "../api/confirm-email-client";
import s from "./confirm-email.module.css";

// 확인 메일 링크로 연 화면. 시안: docs/design/mockups/site/pilot-2026-10-22/email-confirm.html(.ec-*, design-rules 27절 「4파트 나머지 다섯 화면」, 카드 d115).
// 상자 없이 제목(h1) 하나 + 문장(폭 560) + 버튼. 제목은 이 패널이 그린다 — 역할마다 화면에 h1 이 하나만 있게(라우트는 제목을 따로 그리지 않는다).
// 버튼을 눌러야 바뀐다 — 링크를 여는 것만으로는 아무것도 바뀌지 않는다(메일 검사기가 미리 열어도 안전하게).
// 알림 칸 둘은 늘 두고 글자만 바꾼다(새로 생긴 칸은 화면 읽기 프로그램이 읽지 않는 경우가 있다).
// 결과가 나오면 버튼이 링크로 바뀌므로 포커스를 그 링크로 옮긴다 — 안 옮기면 포커스가 페이지 처음으로 떨어진다.

type State = { kind: "ready" } | { kind: "sending" } | { kind: "done"; email: string } | { kind: "failed"; message: string };

function Title() {
  return <h1 className="ph-title">이메일 확인</h1>;
}

export function ConfirmEmailPanel({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "ready" });
  const nextRef = useRef<HTMLAnchorElement>(null);
  const finished = state.kind === "done" || state.kind === "failed";

  useEffect(() => {
    if (finished) nextRef.current?.focus();
  }, [finished]);

  const confirm = async () => {
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    const outcome = await postEmailConfirm(token);
    setState(outcome.kind === "ok" ? { kind: "done", email: outcome.email } : outcome);
  };

  return (
    <div className={s.wrap} data-email-confirm="">
      <Title />
      <div className={s.body}>
        {state.kind !== "done" && <p className={s.text}>버튼을 누르면 확인 메일을 받은 주소가 내 계정의 이메일이 돼요.</p>}
        <p className={`${s.text} ${s.ok}`} role="status">
          {state.kind === "done" ? (
            <>
              <svg width="24" height="24" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <circle cx="10" cy="10" r="10" fill="currentColor" />
                <path d="m5 10 3 3 7-7" fill="none" stroke="var(--white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {`이메일 주소(${state.email})를 확인했어요.`}
            </>
          ) : (
            ""
          )}
        </p>
        <p className={`err ${s.msg}`} role="alert">
          {state.kind === "failed" ? state.message : ""}
        </p>
        <div className={`btnrow ${s.actions}`}>
          {finished ? (
            <Link className="btn" href="/me" ref={nextRef}>
              내 팬꾹으로 가기
            </Link>
          ) : (
            <button className="btn" type="button" onClick={confirm} aria-disabled={state.kind === "sending"} aria-busy={state.kind === "sending"}>
              {state.kind === "sending" ? "확인하는 중" : "이 주소 확인하기"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 로그인하지 않고 링크를 연 경우 — 같은 자리(제목 아래 문장)에 로그인 안내만 둔다
export function ConfirmEmailSignInNotice({ loginHref }: { loginHref: string }) {
  return (
    <div className={s.wrap} data-email-confirm="">
      <Title />
      <div className={s.body}>
        <p className={s.text}>
          메일을 받은 계정으로{" "}
          <Link className="t-strong" href={loginHref}>
            로그인
          </Link>
          한 뒤, 메일의 링크를 다시 눌러 주세요.
        </p>
      </div>
    </div>
  );
}
