"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { CURRENT_PASSWORD_EMPTY } from "@/entities/session/model/password-rule";
import { ConfirmDialog } from "@/shared/ui/step-dialog";
import { sendWithdrawSelf } from "../api/withdraw-self-client";
import type { WithdrawLink } from "../model/withdraw-self";
import s from "./withdraw-self.module.css";

// 계정 설정의 「회원 탈퇴」 칸 안쪽(my-account INV-A17). 팬 계정 설정(/me)과 크리에이터 계정 설정(/creator/settings#leave)이 같이 쓴다.
// 지워지는 것·남는 것 두 줄(INV-A15·A16) → 지금 비밀번호 → 빨간 「탈퇴」(design-rules 41절 — 빨강은 회원 탈퇴 하나) → 확인 질문(되돌릴 수 없음) → 서버.
// 판정은 서버가 한다. 막히면 서버가 준 이유와 링크를 보여 주고, 끝나면 첫 화면으로 새로 연다(로그인 쿠키는 서버가 지웠다).

type Failure = { message: string; links: WithdrawLink[]; field: boolean };

const ERASED: Record<"fan" | "creator", string> = {
  fan: "닉네임·연락처·주소·프로필(사진·배경 사진·소개)은 바로 삭제됩니다.",
  creator: "이름·닉네임·연락처·주소·채널 정보와 프로필(사진·배경 사진·소개)은 바로 삭제됩니다.",
};

export function WithdrawSelfPanel({ role, onLoginExpired }: { role: "fan" | "creator"; onLoginExpired: () => void }) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const [password, setPassword] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fail = (next: Failure) => {
    setFailure(next);
    if (next.field) inputRef.current?.focus();
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    if (password === "") return fail({ message: CURRENT_PASSWORD_EMPTY, links: [], field: true });
    setFailure(null);
    setAsking(true);
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    const r = await sendWithdrawSelf(password);
    if (r.kind === "ok") {
      // 화면에 남은 로그인 상태(헤더·캐시)를 버리고 첫 화면을 새로 연다
      window.location.assign("/");
      return;
    }
    setBusy(false);
    setAsking(false);
    if (r.kind === "login") return onLoginExpired();
    if (r.field) setPassword("");
    fail({ message: r.message, links: r.links, field: r.field !== null });
  };

  const invalid = failure?.field === true;
  return (
    <form className={s.panel} id={f("panel")} onSubmit={onSubmit} aria-label="회원 탈퇴" noValidate>
      <ul className={s.facts}>
        <li>{ERASED[role]}</li>
        <li>주문·결제 기록은 주문번호만 남겨 정해진 기간 동안 보관합니다.</li>
      </ul>
      <div className={`field ${s.field}`}>
        <label htmlFor={f("pw")}>현재 비밀번호</label>
        <input
          ref={inputRef}
          className="input"
          id={f("pw")}
          type="password"
          autoComplete="current-password"
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? f("err") : undefined}
        />
      </div>
      <div className={s.error} id={f("err")} role="alert">
        {failure ? (
          <>
            <p className={s.errText}>{failure.message}</p>
            {failure.links.length > 0 ? (
              <ul className={s.links}>
                {failure.links.map((l) => (
                  <li key={l.href}>
                    <Link className="btn btn--line btn--sm" href={l.href}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
      <div className={s.actions}>
        <button className={`btn ${s.danger}`} type="submit" aria-disabled={busy || undefined}>
          탈퇴
        </button>
      </div>
      <ConfirmDialog open={asking} title="탈퇴할까요?" description="탈퇴하면 되돌릴 수 없습니다." onCancel={() => !busy && setAsking(false)}>
        <button className="btn btn--line" type="button" disabled={busy} onClick={() => setAsking(false)}>
          닫기
        </button>
        <button className={`btn ${s.danger}`} type="button" onClick={() => void confirm()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
          {busy ? "탈퇴 중" : "탈퇴"}
        </button>
      </ConfirmDialog>
    </form>
  );
}
