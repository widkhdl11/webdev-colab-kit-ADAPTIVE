"use client";

import Link from "next/link";
import type { TagOption } from "@/entities/creator/model/creator-tags";
import { channelStepDone, myVerificationPanel, type MyVerification, type MyVerificationState } from "@/entities/creator/model/creator-verification";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { CREATOR_CHANNEL_CREATE_PATH } from "@/shared/config/creator-paths";
import { VerificationPanel } from "@/features/creator-verify/ui/verification-panel";
import { ChannelCreateForm, ChannelMadeSummary } from "./channel-create-form";
import { SignupAddressStep } from "./signup-address-step";
import { KakaoDoneCard } from "./signup-kakao-step";
import s from "./signup.module.css";

// 크리에이터 가입 3단계 완료 화면 · 4단계 배송지 등록 · 5단계 채널 만들기(UX 명세 signup.md 「2026-11-10」·「2026-11-11」·「2026-11-17」 절).
// 가입은 다섯 단계다(2026-11-17 signup INV-U22 — 유형 선택 · 정보 입력 · 카카오톡 연결 · 배송지 등록 · 채널 만들기). 라우트가 주소 상태로 4·5단계를 고른다.
// 승인 서명 연결은 3단계 카카오 서명에서 끝나거나(signup INV-U19), 장애 대비 길로 가입했으면 가입 뒤 크리에이터 설정에서 한다(INV-U20).
// 계정은 3단계에서 만들어졌다 — 여기는 로그인한 크리에이터로 진행한다. 지난 단계는 표시만 하고 돌아가지 않는다(계정이 이미 있다). 「이전」은 두지 않는다.
// 4단계(배송지 등록)는 건너뛰는 버튼이 없다 — 저장하면 5단계로(signup-address-step).
// 5단계: 채널이 없으면(닉네임 없음, channel_new) 채널 만들기 칸만, 만든 뒤(channel_made)에는 요약 한 줄 아래 채널 소유자 확인(VerificationPanel, design-rules 42절).
// 요청을 보냈거나 확인을 마치면 마지막 단계가 끝나 「가입 완료」만 남는다. 그 전에는 「나중에 하기 | 가입 완료(꺼짐)」 한 줄 — 두 상태 모두 같다.

const STEPS = ["유형 선택", "정보 입력", "카카오톡 연결", "배송지 등록", "채널 만들기"] as const;
const STEP_PATH = CREATOR_CHANNEL_CREATE_PATH;

function CheckIcon() {
  return (
    <svg data-icon="line" width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** step = 지금 단계, doneThrough = 이 번호까지 완료 표시(kakao_done 은 지금 단계 3 도 완료) */
function StepNav({ step, doneThrough }: { step: 3 | 4 | 5; doneThrough: number }) {
  return (
    <nav className={s["steps-wrap"]} aria-label="가입 단계">
      <ol className={`${s.steps} ${s.many}`}>
        {STEPS.map((label, i) => {
          const k = i + 1;
          const done = k <= doneThrough;
          return (
            <li key={label}>
              <span className={done ? `${s.st} ${s["is-done"]} ${s["st-static"]}` : s.st} aria-current={k === step ? "step" : undefined}>
                <span className={s.dot} aria-hidden="true">
                  {done ? <CheckIcon /> : k}
                </span>
                <span className={s.lbl}>{label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type Verification = { state: MyVerificationState; rows: readonly MyVerification[]; apiPlatforms: readonly string[]; loginId?: string | null };

/** 채널 — none: 아직 없음(만들기 칸, 태그 선택지 필요) · made: 만든 뒤(요약 줄에 닉네임 · 팬덤 이름) */
export type ChannelInfo = { kind: "none"; tagOptions: readonly TagOption[] } | { kind: "made"; nickname: string; fanName: string | null };

/** view: 「kakao-done」 = 3단계 서명 완료(?step=3, 가입 화면에서 계정을 만든 직후) · 「address」 = 4단계 배송지 등록 · 「channel」 = 5단계 채널 만들기 */
export type SignupCreatorStepsProps =
  | { view: "kakao-done" }
  | { view: "address"; creatorId: string; sealingKeyPem: string | null }
  | { view?: "channel"; verification: Verification; channel: ChannelInfo };

export function SignupCreatorSteps(props: SignupCreatorStepsProps) {
  if (props.view === "kakao-done") {
    return (
      <main id="main">
        <section className={s.page} aria-labelledby="signup-title">
          <div className={`container auth ${s.box}`}>
            <div className="head">
              <h1 className="t-title" id="signup-title">
                회원가입
              </h1>
            </div>
            <StepNav step={3} doneThrough={3} />
            <KakaoDoneCard doneHref={STEP_PATH} />
          </div>
        </section>
      </main>
    );
  }
  if (props.view === "address") {
    return (
      <main id="main">
        <section className={s.page} aria-labelledby="signup-title">
          <div className={`container auth ${s.box}`}>
            <div className="head">
              <h1 className="t-title" id="signup-title">
                회원가입
              </h1>
            </div>
            <StepNav step={4} doneThrough={3} />
            <SignupAddressStep creatorId={props.creatorId} sealingKeyPem={props.sealingKeyPem} />
          </div>
        </section>
      </main>
    );
  }
  return <ChannelStep verification={props.verification} channel={props.channel} />;
}

function ChannelStep({ verification, channel }: { verification: Verification; channel: ChannelInfo }) {
  const done = channelStepDone(myVerificationPanel(verification.state, verification.rows).stage);
  return (
    <main id="main">
      <section className={s.page} aria-labelledby="signup-title">
        <div className={`container auth ${s.box}`}>
          <div className="head">
            <h1 className="t-title" id="signup-title">
              회원가입
            </h1>
          </div>
          <StepNav step={5} doneThrough={4} />
          <div className={`card ${s.chan}`}>
            {channel.kind === "none" ? (
              <ChannelCreateForm tagOptions={channel.tagOptions} />
            ) : (
              <>
                <ChannelMadeSummary nickname={channel.nickname} fanName={channel.fanName} />
                <div className={s["chan-after"]}>
                  <VerificationPanel variant="signup" state={verification.state} rows={verification.rows} loginId={verification.loginId ?? null} />
                </div>
              </>
            )}
            <div className={[s["step-actions"], done ? s["no-prev"] : ""].filter(Boolean).join(" ")}>
              {done ? null : (
                <Link className="btn btn--line" href={CREATOR_HOME}>
                  나중에 하기
                </Link>
              )}
              {done ? (
                <Link className={`btn ${s.next}`} href={CREATOR_HOME}>
                  가입 완료
                </Link>
              ) : (
                <button className={`btn ${s.next}`} type="button" aria-disabled="true">
                  가입 완료
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
