"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, type FormEvent } from "react";
import s from "./login.module.css";

// 로그인. 시안: docs/design/mockups/site/v4/login.html
// 겉모양만 있다 — 로그인 방식은 아직 결정 대기라 실제 확인을 붙이지 않는다. 「로그인」은 메인(/home)으로 넘어가기만 한다.
// 입력값은 읽지도 보내지도 않는다. 입력칸에 name 을 두지 않아 폼 기본 제출이 일어나도 값이 주소창에 실리지 않는다.

export function LoginPage() {
  const router = useRouter();
  const id = useId();
  const f = (name: string) => `${id}-${name}`;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    router.push("/home");
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
              <input className="input" id={f("id")} type="text" autoComplete="username" placeholder="아이디를 입력해 주세요" />
            </div>
            <div className="field">
              <label htmlFor={f("pw")}>비밀번호</label>
              <input className="input" id={f("pw")} type="password" autoComplete="current-password" placeholder="비밀번호를 입력해 주세요" />
            </div>
            <label className={s.check}>
              <input type="checkbox" /> 로그인 상태 유지
            </label>
            <button className="btn btn--block" type="submit">
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
