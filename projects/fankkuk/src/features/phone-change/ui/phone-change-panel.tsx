"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { PHONE_CODE_EXPIRED_MESSAGE, PHONE_CODE_TTL_SECONDS } from "@/entities/session/model/phone-code";
import { useCountdown } from "@/shared/lib/time/use-countdown";
import { checkPhoneChangeCode, requestPhoneChangeCode, sendPhoneChange, type PhoneChangeField } from "../api/phone-change-client";
import s from "./phone-change.module.css";

// 내 정보의 「번호 변경」(signup INV-U12). 새 번호로 인증번호 받기 → 인증번호 확인 → 현재 비밀번호 → 변경.
// 인증번호가 맞았는지는 서버가 판정한다 — 이 화면은 입력한 6자리를 보내고 답만 받는다(INV-U1·U15).
// 내 정보 저장 폼 안에 놓이므로 폼을 따로 두지 않는다(버튼은 type="button", Enter 는 이 칸의 다음 단계).
// 포커스: 인증번호를 보내면 인증번호 칸으로, 확인되면 「현재 비밀번호」 칸으로, 「번호 다시 입력」을 누르면 번호 칸으로 옮긴다.
// 실패하면 문구는 role="alert" 로 읽히고, 서버가 알려 준 칸에 aria-invalid 를 달고 포커스를 옮긴다.
// 남은 시간: 가입 3단계와 같은 시계(useCountdown)·같은 만료 문구 — 3분이 지나면 서버에 묻지 않고 만료를 알리고 「확인」을 끈다(판정은 DB).

type Stage = "phone" | "code" | "password";
type InputKey = "phone" | "code" | "pw";
type Notice = { kind: "ok"; text: string } | { kind: "error"; input: InputKey; text: string } | null;

const inputOf = (field: PhoneChangeField | null, stage: Stage): InputKey => {
  if (field === "currentPassword" && stage === "password") return "pw";
  if (field === "code" && stage === "code") return "code";
  return "phone";
};

export function PhoneChangePanel({ id, onLoginExpired, onChanged }: { id: string; onLoginExpired: () => void; onChanged: () => void }) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<Stage>("phone");
  const [busy, setBusy] = useState(false);
  // 인증번호를 맞힐 수 있는 마감(표시용) — 받을 때마다 새로
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  // 포커스를 옮길 칸 — 그 칸이 그려진 뒤에 옮기려고 상태로 둔다
  const [focusTo, setFocusTo] = useState<{ input: InputKey } | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusTo) return;
    const ref = focusTo.input === "pw" ? pwRef : focusTo.input === "code" ? codeRef : phoneRef;
    ref.current?.focus();
  }, [focusTo]);

  const fail = (field: PhoneChangeField | null, text: string, at: Stage = stage) => {
    const input = inputOf(field, at);
    setNotice({ kind: "error", input, text });
    setFocusTo({ input });
  };

  const requestCode = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await requestPhoneChangeCode(phone);
    setBusy(false);
    if (r.kind === "login") return onLoginExpired();
    if (r.kind === "failed") return fail(r.field, r.message, "phone");
    setStage("code");
    setCode("");
    setExpiresAt(Date.now() + PHONE_CODE_TTL_SECONDS * 1000);
    setNotice({ kind: "ok", text: "인증번호를 보냈습니다." });
    setFocusTo({ input: "code" });
  };

  const countdown = useCountdown(stage === "code" ? expiresAt : null, PHONE_CODE_TTL_SECONDS);
  const expired = stage === "code" && countdown.expired;

  const confirmCode = async () => {
    if (busy || expired) return;
    setBusy(true);
    setNotice(null);
    const r = await checkPhoneChangeCode(code);
    setBusy(false);
    if (r.kind === "login") return onLoginExpired();
    if (r.kind === "failed") {
      if (r.message === PHONE_CODE_EXPIRED_MESSAGE) setExpiresAt(Date.now());
      return fail("code", r.message, "code");
    }
    setStage("password");
    setNotice({ kind: "ok", text: "휴대폰 번호를 확인했습니다." });
    setFocusTo({ input: "pw" });
  };

  const change = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await sendPhoneChange(phone, password);
    setBusy(false);
    if (r.kind === "login") return onLoginExpired();
    if (r.kind === "failed") {
      // 확인이 쓸 수 없게 됐으면(10분 지남 등) 인증번호부터 다시 받는다
      if (r.field === "verification") {
        setStage("phone");
        setPassword("");
        return fail("phone", r.message, "phone");
      }
      return fail(r.field, r.message);
    }
    setPassword("");
    setNotice({ kind: "ok", text: "휴대폰 번호가 변경되었습니다." });
    onChanged();
  };

  const restart = () => {
    setStage("phone");
    setExpiresAt(null);
    setCode("");
    setPassword("");
    setNotice(null);
    setFocusTo({ input: "phone" });
  };

  const onEnter = (next: () => Promise<void>) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void next();
  };

  const invalid = (input: InputKey) => notice?.kind === "error" && notice.input === input;
  const describedBy = (input: InputKey, hint?: string) => [hint, invalid(input) ? f("err") : null].filter(Boolean).join(" ") || undefined;
  const actionLabel = stage === "phone" ? "인증번호 받기" : stage === "code" ? "확인" : "번호 변경";
  const action = stage === "phone" ? requestCode : stage === "code" ? confirmCode : change;

  return (
    <div className={s.panel} id={id} role="group" aria-label="휴대폰 번호 변경">
      <div className="field">
        <label htmlFor={f("phone")}>새 휴대폰 번호</label>
        <input
          ref={phoneRef}
          className="input"
          id={f("phone")}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="010-0000-0000"
          maxLength={13}
          value={phone}
          readOnly={stage !== "phone"}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={onEnter(requestCode)}
          aria-invalid={invalid("phone") || undefined}
          aria-describedby={describedBy("phone")}
        />
      </div>
      {stage === "code" && (
        <div className="field">
          <label htmlFor={f("code")}>인증번호</label>
          <div className={s.code}>
          <input
            ref={codeRef}
            className="input"
            id={f("code")}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6자리 숫자"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={onEnter(confirmCode)}
            disabled={expired}
            aria-invalid={invalid("code") || expired || undefined}
            aria-describedby={describedBy("code")}
          />
          <span className={expired ? `${s.timer} ${s.zero}` : s.timer} role="timer" aria-label="남은 시간">
            {countdown.text}
          </span>
          </div>
        </div>
      )}
      {stage === "password" && (
        <div className="field">
          <label htmlFor={f("pw")}>현재 비밀번호</label>
          <input
            ref={pwRef}
            className="input"
            id={f("pw")}
            type="password"
            autoComplete="current-password"
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onEnter(change)}
            aria-invalid={invalid("pw") || undefined}
            aria-describedby={describedBy("pw")}
          />
        </div>
      )}
      <div>
        <p className={s.error} id={f("err")} role="alert">
          {notice?.kind === "error" ? notice.text : expired ? PHONE_CODE_EXPIRED_MESSAGE : ""}
        </p>
        <p className={s.msg} role="status">
          {notice?.kind === "ok" ? notice.text : ""}
        </p>
      </div>
      <div className={s.actions}>
        <button className="btn" type="button" onClick={() => void action()} aria-disabled={busy || expired} aria-busy={busy || undefined}>
          {actionLabel}
        </button>
        {stage === "code" && (
          <button className="btn btn--line" type="button" onClick={() => void requestCode()} aria-disabled={busy}>
            다시 받기
          </button>
        )}
        {stage !== "phone" && (
          <button className="btn btn--text" type="button" onClick={restart}>
            번호 다시 입력
          </button>
        )}
      </div>
    </div>
  );
}
