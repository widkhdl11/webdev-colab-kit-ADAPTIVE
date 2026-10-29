"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MyVerification, MyVerificationState } from "@/entities/creator/model/creator-verification";
import type { PendingSignatureLink } from "@/entities/creator/api/signature-link-reads";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { VerificationPanel } from "@/features/creator-verify/ui/verification-panel";
import { SignatureLinkPanel } from "@/features/signature-link/ui/signature-link-panel";
import s from "./signup.module.css";

// 크리에이터 가입 4·5단계 (UX 명세 signup.md 「2026-10-29 단계 화면」 step 4·5, 시안 v43-signup/signup-4-channel·5-signature).
// 계정은 3단계에서 만들어졌다 — 여기는 로그인한 크리에이터로 진행한다. 1~3단계는 지난 단계로 표시만 하고 돌아가지 않는다(계정이 이미 있다).
// 4단계: 지금 채널 확인 화면(VerificationPanel) 그대로 + 「나중에 하기」·「다음」(확인을 마쳐야 켜짐). 확인을 마치면 「다음」만 남는다.
// 5단계: 승인 서명 연결하기 카드(SignatureLinkPanel — 크리에이터 상세 설정과 같은 부품). 「나중에 하기」는 크리에이터 첫 화면으로.
// 휴대폰 번호 미리 채움: 3단계가 이 탭의 세션 저장소에 남긴 번호를 한 번 읽고 지운다(서버는 번호를 다시 내려보내지 않는다).

import { SIGNUP_PHONE_KEY } from "../model/signup-phone-key";

const STEPS = ["유형 선택", "정보 입력", "휴대폰 확인", "채널 확인", "승인 서명"] as const;
const STEP_PATH = "/signup/creator";

function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StepNav({ step }: { step: 4 | 5 }) {
  return (
    <nav className={s["steps-wrap"]} aria-label="가입 단계">
      <ol className={s.steps}>
        {STEPS.map((label, i) => {
          const k = i + 1;
          const done = k < step;
          const inner = (
            <>
              <span className={s.dot} aria-hidden="true">
                {done ? <CheckIcon /> : k}
              </span>
              <span className={s.lbl}>{label}</span>
            </>
          );
          return (
            <li key={label}>
              {k === 4 && step === 5 ? (
                <Link className={`${s.st} ${s["is-done"]}`} href={`${STEP_PATH}?step=4`}>
                  {inner}
                </Link>
              ) : (
                <span className={done ? `${s.st} ${s["is-done"]} ${s["st-static"]}` : s.st} aria-current={k === step ? "step" : undefined}>
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type SignupCreatorStepsProps =
  | {
      step: 4;
      verification: { state: MyVerificationState; rows: readonly MyVerification[]; apiPlatforms: readonly string[] };
    }
  | {
      step: 5;
      creatorId: string;
      sealingKeyPem: string | null;
      linked: boolean;
      /** 본인의 기한 안 대기 연결 요청 — 있으면 기다리는 중으로 이어 묻는다 */
      pending: PendingSignatureLink | null;
    };

export function SignupCreatorSteps(props: SignupCreatorStepsProps) {
  return (
    <main id="main">
      <section className={s.page} aria-labelledby="signup-title">
        <div className={`container auth ${s.box}`}>
          <div className="head">
            <h1 className="t-title" id="signup-title">
              회원가입
            </h1>
          </div>
          <StepNav step={props.step} />
          {props.step === 4 ? <ChannelStep verification={props.verification} /> : <SignatureStep {...props} />}
        </div>
      </section>
    </main>
  );
}

function ChannelStep({ verification }: { verification: { state: MyVerificationState; rows: readonly MyVerification[]; apiPlatforms: readonly string[] } }) {
  const verified = verification.state.verified;
  return (
    <div className="card">
      <VerificationPanel state={verification.state} rows={verification.rows} apiPlatforms={verification.apiPlatforms} />
      <div className={[s["step-actions"], verified ? s["no-prev"] : ""].filter(Boolean).join(" ")}>
        {verified ? null : (
          <Link className="btn btn--line" href={CREATOR_HOME}>
            나중에 하기
          </Link>
        )}
        {verified ? (
          <Link className={`btn ${s.next}`} href={`${STEP_PATH}?step=5`}>
            다음
          </Link>
        ) : (
          <button className={`btn ${s.next}`} type="button" aria-disabled="true">
            다음
          </button>
        )}
      </div>
    </div>
  );
}

function SignatureStep({ creatorId, sealingKeyPem, linked, pending }: { creatorId: string; sealingKeyPem: string | null; linked: boolean; pending: PendingSignatureLink | null }) {
  // 세션 저장소는 브라우저에서만 읽는다 — 서버 그림과 첫 그림을 같게 두고, 읽은 뒤 칸을 채운다(key 로 카드를 새로 만든다)
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    let saved = "";
    try {
      saved = window.sessionStorage.getItem(SIGNUP_PHONE_KEY) ?? "";
      window.sessionStorage.removeItem(SIGNUP_PHONE_KEY);
    } catch {
      saved = "";
    }
    // 개발 모드는 효과를 두 번 돌린다 — 두 번째의 빈 값이 첫 번째에 읽은 번호를 덮지 않게
    setPhone((prev) => saved || prev || "");
  }, []);
  return (
    <SignatureLinkPanel
      key={phone ?? "first"}
      creatorId={creatorId}
      sealingKeyPem={sealingKeyPem}
      initialPhone={phone ?? ""}
      initiallyLinked={linked}
      pending={pending}
      prevHref={`${STEP_PATH}?step=4`}
      laterHref={CREATOR_HOME}
      done={{ label: "가입 완료", href: CREATOR_HOME }}
    />
  );
}
