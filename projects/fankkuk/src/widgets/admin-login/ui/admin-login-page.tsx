"use client";

import { useId, useState, type FormEvent } from "react";
import { adminNextPath } from "@/entities/session/model/admin-next-path";
import { LOGIN_NETWORK_ERROR } from "@/entities/session/model/login-messages";
import { Sentences } from "@/shared/ui/sentences";
import s from "./admin-login.module.css";

// 운영자 로그인 (admin-console INV-K13, UX 명세 docs/ux/pages/admin-login.md). 모양은 승인된 로그인 화면(design-rules 29·37절)을 그대로 쓴다.
// 아이디·비밀번호를 /api/auth/admin-login 으로 보낸다. 토큰은 서버가 HttpOnly 쿠키로만 쓰고 이 화면은 받지 않는다(session-login INV-L1).
// 입력칸에 name 을 두지 않아 스크립트가 꺼진 채 기본 제출이 일어나도 값이 주소창에 실리지 않는다.
// 「로그인 상태 유지」는 없다 — 운영자 세션은 브라우저를 닫으면 끝난다. 가입·비밀번호 찾기 입구도 없다(운영자 계정은 DB 에서만 만든다).

type LoginResponse = { ok?: boolean; message?: string; next?: string };

export function AdminLoginPage({ next }: { next?: string }) {
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
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, password, next }),
      });
      const body = (await res.json().catch(() => ({}))) as LoginResponse;
      if (res.ok) {
        // 서버가 정한 관리자 주소로만 간다. 페이지를 통째로 다시 읽는다 — 이 탭이 미리 받아 둔 화면이 이전 계정의 것일 수 있다(로그인 화면과 같은 이유)
        window.location.assign(adminNextPath(body.next));
        return;
      }
      setError(body.message ?? LOGIN_NETWORK_ERROR);
    } catch {
      setError(LOGIN_NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  return (
    <main id="main">
      <section className="auth-page" aria-labelledby={f("title")}>
        <div className={`container auth ${s.box}`}>
          <div className="head">
            <h1 className="t-title" id={f("title")}>
              팬꾹 운영자
            </h1>
          </div>
          <div className="card">
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
              {error && (
                <p className={`err ${s.alert}`} id={f("error")} role="alert">
                  <span className={s.msg}>
                    <Sentences text={error} />
                  </span>
                </p>
              )}
              <button className="btn btn--block" type="submit" aria-disabled={pending} aria-busy={pending || undefined}>
                로그인
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
