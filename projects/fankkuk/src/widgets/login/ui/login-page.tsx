"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { safeNextPath } from "@/entities/session/model/safe-next-path";
import { KEEP_SIGNED_IN_DEFAULT } from "@/entities/session/model/keep-signed-in";
import { Sentences } from "@/shared/ui/sentences";
import s from "./login.module.css";

// 로그인. 시안: docs/design/mockups/site/part6-2026-10-25/login.html (머리는 카드 밖 위, 가운데 카드 480, 카드 아래 비밀번호 찾기 링크·가입 줄 — design-rules 29절)
// 아이디·비밀번호를 앱 서버(/api/auth/login)로 보낸다. 토큰은 서버가 HttpOnly 쿠키로만 쓰고 이 화면은 받지 않는다(INV-L1).
// 입력칸에 name 을 두지 않아 스크립트가 꺼진 채 기본 제출이 일어나도 값이 주소창에 실리지 않는다.
// 「로그인 상태 유지」는 고른 값을 keepSignedIn 으로 보낸다. 끄면 서버가 로그인 쿠키를 브라우저를 닫으면 지워지는 쿠키로 쓴다(session-login INV-L15).
// 돌아갈 주소(next)는 주소창 값을 그대로 서버에 보내고, 서버가 검사해 돌려준 경로로만 간다(session-login INV-L13).
// 비밀번호 재설정 요청은 이 화면에 두지 않는다 — 카드 아래 링크로 /password/forgot 에 간다(UX 명세 login.md 「바꿀 것」 2).
// notice: 서버가 고른 안내 하나 — 알림톡 로그인 링크를 못 씀(link-login INV-K4)·로그인 유지 기간으로 끝남(session-login INV-L17).
// 안내는 오류가 아니다 — 같은 자리에 알림(role=status)으로 보이고 칸에 aria-invalid 를 붙이지 않는다. 로그인을 누르면 지운다.

type LoginResponse = { ok?: boolean; message?: string; next?: string };

export function LoginPage({ next, notice }: { next?: string; notice?: string | null }) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const [pending, setPending] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(KEEP_SIGNED_IN_DEFAULT);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const loginId = (form.elements.namedItem(f("id")) as HTMLInputElement | null)?.value ?? "";
    const password = (form.elements.namedItem(f("pw")) as HTMLInputElement | null)?.value ?? "";
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, password, next, keepSignedIn }),
      });
      const body = (await res.json().catch(() => ({}))) as LoginResponse;
      if (res.ok) {
        // 서버가 검사해 돌려준 같은 사이트 경로로만 간다(INV-L13). 없으면 처음 화면(/) — 그곳이 로그인한 사람을 제 메인으로 보낸다.
        // 페이지를 통째로 다시 읽는다 — 이 탭이 미리 받아 둔 화면(링크에 마우스를 올렸을 때, 30초)이 이전 계정의 것일 수 있어서다. 로그아웃도 같은 방식이다(보안 리뷰 2026-10-18).
        window.location.assign(safeNextPath(body.next));
        return;
      }
      setError(body.message ?? "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } catch {
      setError("로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
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
              로그인
            </h1>
            <p className="t-lead t-desc">아이디와 비밀번호로 로그인해 주세요.</p>
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
              <label className="check">
                <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.currentTarget.checked)} /> 로그인 상태 유지
              </label>
              {info && !error && (
                // 안내 상자 — 오류 상자(.err)와 같은 자리·모양에 중립 색(사이트 토큰). 새 CSS 파일 없이 둔다
                <p role="status" style={{ padding: 16, borderRadius: "var(--r-btn)", background: "var(--surface)", color: "var(--ink)", fontWeight: "var(--fw-bold)" }}>
                  <Sentences text={info} />
                </p>
              )}
              {error && (
                // 잠김 안내처럼 두 문장이면 문장마다 줄(design-rules 29절 줄바꿈 3)
                <p className="err" id={f("error")} role="alert">
                  <Sentences text={error} />
                </p>
              )}
              <button className="btn btn--block" type="submit" aria-disabled={pending} aria-busy={pending || undefined}>
                로그인
              </button>
            </form>
          </div>
          <div className={s.under}>
            <Link className={s.link} href="/password/forgot">
              비밀번호를 잊으셨나요?
            </Link>
          </div>
          <p className="foot-line">
            아직 회원이 아니신가요? <Link href="/signup">회원가입</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
