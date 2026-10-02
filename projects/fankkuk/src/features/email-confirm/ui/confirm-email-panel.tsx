"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postEmailConfirm } from "../api/confirm-email-client";
import s from "./confirm-email.module.css";

// 확인 메일 링크로 연 화면. 버튼을 눌러야 바뀐다 — 링크를 여는 것만으로는 아무것도 바뀌지 않는다(메일 검사기가 미리 열어도 안전하게).
// 알림 칸 둘은 늘 두고 글자만 바꾼다(새로 생긴 칸은 화면 읽기 프로그램이 읽지 않는 경우가 있다).
// 결과가 나오면 버튼이 링크로 바뀌므로 포커스를 그 링크로 옮긴다 — 안 옮기면 포커스가 페이지 처음으로 떨어진다.

type State = { kind: "ready" } | { kind: "sending" } | { kind: "done"; email: string } | { kind: "failed"; message: string };

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
    <section className={s.card} aria-labelledby="confirm-email-h">
      <h2 className={s.h} id="confirm-email-h">
        이메일 확인
      </h2>
      {state.kind !== "done" && <p className={s.msg}>버튼을 누르면 확인 메일을 받은 주소가 내 정보의 이메일이 돼요.</p>}
      <p className={s.msg} role="status">
        {state.kind === "done" ? `이메일을 새 주소(${state.email})로 바꿨어요.` : ""}
      </p>
      <p className={s.error} role="alert">
        {state.kind === "failed" ? state.message : ""}
      </p>
      <div className={`row ${s.actions}`}>
        {finished ? (
          <Link className="btn" href="/me" ref={nextRef}>
            내 정보로 가기
          </Link>
        ) : (
          <button className="btn" type="button" onClick={confirm} aria-disabled={state.kind === "sending"} aria-busy={state.kind === "sending"}>
            {state.kind === "sending" ? "확인하는 중" : "이 주소로 바꾸기"}
          </button>
        )}
      </div>
    </section>
  );
}
