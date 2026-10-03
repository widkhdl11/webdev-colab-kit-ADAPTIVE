"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import s from "./login.module.css";

// 로그인. 시안: docs/design/mockups/site/v4/login.html
// 아이디·비밀번호를 앱 서버(/api/auth/login)로 보낸다. 토큰은 서버가 HttpOnly 쿠키로만 쓰고 이 화면은 받지 않는다(INV-L1).
// 입력칸에 name 을 두지 않아 스크립트가 꺼진 채 기본 제출이 일어나도 값이 주소창에 실리지 않는다.
// 「로그인 상태 유지」·비밀번호 재설정은 계정 스펙 몫이라 아직 겉모양만 있다(지금은 늘 유지).

type LoginResponse = { ok?: boolean; message?: string };

export function LoginPage() {
  const router = useRouter();
  const id = useId();
  const f = (name: string) => `${id}-${name}`;

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
        body: JSON.stringify({ loginId, password }),
      });
      if (res.ok) {
        // 첫 화면은 역할마다 다르다 — 이 화면은 역할을 모르므로 처음 화면(/)에 맡긴다. 그곳이 로그인한 사람을 제 메인으로 보낸다.
        router.push("/");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as LoginResponse;
      setError(body.message ?? "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } catch {
      setError("로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main id="main">
      <div className="container">
        <section className={s.auth} aria-labelledby={f("title")}>
          <div className={s["tile-ico"]}>
            <img className="asset" src="/img/icon-gift.png" alt="" aria-hidden="true" width={72} height={72} />
          </div>
          <h1 className="page-h" id={f("title")}>
            로그인
          </h1>
          <p className="lead">다시 만나서 반가워요.</p>
          <form className={s.form} onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor={f("id")}>아이디</label>
              <input
                className="input"
                id={f("id")}
                type="text"
                autoComplete="username"
                placeholder="아이디를 입력해 주세요"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? f("error") : undefined}
              />
            </div>
            <div className="field">
              <label htmlFor={f("pw")}>비밀번호</label>
              <input
                className="input"
                id={f("pw")}
                type="password"
                autoComplete="current-password"
                placeholder="비밀번호를 입력해 주세요"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? f("error") : undefined}
              />
            </div>
            <label className={s.check}>
              <input type="checkbox" /> 로그인 상태 유지
            </label>
            {error && (
              <p className={s.error} id={f("error")} role="alert">
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
              <svg className={s.chev} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className={s["reset-body"]}>
              <p className="sub">가입할 때 적은 이메일로 비밀번호 재설정 링크를 보내 드려요.</p>
              <div className="field">
                <label htmlFor={f("reset-mail")}>가입 이메일</label>
                <input className="input" id={f("reset-mail")} type="email" autoComplete="email" placeholder="example@email.com" />
              </div>
              <button className="btn btn--soft btn--block" type="button">
                재설정 링크 보내기
              </button>
            </div>
          </details>
          <p className={s["signup-line"]}>
            아직 회원이 아니신가요?{" "}
            <Link className={s.link} href="/signup">
              회원가입
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
