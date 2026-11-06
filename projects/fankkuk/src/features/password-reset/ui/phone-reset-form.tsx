"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { PHONE_CODE_EXPIRED_MESSAGE, PHONE_CODE_TTL_SECONDS } from "@/entities/session/model/phone-code";
import { PASSWORD_HINT } from "@/entities/session/model/password-rule";
import { SITE_INFO } from "@/shared/config/site-info";
import { useCountdown } from "@/shared/lib/time/use-countdown";
import { Sentences } from "@/shared/ui/sentences";
import { checkResetCode, requestResetCode, sendNewPassword } from "../api/reset-client";
import s from "./phone-reset.module.css";

// 비밀번호 찾기 카드(/password/forgot) — 휴대폰 번호 → 인증번호 → 새 비밀번호, 한 카드 안의 세 단계(session-login INV-L10·L11).
// UX 명세 docs/ux/pages/password-forgot.md 상태표가 정본이다(phone_* · code_* · new_password · saving · password_error · ticket_expired · done).
// 받기 응답은 가입 여부와 상관없이 서버가 준 같은 문장이고(INV-L10), 판정(인증번호·표·비밀번호 규칙)은 모두 서버가 한다.
// 인증번호 칸·남은 시간·틀림 문장은 가입 3단계(widgets/signup)와 같은 모양·같은 서버 문장이다 — 가입 화면의 칸은 그 화면 안에 묶여 있어 같은 꼴로 따로 그린다.
// 지난 단계의 칸은 다음 단계에서 지운다 — 번호·인증번호가 새 비밀번호 단계에 남지 않는다. 표는 서버가 쿠키로만 다룬다.
// 단계마다 채운 버튼 하나. 포커스: 인증번호를 보내면 인증번호 칸, 맞으면 새 비밀번호 칸, 표가 죽으면 「처음부터」, 끝나면 「로그인」.

type Stage = "phone" | "code" | "password" | "expired" | "done";
type FieldKey = "phone" | "code" | "pw" | "pw2";
type Problem = { at: FieldKey | "box"; message: string } | null;

export function PhoneResetForm({ onDone }: { onDone?: () => void }) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const [stage, setStage] = useState<Stage>("phone");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [problem, setProblem] = useState<Problem>(null);
  const [locked, setLocked] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [focusTo, setFocusTo] = useState<{ key: FieldKey | "restart" | "login" } | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const pw2Ref = useRef<HTMLInputElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);
  const loginRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!focusTo) return;
    const target = { phone: phoneRef, code: codeRef, pw: pwRef, pw2: pw2Ref, restart: restartRef, login: loginRef }[focusTo.key];
    target.current?.focus();
  }, [focusTo]);

  const countdown = useCountdown(stage === "code" ? expiresAt : null, PHONE_CODE_TTL_SECONDS);
  const expired = stage === "code" && countdown.expired;

  const fail = (at: FieldKey | "box", message: string) => {
    setProblem({ at, message });
    setFocusTo({ key: at === "box" ? (stage === "password" ? "pw" : "phone") : at });
  };

  const sendCode = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const r = await requestResetCode(phone);
    setBusy(false);
    if (!r.ok) return fail(r.where === "field" ? "phone" : "box", r.message);
    setStage("code");
    setCode("");
    setLocked(false);
    setSentMessage(r.message);
    setExpiresAt(Date.now() + PHONE_CODE_TTL_SECONDS * 1000);
    setFocusTo({ key: "code" });
  };

  const confirmCode = async () => {
    if (busy || expired || locked) return;
    setBusy(true);
    setProblem(null);
    const r = await checkResetCode(phone, code);
    setBusy(false);
    if (!r.ok) {
      if (r.reason === "locked" || r.reason === "invalid") setLocked(true);
      if (r.reason === "expired") setExpiresAt(Date.now());
      return fail("code", r.message);
    }
    // 지난 단계의 칸을 지운다
    setPhone("");
    setCode("");
    setSentMessage("");
    setExpiresAt(null);
    setStage("password");
    setFocusTo({ key: "pw" });
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const r = await sendNewPassword(pw, pw2);
    setBusy(false);
    if (r.ok) {
      setPw("");
      setPw2("");
      setDoneMessage(r.message);
      setStage("done");
      setFocusTo({ key: "login" });
      onDone?.();
      return;
    }
    if (r.field === "ticket") {
      setPw("");
      setPw2("");
      setProblem({ at: "box", message: r.message });
      setStage("expired");
      setFocusTo({ key: "restart" });
      return;
    }
    fail(r.field === "password" ? "pw" : r.field === "passwordConfirm" ? "pw2" : "box", r.message);
  };

  const restart = () => {
    setStage("phone");
    setPhone("");
    setCode("");
    setProblem(null);
    setLocked(false);
    setFocusTo({ key: "phone" });
  };

  const onPhoneChange = (value: string) => {
    setPhone(value);
    // 인증번호 단계에서 번호를 고치면 처음 단계로(UX 명세 code_sent → phone_idle)
    if (stage === "code") {
      setStage("phone");
      setCode("");
      setSentMessage("");
      setExpiresAt(null);
      setLocked(false);
    }
    if (problem) setProblem(null);
  };

  const onEnter = (next: () => Promise<void>) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void next();
  };

  const lineOf = (key: FieldKey) => (problem?.at === key ? problem.message : key === "code" && expired && !locked ? PHONE_CODE_EXPIRED_MESSAGE : null);
  const line = (key: FieldKey) => {
    const message = lineOf(key);
    return message ? (
      <p className={`${s.live} ${s.bad}`} id={f(`${key}-m`)} role="alert">
        <span>{message}</span>
      </p>
    ) : null;
  };
  const invalid = (key: FieldKey) => (lineOf(key) ? true : undefined);
  const describedBy = (key: FieldKey, hint?: string) => [hint, lineOf(key) ? f(`${key}-m`) : null].filter(Boolean).join(" ") || undefined;
  const box =
    problem?.at === "box" ? (
      <p className={`err ${s.alert}`} role="alert">
        <span className={s.msg}>
          <Sentences text={problem.message} />
        </span>
      </p>
    ) : null;

  if (stage === "done") {
    return (
      <div className="form">
        <div className={`okmsg ${s.done}`} role="status">
          <p className={s.strong}>비밀번호를 바꿨습니다.</p>
          <p>
            <Sentences text={doneMessage ?? "모든 기기에서 로그아웃됐습니다. 새 비밀번호로 로그인해 주세요."} />
          </p>
        </div>
        <Link className="btn btn--block" href="/login" ref={loginRef}>
          로그인
        </Link>
      </div>
    );
  }

  if (stage === "expired") {
    return (
      <div className="form">
        {box}
        <button className="btn btn--block" type="button" ref={restartRef} onClick={restart}>
          처음부터
        </button>
      </div>
    );
  }

  if (stage === "password") {
    return (
      <div className="form">
        <p className={`${s.live} ${s.ok}`} role="status">
          <span>휴대폰 번호를 확인했습니다.</span>
        </p>
        <div>
          <label className="label" htmlFor={f("pw")}>
            새 비밀번호
          </label>
          <input
            ref={pwRef}
            className="field"
            id={f("pw")}
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={pw}
            onChange={(e) => setPw(e.currentTarget.value)}
            onKeyDown={onEnter(save)}
            aria-invalid={invalid("pw")}
            aria-describedby={describedBy("pw", f("pw-h"))}
          />
          {line("pw")}
          <p className="hint" id={f("pw-h")}>
            {PASSWORD_HINT}
          </p>
        </div>
        <div>
          <label className="label" htmlFor={f("pw2")}>
            새 비밀번호 확인
          </label>
          <input
            ref={pw2Ref}
            className="field"
            id={f("pw2")}
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={pw2}
            onChange={(e) => setPw2(e.currentTarget.value)}
            onKeyDown={onEnter(save)}
            aria-invalid={invalid("pw2")}
            aria-describedby={describedBy("pw2")}
          />
          {line("pw2")}
        </div>
        {box}
        <button className="btn btn--block" type="button" aria-disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>
          {busy ? "바꾸는 중" : "비밀번호 바꾸기"}
        </button>
      </div>
    );
  }

  // phone · code 단계 — 번호 칸은 두 단계에 다 있다(값 유지)
  return (
    <div className="form">
      <div>
        <label className="label" htmlFor={f("phone")}>
          휴대폰 번호
        </label>
        <input
          ref={phoneRef}
          className="field"
          id={f("phone")}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="010-0000-0000"
          maxLength={13}
          value={phone}
          onChange={(e) => onPhoneChange(e.currentTarget.value)}
          onKeyDown={onEnter(sendCode)}
          aria-invalid={invalid("phone")}
          aria-describedby={describedBy("phone")}
        />
        {line("phone")}
      </div>
      {stage === "code" ? (
        <>
          <p className="okmsg" role="status">
            {sentMessage}
          </p>
          <div>
            <label className="label" htmlFor={f("code")}>
              인증번호
            </label>
            <div className={s.code}>
              <input
                ref={codeRef}
                className="field"
                id={f("code")}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6자리 숫자"
                value={code}
                disabled={locked}
                onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={onEnter(confirmCode)}
                aria-invalid={invalid("code")}
                aria-describedby={describedBy("code")}
              />
              <span className={expired ? `${s.timer} ${s.zero}` : s.timer} role="timer" aria-label="남은 시간">
                {countdown.text}
              </span>
            </div>
            {line("code")}
          </div>
          {box}
          <button
            className="btn btn--block"
            type="button"
            aria-disabled={busy || expired || locked}
            aria-busy={busy || undefined}
            onClick={() => void confirmCode()}
          >
            {busy ? "확인 중" : "확인"}
          </button>
          <div className={s.again}>
            <button className="btn btn--text" type="button" aria-disabled={busy} onClick={() => void sendCode()}>
              인증번호 다시 받기
            </button>
          </div>
          <p className={s.sub}>
            {"인증번호가 오지 않으면 "}
            <a className={`nw ${s.link}`} href={`mailto:${SITE_INFO.supportEmail}`}>
              {SITE_INFO.supportEmail}
            </a>
            {"로 문의해 주세요."}
          </p>
        </>
      ) : (
        <>
          {box}
          <button className="btn btn--block" type="button" aria-disabled={busy} aria-busy={busy || undefined} onClick={() => void sendCode()}>
            {busy ? "보내는 중" : "인증번호 받기"}
          </button>
        </>
      )}
    </div>
  );
}
