"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import s from "./signup.module.css";

// 회원가입 3단계. 시안: docs/design/mockups/site/v4/signup.html
// 겉모양과 단계 이동만 있다 — 가입·카카오 인증은 로그인 방식 결정 뒤에 붙인다. 마지막 버튼은 메인(/home)으로 넘어가기만 한다.
// 입력값은 읽지도 보내지도 않는다. 입력칸에 name 을 두지 않아 폼 기본 제출이 일어나도 값이 주소창에 실리지 않는다.

const STEPS = ["유형 선택", "정보 입력", "본인 확인"] as const;
const LAST = STEPS.length;

const TERMS = [
  { key: "service", label: "이용약관", required: true },
  { key: "privacy", label: "개인정보 수집·이용", required: true },
  { key: "news", label: "이벤트·소식 알림 받기", required: false },
] as const;

type TermKey = (typeof TERMS)[number]["key"];

function KakaoBubble() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.3 4.7 6.7l-1 3.6c-.1.3.2.5.5.4l4.2-2.8c.5.1 1 .1 1.6.1 5.5 0 10-3.5 10-7.8S17.5 3 12 3Z"
      />
    </svg>
  );
}

export function SignupPage() {
  const router = useRouter();
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [moved, setMoved] = useState(false);
  const [agreed, setAgreed] = useState<Record<TermKey, boolean>>({ service: false, privacy: false, news: false });
  const navRef = useRef<HTMLElement>(null);
  const headingRefs = useRef<Array<HTMLHeadingElement | null>>([]);

  // 단계를 옮기면 새 단계 제목으로 포커스를 보내고 단계 표시가 보이게 올린다(시안과 같다). 처음 열 때는 옮기지 않는다.
  useEffect(() => {
    if (!moved) return;
    headingRefs.current[step - 1]?.focus({ preventScroll: true });
    navRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [step, moved]);

  const go = (n: number) => {
    const next = Math.max(1, Math.min(LAST, n));
    setStep(next);
    setReached((r) => Math.max(r, next));
    setMoved(true);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step < LAST) go(step + 1);
    else router.push("/home");
  };

  const allAgreed = TERMS.every((t) => agreed[t.key]);
  const setAll = (value: boolean) => setAgreed({ service: value, privacy: value, news: value });

  const heading = (n: number, text: string) => (
    <h2
      ref={(el) => {
        headingRefs.current[n - 1] = el;
      }}
      tabIndex={-1}
    >
      {text}
    </h2>
  );

  return (
    <main id="main">
      <div className="container">
        <div className={s.su}>
          <div className={s["page-title"]}>
            <h1 className="page-h">회원가입</h1>
            <p>세 단계면 끝나요.</p>
          </div>

          <nav className={s["steps-wrap"]} aria-label="가입 단계" ref={navRef}>
            <p className={s["step-count"]}>
              {step} / {LAST} <span>단계</span>
            </p>
            <ol className={s.steps}>
              {STEPS.map((label, i) => {
                const k = i + 1;
                const done = k !== step && k <= reached;
                return (
                  <li key={label}>
                    <button
                      className={done ? `${s.st} ${s["is-done"]}` : s.st}
                      type="button"
                      disabled={k > reached}
                      aria-current={k === step ? "step" : undefined}
                      onClick={() => go(k)}
                    >
                      <span className={s.dot} aria-hidden="true">
                        {k < step ? "✓" : k}
                      </span>
                      <span className={s.lbl}>{label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <form className={s["send-form"]} onSubmit={onSubmit} aria-label="회원가입 입력">
            <fieldset className={s.step} hidden={step !== 1}>
              <legend className="sr-only">회원 유형</legend>
              <div className={s["step-h"]}>{heading(1, "어떤 분이세요?")}</div>
              <div className={s.choices}>
                <label className={s.choice}>
                  <input className="sr-only" type="radio" name="kind" value="fan" defaultChecked />
                  <span className={s["choice-body"]}>
                    <img className="asset" src="/img/icon-gift.png" alt="" aria-hidden="true" width={72} height={72} />
                    <strong>팬이에요</strong>
                    <span className="sub">응원하는 크리에이터에게 선물을 보내고 싶어요.</span>
                  </span>
                </label>
                <label className={s.choice}>
                  <input className="sr-only" type="radio" name="kind" value="creator" />
                  <span className={s["choice-body"]}>
                    <img className="asset" src="/img/icon-approve.png" alt="" aria-hidden="true" width={72} height={72} />
                    <strong>크리에이터예요</strong>
                    <span className="sub">팬이 보내는 선물을 안전하게 받고 싶어요.</span>
                  </span>
                </label>
              </div>
              <p className={`hint ${s["kind-note"]}`}>
                <strong>크리에이터로 가입하면</strong> 가입한 뒤에 방송 채널 인증 코드로 본인 확인을 한 번 더 해요. 방송 채널에 인증 코드를
                올려 주시면 같은 분이 맞는지 확인하고, 확인이 끝나야 「크리에이터 찾기」에 나타나요.
              </p>
            </fieldset>

            <fieldset className={s.step} hidden={step !== 2}>
              <legend className="sr-only">가입 정보</legend>
              <div className={s["step-h"]}>{heading(2, "정보를 입력해 주세요")}</div>
              <div className={s["form-stack"]}>
                <div className="field">
                  <label htmlFor={f("id")}>아이디</label>
                  <input
                    className="input"
                    id={f("id")}
                    type="text"
                    autoComplete="username"
                    placeholder="영문 소문자·숫자 4~20자"
                    aria-describedby={f("id-h")}
                  />
                  <p className="hint" id={f("id-h")}>
                    가입한 뒤에는 아이디를 바꿀 수 없어요.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor={f("mail")}>이메일</label>
                  <input
                    className="input"
                    id={f("mail")}
                    type="email"
                    autoComplete="email"
                    placeholder="example@email.com"
                    aria-describedby={f("mail-h")}
                  />
                  <p className="hint" id={f("mail-h")}>
                    비밀번호를 잊었을 때 재설정 링크를 보내 드려요.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor={f("pw")}>비밀번호</label>
                  <input className="input" id={f("pw")} type="password" autoComplete="new-password" placeholder="8자 이상, 영문·숫자 포함" />
                </div>
                <div className="field">
                  <label htmlFor={f("pw2")}>비밀번호 확인</label>
                  <input
                    className="input"
                    id={f("pw2")}
                    type="password"
                    autoComplete="new-password"
                    placeholder="비밀번호를 한 번 더 입력해 주세요"
                  />
                </div>
                <div className="field">
                  <label htmlFor={f("tel")}>휴대폰 번호</label>
                  <input
                    className="input"
                    id={f("tel")}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="010-0000-0000"
                    aria-describedby={f("tel-h")}
                  />
                  <p className="hint" id={f("tel-h")}>
                    선물 소식을 카카오톡 알림톡으로 보내 드릴 번호예요. 실명·주소처럼 따로 나눠 보관해요.
                  </p>
                </div>
                <div className="field" role="group" aria-labelledby={f("terms")}>
                  <p className="label" id={f("terms")}>
                    약관 동의
                  </p>
                  <div className={s.terms}>
                    <div className={s.all}>
                      <label className={s.check}>
                        <input type="checkbox" checked={allAgreed} onChange={(e) => setAll(e.target.checked)} /> 전체 동의
                      </label>
                    </div>
                    {TERMS.map((t) => (
                      <div key={t.key}>
                        <label className={s.check}>
                          <input
                            type="checkbox"
                            checked={agreed[t.key]}
                            onChange={(e) => setAgreed((prev) => ({ ...prev, [t.key]: e.target.checked }))}
                          />
                          <span>
                            {t.required ? <span className={s.req}>[필수]</span> : "[선택]"} {t.label}
                          </span>
                        </label>
                        <a className={s.link} href="#">
                          보기
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </fieldset>

            <fieldset className={s.step} hidden={step !== 3}>
              <legend className="sr-only">카카오톡 본인 확인</legend>
              <div className={s["step-h"]}>
                {heading(3, "카카오톡으로 본인 확인")}
                <p>휴대폰 번호의 주인이 맞는지 카카오톡 인증으로 확인해요. 인증이 끝나면 가입이 마무리돼요.</p>
              </div>
              <ol className={s["kakao-steps"]}>
                <li>
                  <span>아래 버튼을 누르면 카카오톡에 인증 요청이 가요.</span>
                </li>
                <li>
                  <span>카카오톡에서 요청을 열고 인증을 눌러 주세요.</span>
                </li>
                <li>
                  <span>팬꾹으로 돌아오면 가입 완료예요.</span>
                </li>
              </ol>
            </fieldset>

            <div className={step === 1 ? `${s["step-actions"]} ${s["no-prev"]}` : s["step-actions"]}>
              {step > 1 ? (
                <button className="btn btn--soft" type="button" onClick={() => go(step - 1)}>
                  이전
                </button>
              ) : null}
              {step < LAST ? (
                <button className={`btn ${s.next}`} type="submit">
                  다음
                </button>
              ) : (
                <button className={`btn ${s.kakao} ${s.next}`} type="submit">
                  <KakaoBubble />
                  카카오톡으로 인증하고 가입하기
                </button>
              )}
            </div>
          </form>
          <p className={s.already}>
            이미 회원이신가요?{" "}
            <Link className={s.link} href="/login">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
