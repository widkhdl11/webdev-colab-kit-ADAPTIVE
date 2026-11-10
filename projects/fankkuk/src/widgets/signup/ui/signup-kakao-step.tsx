"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { checkCreatorSign, startCreatorSign } from "@/features/signup/api/creator-sign-client";
import { checkLinkIdentity, formatLinkPhone, linkIdentityPlaintext, LINK_NAME_MAX, type LinkIdentityField } from "@/features/signature-link/model/link-identity";
import { importSealingPublicKey, sealEnvelope } from "@/shared/lib/envelope/envelope";
import { Sentences } from "@/shared/ui/sentences";
import s from "./signup.module.css";

// 크리에이터 가입 3단계 — 카카오톡 인증 알림 연결(UX 명세 signup.md 「2026-11-10 크리에이터 3단계 카카오톡 인증」, 시안 creator-signup-kakao-20261110 ①~④).
// kakao_input → 「카카오톡 인증 요청」 → kakao_waiting(칸 읽기 전용, 몇 초마다 서버에 결과를 묻는다)
//   → 서버가 서명을 검증하면(INV-U19) 곧바로 가입을 보낸다 → kakao_done(「다음」 하나, 이전 없음 — 계정이 생겼다)
//   / 실패·5분 지남 → kakao_failed(빨간 상자, 칸 다시 열림) / 이미 가입된 번호 → kakao_exists(로그인)
//   / 서버가 창구 장애를 확인함(INV-U20) → 부르는 쪽(onDown)이 6자리 길(⑤)로 바꾼다. 6자리로 가는 버튼은 어디에도 없다.
// 이름·생년월일·번호는 이 브라우저에서 공개키로 봉인한 뒤에만 보낸다. 봉인 내용의 크리에이터 ID 는 요청마다 새로 정한다 — 서버가 그 요청에 묶고,
// 계정이 만들어지면 그 크리에이터 행의 ID 가 된다. 「서명 완료」는 서버의 답으로만 안다.
// 결과 묻기는 「지금 요청」 하나에만 답한다(다시 보내기 뒤에 늦게 온 앞 요청의 답은 버린다). 입력칸에 name 을 두지 않는다.

const POLL_MS = 2000;
const FAILED_TEXT = "카카오톡 인증이 완료되지 않았습니다. 다시 요청해 주세요.";
const UNAVAILABLE_TEXT = "현재 회원가입을 이용할 수 없습니다.";
const SEND_FAILED_TEXT = "요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";

type Phase = "input" | "waiting" | "done" | "failed" | "exists";

/** 서명 검증 뒤 가입 요청의 결과 — 부르는 쪽이 가입을 보내고 이 화면이 그릴 것만 돌려준다 */
export type KakaoSignupOutcome =
  | { kind: "done" }
  | { kind: "exists"; message: string }
  /** 확인을 쓸 수 없게 됨(10분 지남 등) — 다시 요청 */
  | { kind: "retry"; message: string }
  /** 부르는 쪽이 다른 단계·화면으로 옮겼다(칸 오류·로그인 화면) */
  | { kind: "moved" };

export type SignupKakaoStepProps = {
  /** 봉인 공개키(PEM). 없으면 요청 버튼이 꺼지고 안내만 보인다. */
  sealingKeyPem: string | null;
  phone: string;
  onPhoneChange: (phone: string) => void;
  onPrev: () => void;
  /** 서버가 창구 장애를 확인함(INV-U20) — 6자리 길로 */
  onDown: () => void;
  /** 서명이 검증된 뒤 가입을 보낸다 */
  completeSignup: () => Promise<KakaoSignupOutcome>;
  /** 3단계 제목 — 단계를 옮길 때 부르는 쪽이 포커스를 보낸다 */
  headingRef: Ref<HTMLHeadingElement>;
  /** 단계 표시(부르는 쪽이 그린다) */
  nav: ReactNode;
  doneHref: string;
};

function KakaoBubble() {
  return (
    <svg className={s.bubble} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.5c-5 0-9 3.1-9 7 0 2.5 1.7 4.7 4.2 5.9l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7s-4-7.1-9-7.1Z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SignupKakaoStep({ sealingKeyPem, phone, onPhoneChange, onPrev, onDown, completeSignup, headingRef, nav, doneHref }: SignupKakaoStepProps) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [sentPhone, setSentPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: LinkIdentityField; message: string } | null>(null);
  const [boxError, setBoxError] = useState<string | null>(sealingKeyPem ? null : UNAVAILABLE_TEXT);
  const activeRequest = useRef<string | null>(null);
  const checkingFor = useRef<string | null>(null);
  // 가입 요청은 한 번만 — 검증 답이 두 번 와도
  const completing = useRef(false);

  const finishSignup = async () => {
    if (completing.current) return;
    completing.current = true;
    const r = await completeSignup();
    if (r.kind === "done") setPhase("done");
    else if (r.kind === "exists") {
      setBoxError(r.message);
      setPhase("exists");
    } else if (r.kind === "retry") {
      setBoxError(r.message);
      setPhase("failed");
    }
    completing.current = false;
  };

  useEffect(() => {
    if (phase !== "waiting" || !requestId) return;
    const asked = requestId;
    const tick = async () => {
      if (checkingFor.current === asked || completing.current) return;
      if (Date.now() > expiresAt) {
        if (activeRequest.current === asked) setPhase("failed");
        return;
      }
      checkingFor.current = asked;
      const r = await checkCreatorSign(asked);
      if (checkingFor.current === asked) checkingFor.current = null;
      if (activeRequest.current !== asked) return;
      if (r.kind === "verified") {
        activeRequest.current = null;
        await finishSignup();
      } else if (r.kind === "failed") setPhase("failed");
      else if (r.kind === "exists") {
        setBoxError(null);
        setPhase("exists");
      } else if (r.kind === "down") onDown();
      else if (r.kind === "refused") {
        setBoxError(r.message);
        setPhase("failed");
      }
    };
    const timer = window.setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => window.clearInterval(timer);
    // finishSignup·onDown 은 렌더마다 새 함수다 — 요청이 바뀔 때만 다시 건다
  }, [phase, requestId, expiresAt]);

  const request = async () => {
    if (busy || !sealingKeyPem) return;
    const values = { name, birth, phone };
    const problem = checkLinkIdentity(values);
    if (problem) {
      if (phase === "waiting") {
        activeRequest.current = null;
        setPhase("input");
      }
      setFieldError(problem);
      requestAnimationFrame(() => document.getElementById(f(problem.field))?.focus());
      return;
    }
    setBusy(true);
    setFieldError(null);
    setBoxError(null);
    const before = activeRequest.current;
    activeRequest.current = null;
    try {
      // 봉인 내용의 크리에이터 ID — 요청마다 새로(서버가 그 요청에 묶는다)
      const creatorId = crypto.randomUUID();
      const key = await importSealingPublicKey(sealingKeyPem);
      const identity = await sealEnvelope(linkIdentityPlaintext(values, creatorId), key);
      const r = await startCreatorSign({ identity, creatorId, phone });
      if (r.kind === "pending") {
        activeRequest.current = r.requestId;
        setRequestId(r.requestId);
        setExpiresAt(Date.parse(r.expiresAt));
        setSentPhone(formatLinkPhone(phone));
        setPhase("waiting");
      } else if (r.kind === "down") {
        onDown();
      } else {
        activeRequest.current = before;
        setBoxError(r.kind === "refused" ? r.message : SEND_FAILED_TEXT);
      }
    } catch {
      activeRequest.current = before;
      setBoxError(UNAVAILABLE_TEXT);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (phase === "input" || phase === "failed") void request();
  };

  const locked = phase === "waiting" || busy;
  const fieldAttrs = (field: LinkIdentityField) => {
    const bad = fieldError?.field === field;
    return { id: f(field), "aria-invalid": bad ? true : undefined, "aria-describedby": bad ? f(`${field}-m`) : undefined, readOnly: locked };
  };
  const fieldLine = (field: LinkIdentityField) =>
    fieldError?.field === field ? (
      <p className={`${s.live} ${s["live-bad"]}`} id={f(`${field}-m`)}>
        <span>{fieldError.message}</span>
      </p>
    ) : null;

  const head = (
    <>
      <h2 className={`t-card ${s.focusable}`} ref={headingRef} tabIndex={-1}>
        카카오톡 인증 알림 연결
      </h2>
      <p className={`t-desc ${s.lead}`}>앞으로 선물 승인 요청을 카카오톡으로 받기 위한 연결이에요.</p>
    </>
  );

  if (phase === "done") {
    return (
      <>
        {nav}
        <div className="card">
          <section className={s.step} aria-label="카카오톡 인증 알림 연결">
            {head}
            <div className={s.connected} role="status">
              <CheckIcon />
              <span>카카오톡 인증 알림 연결이 완료되었습니다.</span>
            </div>
          </section>
          <div className={`${s["step-actions"]} ${s["no-prev"]}`}>
            <Link className={`btn ${s.next}`} href={doneHref}>
              다음
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {nav}
      <form className="card" onSubmit={onSubmit} aria-label="카카오톡 인증 알림 연결" noValidate>
        <fieldset className={s.step}>
          <legend className="sr-only">카카오톡 인증 알림 연결</legend>
          {head}
          <div className="form">
            <div>
              <label className="label" htmlFor={f("name")}>
                이름
              </label>
              <input
                className="field"
                type="text"
                autoComplete="name"
                maxLength={LINK_NAME_MAX}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldError?.field === "name") setFieldError(null);
                }}
                {...fieldAttrs("name")}
              />
              {fieldLine("name")}
            </div>
            <div>
              <label className="label" htmlFor={f("birth")}>
                생년월일
              </label>
              <input
                className="field"
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                maxLength={8}
                placeholder="예: 19900115"
                value={birth}
                onChange={(e) => {
                  setBirth(e.target.value.replace(/\D/g, "").slice(0, 8));
                  if (fieldError?.field === "birth") setFieldError(null);
                }}
                {...fieldAttrs("birth")}
              />
              {fieldLine("birth")}
            </div>
            <div>
              <label className="label" htmlFor={f("phone")}>
                휴대폰 번호
              </label>
              <input
                className="field"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-0000-0000"
                value={phone}
                onChange={(e) => {
                  onPhoneChange(formatLinkPhone(e.target.value));
                  if (fieldError?.field === "phone") setFieldError(null);
                  // 이미 가입된 번호 안내는 번호를 고치면 내린다
                  if (phase === "exists") {
                    setBoxError(null);
                    setPhase("input");
                  }
                }}
                {...fieldAttrs("phone")}
              />
              {fieldLine("phone")}
            </div>
          </div>
          {phase === "waiting" ? (
            <div className={s.after}>
              <ol className={s["kakao-list"]}>
                <li>
                  <span>
                    <strong className="nw">{sentPhone}</strong>의 카카오톡으로 서명 요청을 보냈습니다.
                  </span>
                </li>
                <li>
                  <span>카카오톡에서 요청을 열고 인증을 완료해 주세요.</span>
                </li>
              </ol>
              <p className={`hint ${s.again}`}>
                요청이 오지 않았나요?{" "}
                <button className={s["text-btn"]} type="button" disabled={busy} onClick={() => void request()}>
                  다시 보내기
                </button>
              </p>
            </div>
          ) : null}
          {phase === "exists" ? (
            <div className={`err ${s["phone-err"]} ${s.after}`} role="alert">
              <Sentences text={boxError ?? "이 번호로 가입된 계정이 있습니다."} />
              <div className={s["phone-err-action"]}>
                <Link className="btn btn--line btn--sm" href="/login">
                  로그인
                </Link>
              </div>
            </div>
          ) : phase === "failed" || boxError ? (
            <div className={`err ${s.after}`} role="alert">
              <Sentences text={boxError ?? FAILED_TEXT} />
            </div>
          ) : null}
        </fieldset>
        <div className={s["step-actions"]}>
          <button className="btn btn--line" type="button" disabled={busy} onClick={onPrev}>
            이전
          </button>
          {/* 이미 가입된 번호(kakao_exists) — 요청 버튼을 숨긴다. 번호를 고치면 입력 상태로 돌아가 다시 보인다 */}
          {phase === "exists" ? null : (
            <button
              className={`btn btn--kakao ${s.next}`}
              type="submit"
              aria-disabled={locked || !sealingKeyPem ? true : undefined}
              aria-busy={locked || undefined}
            >
              <KakaoBubble />
              {phase === "waiting" ? "확인 기다리는 중" : "카카오톡 인증 요청"}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
