"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { Sentences } from "@/shared/ui/sentences";
import { sendResetRequest } from "../api/reset-client";
import s from "./reset-request.module.css";

// 비밀번호 재설정 요청 칸 — 아이디와 가입 이메일을 함께 보낸다(session-login INV-L10). 응답은 계정이 있든 없든 언제나 같은 문장이고(서버가 정한다),
// 메일이 안 오면 1:1 문의로 안내한다. 「비밀번호 찾기」(/password/forgot) 화면의 카드 안 내용이다 — 로그인 화면의 접는 칸에서 옮겨 왔다(design-rules 29절).
// 상태: 처음 · 보내는 중 · 오류(빈 칸·연결 실패 — 서버 문구) · 응답(늘 같은 초록 상자 + 1시간·1:1 문의 안내). 응답 뒤에도 다시 보낼 수 있다.
// 입력칸에 name 을 두지 않아 스크립트가 꺼진 채 기본 제출이 일어나도 값이 주소창에 실리지 않는다.

type Result = { ok: boolean; text: string };

export function ResetRequestForm() {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const loginId = (form.elements.namedItem(f("id")) as HTMLInputElement | null)?.value ?? "";
    const email = (form.elements.namedItem(f("mail")) as HTMLInputElement | null)?.value ?? "";
    setBusy(true);
    setResult(null);
    const r = await sendResetRequest(loginId, email);
    setBusy(false);
    setResult({ ok: r.ok, text: r.message });
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div>
        <label className="label" htmlFor={f("id")}>
          아이디
        </label>
        <input className="field" id={f("id")} type="text" autoComplete="username" placeholder="아이디를 입력해 주세요" />
      </div>
      <div>
        <label className="label" htmlFor={f("mail")}>
          가입 이메일
        </label>
        <input className="field" id={f("mail")} type="email" autoComplete="email" placeholder="example@email.com" />
      </div>
      <p className={result && !result.ok ? "err" : "okmsg"} role="status">
        {result ? <Sentences text={result.text} /> : null}
      </p>
      {result?.ok ? (
        <p className="t-desc">
          {"링크는 1시간 동안 한 번만 쓸\u00a0수\u00a0있어요."}
          <span className="brk">
            {" 메일이 오지 않으면 "}
            <Link className={`nw ${s.link}`} href="/support">
              1:1 문의
            </Link>
            {"로 알려\u00a0주세요."}
          </span>
        </p>
      ) : null}
      <button className="btn btn--block" type="submit" aria-disabled={busy} aria-busy={busy || undefined}>
        {busy ? "보내는 중" : "재설정 링크 보내기"}
      </button>
    </form>
  );
}
