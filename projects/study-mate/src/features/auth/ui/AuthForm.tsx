"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/shared/ui/button/Button";
import { FormCard } from "@/shared/ui/form-page";
import type { ActionResult } from "@/shared/lib/action-result";
import { signInAction, signUpAction } from "../api/auth-actions";
import styles from "./auth-form.module.css";

type Mode = "login" | "signup";

const COPY = {
  login: {
    title: "로그인",
    sub: "스터디에 신청하고 대화를 이어가려면 로그인이 필요합니다.",
    submit: "로그인",
    pending: "로그인하는 중…",
    footText: "아직 계정이 없으신가요?",
    footHref: "/signup",
    footLink: "회원가입",
  },
  signup: {
    title: "회원가입",
    sub: "이름과 이메일이면 시작할 수 있습니다.",
    submit: "가입하고 시작하기",
    pending: "가입하는 중…",
    footText: "이미 계정이 있으신가요?",
    footHref: "/login",
    footLink: "로그인",
  },
} as const;

/**
 * 로그인·회원가입 한 벌. 두 화면의 차이가 입력칸 하나와 문구뿐이라 같은 조각을 쓴다 —
 * 두 벌로 두면 한쪽만 고쳐지는 날이 온다.
 */
export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const copy = COPY[mode];
  const [result, submit, pending] = useActionState<ActionResult<null> | null, FormData>(
    mode === "login" ? signInAction : signUpAction,
    null,
  );

  return (
    <div className={styles.page}>
      <h1 className={`h-display ${styles.title}`}>{copy.title}</h1>
      <p className={styles.sub}>{copy.sub}</p>

      <FormCard>
        <form action={submit}>
          {/* 돌아갈 곳. 이 값은 주소창에서 오므로 서버가 다시 판정한다 (INV-A6) */}
          <input type="hidden" name="next" value={next} />

          {result && !result.ok ? (
            <p className={styles.error} role="alert">
              {result.message}
            </p>
          ) : null}

          {mode === "signup" ? (
            <div className={styles.field}>
              <label htmlFor="username">이름</label>
              <input
                id="username"
                name="username"
                type="text"
                required
                maxLength={20}
                autoComplete="nickname"
                placeholder="스터디에서 불릴 이름"
              />
            </div>
          ) : null}

          <div className={styles.field}>
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "signup" ? "6자 이상" : ""}
            />
            {mode === "signup" ? <p className={styles.hint}>6자 이상으로 정해 주세요.</p> : null}
          </div>

          <Button tone="ink" size="lg" block type="submit" disabled={pending}>
            {pending ? copy.pending : copy.submit}
          </Button>
        </form>

        <p className={styles.foot}>
          {copy.footText} <Link href={copy.footHref}>{copy.footLink}</Link>
        </p>
      </FormCard>
    </div>
  );
}
