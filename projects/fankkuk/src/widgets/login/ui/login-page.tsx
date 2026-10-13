"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { safeNextPath } from "@/entities/session/model/safe-next-path";
import { sendResetRequest } from "@/features/password-reset/api/reset-client";
import s from "./login.module.css";

// 로그인. 시안: docs/design/mockups/site/v18/login.html (가운데 카드 480 한 장)
// 아이디·비밀번호를 앱 서버(/api/auth/login)로 보낸다. 토큰은 서버가 HttpOnly 쿠키로만 쓰고 이 화면은 받지 않는다(INV-L1).
// 입력칸에 name 을 두지 않아 스크립트가 꺼진 채 기본 제출이 일어나도 값이 주소창에 실리지 않는다.
// 「로그인 상태 유지」는 아직 겉모양만 있다(지금은 늘 유지).
// 돌아갈 주소(next)는 주소창 값을 그대로 서버에 보내고, 서버가 검사해 돌려준 경로로만 간다(session-login INV-L13).
// 비밀번호 재설정은 아이디와 가입 이메일을 함께 보낸다(INV-L10). 응답은 언제나 같은 문구이고, 메일이 안 오면 1:1 문의로 안내한다.

type LoginResponse = { ok?: boolean; message?: string; next?: string };

export function LoginPage({ next }: { next?: string }) {
  const router = useRouter();
  const id = useId();
  const f = (name: string) => `${id}-${name}`;

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const requestReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (resetBusy) return;
    const form = e.currentTarget;
    const loginId = (form.elements.namedItem(f("reset-id")) as HTMLInputElement | null)?.value ?? "";
    const email = (form.elements.namedItem(f("reset-mail")) as HTMLInputElement | null)?.value ?? "";
    setResetBusy(true);
    setResetMsg(null);
    const r = await sendResetRequest(loginId, email);
    setResetBusy(false);
    setResetMsg({ ok: r.ok, text: r.message });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const loginId = (form.elements.namedItem(f("id")) as HTMLInputElement | null)?.value ?? "";
    const password = (form.elements.namedItem(f("pw")) as HTMLInputElement | null)?.value ?? "";
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, password, next }),
      });
      const body = (await res.json().catch(() => ({}))) as LoginResponse;
      if (res.ok) {
        // 서버가 검사해 돌려준 같은 사이트 경로로만 간다(INV-L13). 없으면 처음 화면(/) — 그곳이 로그인한 사람을 제 메인으로 보낸다.
        router.push(safeNextPath(body.next));
        router.refresh();
        return;
      }
      setError(body.message ?? "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } catch {
      setError("로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main id="main">
      <section className={s.page} aria-labelledby={f("title")}>
        <div className={`container auth ${s.box}`}>
          <div className="card">
            <div className="head">
              <img src="/img/icon-gift.png" alt="" aria-hidden="true" width={64} height={64} />
              <h1 className="t-title" id={f("title")}>
                로그인
              </h1>
              <p className="t-lead t-desc">다시 만나서 반가워요.</p>
            </div>
            <form className="form" onSubmit={onSubmit}>
              <div>
                <label className="label" htmlFor={f("id")}>
                  아이디
                </label>
                <input
                  className="field"
                  id={f("id")}
                  type="text"
                  autoComplete="username"
                  placeholder="아이디를 입력해 주세요"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? f("error") : undefined}
                />
              </div>
              <div>
                <label className="label" htmlFor={f("pw")}>
                  비밀번호
                </label>
                <input
                  className="field"
                  id={f("pw")}
                  type="password"
                  autoComplete="current-password"
                  placeholder="비밀번호를 입력해 주세요"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? f("error") : undefined}
                />
              </div>
              <label className="check">
                <input type="checkbox" /> 로그인 상태 유지
              </label>
              {error && (
                <p className="err" id={f("error")} role="alert">
                  {error}
                </p>
              )}
              <button className="btn btn--block" type="submit" aria-disabled={pending} aria-busy={pending || undefined}>
                로그인
              </button>
            </form>
            <details className={s.reset}>
              <summary>
                비밀번호를 잊으셨나요?
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <form className="form" onSubmit={requestReset} noValidate>
                <p className="t-desc">아이디와 가입할 때 적은 이메일을 넣으면, 확인된 이메일로 비밀번호 재설정 링크를 보내 드려요.</p>
                <div>
                  <label className="label" htmlFor={f("reset-id")}>
                    아이디
                  </label>
                  <input className="field" id={f("reset-id")} type="text" autoComplete="username" placeholder="아이디를 입력해 주세요" />
                </div>
                <div>
                  <label className="label" htmlFor={f("reset-mail")}>
                    가입 이메일
                  </label>
                  <input className="field" id={f("reset-mail")} type="email" autoComplete="email" placeholder="example@email.com" />
                </div>
                <p className={resetMsg && !resetMsg.ok ? "err" : "okmsg"} role="status">
                  {resetMsg?.text ?? ""}
                </p>
                {resetMsg?.ok && (
                  <p className="t-desc">
                    링크는 1시간 동안 한 번만 쓸 수 있어요. 메일이 오지 않으면{" "}
                    <Link className={s.link} href="/support">
                      1:1 문의
                    </Link>
                    로 알려 주세요.
                  </p>
                )}
                <button className="btn btn--line btn--block" type="submit" aria-disabled={resetBusy} aria-busy={resetBusy || undefined}>
                  {resetBusy ? "보내는 중" : "재설정 링크 보내기"}
                </button>
              </form>
            </details>
          </div>
          <p className="foot-line">
            아직 회원이 아니신가요? <Link href="/signup">회원가입</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
