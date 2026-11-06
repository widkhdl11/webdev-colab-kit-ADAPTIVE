"use client";

import Link from "next/link";
import { useState } from "react";
import { PhoneResetForm } from "@/features/password-reset/ui/phone-reset-form";
import s from "./password-forgot.module.css";

// 비밀번호 찾기 /password/forgot — UX 명세 docs/ux/pages/password-forgot.md(2026-11-06 휴대폰 인증번호 방식).
// 로그인과 같은 틀(design-rules 29절): 머리(제목 · 설명)는 카드 밖 위 가운데 → 가운데 카드 480(번호 → 인증번호 → 새 비밀번호) → 아래 「로그인으로 돌아가기」.
// 카드 안 세 단계는 feature 의 PhoneResetForm 이 한다(session-login INV-L10·L11). 다 바꾸면 카드 안의 「로그인」이 다음 행동이라 아래 줄은 숨긴다.

export function PasswordForgotPage() {
  const [done, setDone] = useState(false);
  return (
    <main id="main">
      <section className="auth-page" aria-labelledby="forgot-title">
        <div className={`container auth ${s.box}`}>
          <div className="head">
            <h1 className="t-title" id="forgot-title">
              비밀번호 찾기
            </h1>
            <p className="t-lead t-desc">{"가입한 휴대폰 번호로 인증번호를 받아 새 비밀번호를 정합니다."}</p>
          </div>
          <div className="card">
            <PhoneResetForm onDone={() => setDone(true)} />
          </div>
          {done ? null : (
            <p className={s.under}>
              <Link href="/login">로그인으로 돌아가기</Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
