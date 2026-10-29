"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { importSealingPublicKey, sealEnvelope } from "@/shared/lib/envelope/envelope";
import { checkLink, startLink } from "../api/signature-link-client";
import { checkLinkIdentity, formatLinkPhone, linkIdentityPlaintext, LINK_NAME_MAX, type LinkIdentityField } from "../model/link-identity";
import { LINK_UNAVAILABLE } from "../model/signature-link";
import s from "./signature-link-panel.module.css";

// 승인 서명 연결하기 카드 (approval-signature INV-S16 · UX 명세 signup.md 「2026-10-29 단계 화면」 step 5, 시안 v43-signup/signup-5-signature).
// 가입 5단계와 크리에이터 상세 설정의 「승인 서명」 줄이 같은 카드를 쓴다 — 아래 버튼 줄만 부르는 곳이 정한다(prev·later·done).
// input → 「카카오톡 인증 요청」 → waiting(칸 읽기 전용, 몇 초마다 결과를 묻는다) → done(연결됨) / failed(실패·5분 지남 — 칸이 다시 열린다).
// 이름·생년월일·휴대폰 번호는 이 브라우저에서 공개키로 봉인한 뒤에만 보낸다 — 서버로 가는 본문에 평문 칸이 없다.
// 「연결됨」은 서버가 서명 창구에 직접 물어 DB 가 원문 대조를 통과했을 때만 온다 — 이 화면은 그 답을 보여 줄 뿐이다.
// 입력칸에 name 을 두지 않는다 — 폼 기본 제출이 일어나도 값이 주소창에 실리지 않게.
// 결과 묻기는 「지금 요청」 하나에만 답한다: 묻기 시작할 때의 요청 ID 를 잡아 두고, 답이 왔을 때 지금 요청과 다르면 버린다
// (「다시 보내기」 뒤에 늦게 온 앞 요청의 실패가 새 요청을 실패로 바꾸지 않게).
// 화면을 떠났다 돌아오면 부르는 곳이 서버에서 읽은 본인의 기한 안 대기 요청(pending)을 넘긴다 — 그 요청을 이어 묻는다.
// 보낸 번호는 서버가 다시 내려보내지 않으므로, 이 탭의 세션 저장소에 요청 ID 별로 둔 것이 있을 때만 보인다.

const POLL_MS = 2000;
const SENT_PHONE_KEY = (requestId: string) => `fankkuk.signature-link.sent:${requestId}`;

function rememberSentPhone(requestId: string, phone: string): void {
  try {
    window.sessionStorage.setItem(SENT_PHONE_KEY(requestId), phone);
  } catch {
    // 저장소를 못 쓰면 이어 볼 때 번호 없이 안내한다
  }
}

function sentPhoneOf(requestId: string): string {
  try {
    return window.sessionStorage.getItem(SENT_PHONE_KEY(requestId)) ?? "";
  } catch {
    return "";
  }
}
const FAILED_TEXT = "카카오톡 인증이 완료되지 않았습니다. 다시 요청해 주세요.";

type Phase = "input" | "waiting" | "done" | "failed";

export type SignatureLinkPanelProps = {
  /** 봉인 내용에 같이 넣는 크리에이터 식별값(로그인한 크리에이터 본인) */
  creatorId: string;
  /** 봉인 공개키(PEM). 없으면 요청 버튼이 꺼지고 안내만 보인다. */
  sealingKeyPem: string | null;
  /** 휴대폰 번호 미리 채움(가입 3단계에서 확인한 번호) */
  initialPhone?: string;
  /** 「이전」이 갈 곳 */
  prevHref: string;
  /** 「나중에 하기」가 갈 곳 — 없으면 그리지 않는다 */
  laterHref?: string;
  /** 연결된 뒤의 버튼 */
  done: { label: string; href: string };
  /** 이미 연결된 크리에이터가 가입 5단계로 다시 왔을 때 — 완료 상태로 연다 */
  initiallyLinked?: boolean;
  /** 본인의 기한 안 대기 요청(서버가 읽어 넘김) — 있으면 기다리는 중으로 열고 그 요청을 이어 묻는다 */
  pending?: { requestId: string; expiresAt: string } | null;
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

export function SignatureLinkPanel({ creatorId, sealingKeyPem, initialPhone = "", prevHref, laterHref, done, initiallyLinked = false, pending = null }: SignatureLinkPanelProps) {
  const router = useRouter();
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState(formatLinkPhone(initialPhone));
  const resumable = !initiallyLinked && pending !== null && Date.parse(pending.expiresAt) > Date.now();
  const [phase, setPhase] = useState<Phase>(initiallyLinked ? "done" : resumable ? "waiting" : "input");
  const [requestId, setRequestId] = useState<string | null>(resumable ? pending.requestId : null);
  const [expiresAt, setExpiresAt] = useState(resumable ? Date.parse(pending.expiresAt) : 0);
  const [sentPhone, setSentPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: LinkIdentityField; message: string } | null>(null);
  const [boxError, setBoxError] = useState<string | null>(sealingKeyPem ? null : LINK_UNAVAILABLE);
  // 지금 요청(답을 받아들일 요청 ID) — 다시 보내는 동안은 비워 두어 어느 답도 받지 않는다
  const activeRequest = useRef<string | null>(resumable ? pending.requestId : null);
  // 지금 묻고 있는 요청 ID — 같은 요청을 겹쳐 묻지 않는다(다른 요청은 따로 묻는다)
  const checkingFor = useRef<string | null>(null);

  // 이어 볼 때: 보낸 번호는 이 탭에 남은 것이 있으면 보인다(브라우저 저장소는 그린 뒤에만 읽는다)
  useEffect(() => {
    if (!resumable || !pending) return;
    const saved = sentPhoneOf(pending.requestId);
    if (saved) setSentPhone(saved);
  }, [resumable, pending]);

  // 결과 묻기 — waiting 동안만. 5분이 지나면 묻지 않고 실패로(서버도 같은 답을 한다)
  useEffect(() => {
    if (phase !== "waiting" || !requestId) return;
    const asked = requestId;
    const tick = async () => {
      if (checkingFor.current === asked) return;
      if (Date.now() > expiresAt) {
        if (activeRequest.current === asked) setPhase("failed");
        return;
      }
      checkingFor.current = asked;
      const r = await checkLink(asked);
      if (checkingFor.current === asked) checkingFor.current = null;
      // 늦게 온 앞 요청의 답 — 버린다
      if (activeRequest.current !== asked) return;
      if (r.kind === "linked") setPhase("done");
      else if (r.kind === "failed") setPhase("failed");
      else if (r.kind === "login") router.push("/login");
      else if (r.kind === "refused") {
        setBoxError(r.message);
        setPhase("failed");
      }
    };
    const timer = window.setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => window.clearInterval(timer);
  }, [phase, requestId, expiresAt, router]);

  const request = async () => {
    if (busy || !sealingKeyPem) return;
    const values = { name, birth, phone };
    const problem = checkLinkIdentity(values);
    if (problem) {
      // 이어 보던 요청을 다시 보낼 때는 칸이 비어 있다 — 칸을 열어 다시 적게 한다
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
    // 새 요청을 만드는 동안 앞 요청의 답은 받지 않는다(서버가 앞 요청을 버리면 그 답은 실패다)
    const before = activeRequest.current;
    activeRequest.current = null;
    try {
      const key = await importSealingPublicKey(sealingKeyPem);
      const envelope = await sealEnvelope(linkIdentityPlaintext(values, creatorId), key);
      const r = await startLink(envelope);
      if (r.kind === "ok") {
        activeRequest.current = r.requestId;
        rememberSentPhone(r.requestId, formatLinkPhone(phone));
        setRequestId(r.requestId);
        setExpiresAt(Date.parse(r.expiresAt));
        setSentPhone(formatLinkPhone(phone));
        setPhase("waiting");
      } else if (r.kind === "login") {
        router.push("/login");
      } else {
        activeRequest.current = before;
        setBoxError(r.kind === "refused" ? r.message : "요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      activeRequest.current = before;
      setBoxError(LINK_UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (phase === "input" || phase === "failed") void request();
  };

  const locked = phase === "waiting" || busy;
  const fieldAttrs = (field: LinkIdentityField, hintId?: string) => {
    const bad = fieldError?.field === field;
    const describedBy = [hintId, bad ? f(`${field}-m`) : null].filter(Boolean).join(" ");
    return { id: f(field), "aria-invalid": bad ? true : undefined, "aria-describedby": describedBy || undefined, readOnly: locked };
  };
  const fieldLine = (field: LinkIdentityField): ReactNode =>
    fieldError?.field === field ? (
      <p className={s.fieldErr} id={f(`${field}-m`)}>
        {fieldError.message}
      </p>
    ) : null;

  if (phase === "done") {
    return (
      <div className="card">
        <section className={s.step} aria-labelledby={f("h")}>
          <h2 className="t-card" id={f("h")}>
            승인 서명 연결하기
          </h2>
          <p className={`t-desc ${s.lead}`}>본인인증이 아니라, 앞으로 선물 승인 요청을 카카오톡으로 받기 위한 연결이에요.</p>
          <div className={s.connected} role="status">
            <CheckIcon />
            <span>승인 서명 연결이 완료되었습니다.</span>
          </div>
        </section>
        <div className={s.actions}>
          <Link className="btn" href={done.href}>
            {done.label}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit} aria-labelledby={f("h")} noValidate>
      <fieldset className={s.step}>
        <legend className="sr-only">승인 서명 연결하기</legend>
        <h2 className="t-card" id={f("h")}>
          승인 서명 연결하기
        </h2>
        <p className={`t-desc ${s.lead}`}>본인인증이 아니라, 앞으로 선물 승인 요청을 카카오톡으로 받기 위한 연결이에요.</p>
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
                setPhone(formatLinkPhone(e.target.value));
                if (fieldError?.field === "phone") setFieldError(null);
              }}
              {...fieldAttrs("phone")}
            />
            {fieldLine("phone")}
          </div>
        </div>
        {phase === "waiting" ? (
          <div className={s.after}>
            <ol className={s.kakao}>
              <li>
                {sentPhone ? (
                  <span>
                    <strong className="nw">{sentPhone}</strong>의 카카오톡으로 서명 요청을 보냈습니다.
                  </span>
                ) : (
                  <span>카카오톡으로 서명 요청을 보냈습니다.</span>
                )}
              </li>
              <li>
                <span>카카오톡에서 요청을 열고 인증을 완료해 주세요.</span>
              </li>
            </ol>
            <p className={`hint ${s.again}`}>
              요청이 오지 않았나요?{" "}
              <button className={s.textBtn} type="button" disabled={busy} onClick={() => void request()}>
                다시 보내기
              </button>
            </p>
          </div>
        ) : null}
        {phase === "failed" && !boxError ? (
          <div className={`err ${s.after}`} role="alert">
            {FAILED_TEXT}
          </div>
        ) : null}
        {boxError ? (
          <div className={`err ${s.after}`} role="alert">
            {boxError}
          </div>
        ) : null}
      </fieldset>
      <div className={`${s.actions} ${laterHref ? s.three : s.two}`}>
        <Link className="btn btn--line" href={prevHref}>
          이전
        </Link>
        {laterHref ? (
          <Link className="btn btn--line" href={laterHref}>
            나중에 하기
          </Link>
        ) : null}
        <button
          className={`btn btn--kakao ${s.main}`}
          type="submit"
          aria-disabled={locked || !sealingKeyPem ? true : undefined}
          aria-busy={busy || undefined}
        >
          <KakaoBubble />
          {phase === "waiting" ? "확인 기다리는 중" : "카카오톡 인증 요청"}
        </button>
      </div>
    </form>
  );
}
