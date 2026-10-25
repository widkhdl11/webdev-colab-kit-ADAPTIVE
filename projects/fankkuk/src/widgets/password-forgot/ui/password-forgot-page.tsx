import Link from "next/link";
import { ResetRequestForm } from "@/features/password-reset/ui/reset-request-form";
import s from "./password-forgot.module.css";

// 비밀번호 찾기 /password/forgot — 시안 docs/design/mockups/site/part6-2026-10-25/password-forgot.html · UX 명세 docs/ux/pages/password-forgot.md.
// 로그인과 같은 틀(design-rules 29절): 머리(제목 · 설명)는 카드 밖 위 가운데 → 가운데 카드 480(아이디 · 가입 이메일 · 「재설정 링크 보내기」) → 아래 「로그인으로 돌아가기」.
// 요청과 응답은 feature 의 요청 칸이 한다(session-login INV-L10 — 늘 같은 응답).

export function PasswordForgotPage() {
  return (
    <main id="main">
      <section className={s.page} aria-labelledby="forgot-title">
        <div className={`container auth ${s.box}`}>
          <div className="head">
            <h1 className="t-title" id="forgot-title">
              비밀번호 찾기
            </h1>
            <p className="t-lead t-desc">
              {"아이디와 가입할 때 적은 이메일을 넣으면, 확인된\u00a0이메일로 "}
              <span className="nw">{"비밀번호 재설정\u00a0링크"}</span>
              {"를 보내\u00a0드려요."}
            </p>
          </div>
          <div className="card">
            <ResetRequestForm />
          </div>
          <p className={s.under}>
            <Link href="/login">로그인으로 돌아가기</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
