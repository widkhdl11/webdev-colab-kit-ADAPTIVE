"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PASSWORD_HINT } from "@/entities/session/model/password-rule";
import { resolveTagSelection, type TagOption } from "@/entities/creator/model/creator-tags";
import { HEARD_FROM, HEARD_FROM_LABEL, isHeardFrom, type HeardFrom } from "@/entities/metrics/model/signup-source";
import { TagPicker } from "@/features/creator-tags-edit/ui/tag-picker";
import { completeSignup } from "@/features/signup/api/complete-signup";
import { requestPhoneVerification } from "@/features/signup/api/signup-client";
import { checkDetails, CREATOR_PROFILE_LIMITS, type DetailsField } from "@/features/signup/model/signup-input";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import s from "./signup.module.css";

// 회원가입 3단계. 시안: docs/design/mockups/site/v18/signup.html (가운데 기둥 .auth, 단계 카드에 번호 동그라미 + 제목) · 스펙: docs/specs/signup.md
// 시안은 세 단계를 한 화면에 쌓아 보이지만, 가입은 한 번에 한 단계씩 넘기는 흐름을 그대로 둔다 — 지금 단계의 카드 한 장만 보인다.
// 3단계: 「인증 요청 보내기」로 카카오톡에 요청 → 카카오톡에서 인증 → 「인증했어요, 가입하기」.
// 브라우저는 번호표만 들고 있다 — 인증됐는지는 서버가 카카오에게 묻는다(INV-U1).
// 입력칸에 name 을 두지 않는다 — 폼 기본 제출이 일어나도 값이 주소창에 실리지 않게.

const STEPS = ["유형 선택", "정보 입력", "본인 확인"] as const;
const LAST = STEPS.length;

type TermKey = "service" | "privacy" | "news";
type Role = "fan" | "creator";
type ErrorField = DetailsField | "verification" | "form";

// href 가 없는 항목(선택 동의)의 「보기」는 링크가 아니라 흐린 글자로 둔다. 전문 화면이 생기면 href 만 채운다.
const TERMS: ReadonlyArray<{ key: TermKey; label: string; required: boolean; href?: string }> = [
  { key: "service", label: "이용약관", required: true, href: "/terms" },
  { key: "privacy", label: "개인정보 수집·이용", required: true, href: "/privacy" },
  { key: "news", label: "이벤트·소식 알림 받기", required: false },
];

/** 완료 표시 — design-rules §3: 체크는 단색 SVG, 글자색을 따라간다. 화면 낭독기에는 읽히지 않는다. */
function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** tagOptions: 크리에이터가 고를 수 있는 태그 선택지(숨기지 않은 것, 선택지 순서 — creator-tags INV-T3) */
export function SignupPage({ tagOptions }: { tagOptions: readonly TagOption[] }) {
  const router = useRouter();
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [moved, setMoved] = useState(false);
  const [role, setRole] = useState<Role>("fan");
  const [loginId, setLoginId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [phone, setPhone] = useState("");
  // 크리에이터로 가입할 때만 받는 기본 공개 정보(creator-verification INV-V1). 채널 주소는 가입 뒤 본인 확인 때 받는다.
  const [creatorName, setCreatorName] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [agreed, setAgreed] = useState<Record<TermKey, boolean>>({ service: false, privacy: false, news: false });
  // metrics INV-Q4: 「어디서 알게 되셨나요」 — 고르지 않아도 가입된다
  const [heardFrom, setHeardFrom] = useState<HeardFrom | null>(null);
  // 인증 요청을 보냈는가. 번호표 자체는 서버가 쿠키로 들고 있다(INV-U1). 번호를 고치면 요청부터 다시 —
  // 다른 번호의 확인으로 가입하지 않게(서버도 번호 대조로 막는다).
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: ErrorField; message: string } | null>(null);
  // 오류를 띄울 때마다 오르는 번호 — 같은 문구가 연달아 나와도 새로 붙여 다시 읽히게 한다.
  const [errorSeq, setErrorSeq] = useState(0);
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

  const showError = (next: { field: ErrorField; message: string }) => {
    setError(next);
    setErrorSeq((n) => n + 1);
  };

  // 태그는 화면에서 먼저 합친다(creator-tags INV-T3) — 직접 입력이 선택지 이름과 같으면 그 선택지로 세어 보낸다.
  // 합칠 수 없으면(숨긴 선택지·개수 초과 등) 고른 그대로 두고, details() 가 태그 칸에 문구를 띄운다.
  const tagSelection = () => resolveTagSelection(tagOptions, tagIds, customTag);
  const creatorProfile = () => {
    if (role !== "creator") return undefined;
    const t = tagSelection();
    return t.ok
      ? { name: creatorName, channelTitle, tagIds: t.tagIds, customTag: t.customTag ?? "" }
      : { name: creatorName, channelTitle, tagIds, customTag };
  };
  const details = (): { field: DetailsField; message: string } | null => {
    const problem = checkDetails({ loginId, email, password, passwordConfirm, phone, terms: agreed, creator: creatorProfile() });
    if (problem || role !== "creator") return problem;
    const t = tagSelection();
    return t.ok ? null : { field: "tags", message: t.message };
  };

  const sendRequest = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await requestPhoneVerification(phone);
    setBusy(false);
    if (r.ok) setRequested(true);
    else showError({ field: "verification", message: r.message });
  };

  const finish = async () => {
    if (busy || !requested) return;
    setBusy(true);
    setError(null);
    const r = await completeSignup({
      role,
      loginId: loginId.trim(),
      email: email.trim(),
      password,
      phone,
      terms: agreed,
      creator: creatorProfile(),
      heardFrom,
    });
    if (r.ok) {
      router.push(r.loggedIn ? "/" : "/login"); // 「/」 가 역할별 첫 화면으로 나눈다
      router.refresh();
      return;
    }
    setBusy(false);
    if (r.dropVerification) setRequested(false);
    showError({ field: r.field, message: r.message });
    if (r.field !== "verification" && r.field !== "form") go(2);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step === 2) {
      const problem = details();
      if (problem) {
        showError(problem);
        return;
      }
    }
    setError(null);
    if (step < LAST) go(step + 1);
    else if (requested) void finish();
    else void sendRequest();
  };

  const allAgreed = TERMS.every((t) => agreed[t.key]);
  const setAll = (value: boolean) => setAgreed({ service: value, privacy: value, news: value });

  const invalid = (field: ErrorField) => (error?.field === field ? { "aria-invalid": true, "aria-describedby": f("error") } : {});
  const errorLine = (show: boolean) =>
    show && error ? (
      <p className={`err ${s.error}`} id={f("error")} role="alert" key={errorSeq}>
        {error.message}
      </p>
    ) : null;

  const heading = (n: number, text: string) => (
    <h2
      className={`t-card ${s.focusable}`}
      ref={(el) => {
        headingRefs.current[n - 1] = el;
      }}
      tabIndex={-1}
    >
      {text}
    </h2>
  );
  const stepNo = (n: number) => (
    <span className={s.no} aria-hidden="true">
      {n}
    </span>
  );

  return (
    <main id="main">
      <section className={s.page} aria-labelledby={f("title")}>
        <div className={`container auth ${s.box}`}>
          <div className="head">
            <h1 className="t-title" id={f("title")}>
              회원가입
            </h1>
            <p className="t-lead t-desc">세 단계면 끝나요.</p>
          </div>

          <nav className={s["steps-wrap"]} aria-label="가입 단계" ref={navRef}>
            <p className={s["step-count"]}>
              {step} / {LAST} <span>단계</span>
            </p>
            <ol className={s.steps}>
              {STEPS.map((label, i) => {
                const k = i + 1;
                const done = k !== step && k < reached; // 지나온 단계만 완료 — 아직 넘지 않은 마지막 단계는 숫자 그대로(선물 보내기와 같은 기준)
                return (
                  <li key={label}>
                    <button
                      className={done ? `${s.st} ${s["is-done"]}` : s.st}
                      type="button"
                      disabled={k > reached || busy}
                      aria-current={k === step ? "step" : undefined}
                      onClick={() => {
                        // 단계 표시로 3단계에 갈 때도 2단계 검사를 거친다 — 고친 칸이 틀렸으면 2단계에 남는다
                        const problem = k === LAST ? details() : null;
                        if (problem) {
                          go(2);
                          showError(problem);
                          return;
                        }
                        setError(null);
                        go(k);
                      }}
                    >
                      <span className={s.dot} aria-hidden="true">
                        {done ? <CheckIcon size={16} /> : k}
                      </span>
                      <span className={s.lbl}>{label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <form className="card" onSubmit={onSubmit} aria-label="회원가입 입력" noValidate>
            <fieldset className={s.step} hidden={step !== 1}>
              <legend className="sr-only">회원 유형</legend>
              <div className={s.sh}>
                {stepNo(1)}
                <div>{heading(1, "어떤 분이세요?")}</div>
              </div>
              <div className={s.choices}>
                <label className={s.choice}>
                  <input type="radio" name="kind" value="fan" checked={role === "fan"} onChange={() => setRole("fan")} />
                  <span>
                    <strong>팬이에요</strong>
                    <span className="t-meta">응원하는 크리에이터에게 선물을 보내고 싶어요.</span>
                  </span>
                </label>
                <label className={s.choice}>
                  <input type="radio" name="kind" value="creator" checked={role === "creator"} onChange={() => setRole("creator")} />
                  <span>
                    <strong>크리에이터예요</strong>
                    <span className="t-meta">팬이 보내는 선물을 안전하게 받고 싶어요.</span>
                  </span>
                </label>
              </div>
              <p className={s.note}>
                <strong>크리에이터로 가입하면</strong> 가입한 뒤에 활동 채널 주인이 맞는지 한 번 더 확인해요. 유튜브·치지직은 그 계정으로
                로그인하면 바로 끝나요(인스타그램은 프로페셔널 계정만). SOOP 은 인증 코드를 채널 소개란에 붙이거나 팬꾹 계정 DM 으로 보내면
                운영자가 확인해요. 확인이 끝나야 「크리에이터 찾기」에 나타나요.
              </p>
            </fieldset>

            <fieldset className={s.step} hidden={step !== 2}>
              <legend className="sr-only">가입 정보</legend>
              <div className={s.sh}>
                {stepNo(2)}
                <div>{heading(2, "정보를 입력해 주세요")}</div>
              </div>
              <div className="form">
                <div>
                  <label className="label" htmlFor={f("id")}>
                    아이디
                  </label>
                  <input
                    className="field"
                    id={f("id")}
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    aria-describedby={f("id-h")}
                    {...invalid("loginId")}
                  />
                  <p className="hint" id={f("id-h")}>
                    영문 소문자·숫자·밑줄(_)로 4~20자예요. 가입한 뒤에는 아이디를 바꿀 수 없어요.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor={f("mail")}>
                    이메일
                  </label>
                  <input
                    className="field"
                    id={f("mail")}
                    type="email"
                    autoComplete="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-describedby={f("mail-h")}
                    {...invalid("email")}
                  />
                  <p className="hint" id={f("mail-h")}>
                    가입하면 확인 메일을 보내 드려요. 메일의 링크를 눌러야 이 주소로 선물 소식을 받아요.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor={f("pw")}>
                    비밀번호
                  </label>
                  <input
                    className="field"
                    id={f("pw")}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby={f("pw-h")}
                    {...invalid("password")}
                  />
                  <p className="hint" id={f("pw-h")}>
                    {PASSWORD_HINT}
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor={f("pw2")}>
                    비밀번호 확인
                  </label>
                  <input
                    className="field"
                    id={f("pw2")}
                    type="password"
                    autoComplete="new-password"
                    placeholder="비밀번호를 한 번 더 입력해 주세요"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    {...invalid("passwordConfirm")}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={f("tel")}>
                    휴대폰 번호
                  </label>
                  <input
                    className="field"
                    id={f("tel")}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="010-0000-0000"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setRequested(false);
                    }}
                    aria-describedby={f("tel-h")}
                    {...invalid("phone")}
                  />
                  <p className="hint" id={f("tel-h")}>
                    선물 소식을 카카오톡 알림톡으로 보내 드릴 번호예요. 실명·주소처럼 따로 나눠 보관해요.
                  </p>
                </div>
                {role === "creator" ? (
                  <div className={s.cr}>
                    <div>
                      <label className="label" htmlFor={f("cr-name")}>
                        공개 이름
                      </label>
                      <input
                        className="field"
                        id={f("cr-name")}
                        type="text"
                        autoComplete="off"
                        maxLength={CREATOR_PROFILE_LIMITS.name}
                        value={creatorName}
                        onChange={(e) => setCreatorName(e.target.value)}
                        aria-describedby={f("cr-name-h")}
                        {...invalid("creatorName")}
                      />
                      <p className="hint" id={f("cr-name-h")}>
                        팬에게 보이는 이름이에요. {CREATOR_PROFILE_LIMITS.name}자까지 적을 수 있어요.
                      </p>
                    </div>
                    <div>
                      <label className="label" htmlFor={f("cr-channel")}>
                        채널 이름
                      </label>
                      <input
                        className="field"
                        id={f("cr-channel")}
                        type="text"
                        autoComplete="off"
                        placeholder="예: 꿀단지TV"
                        maxLength={CREATOR_PROFILE_LIMITS.channelTitle}
                        value={channelTitle}
                        onChange={(e) => setChannelTitle(e.target.value)}
                        aria-describedby={f("cr-channel-h")}
                        {...invalid("channelTitle")}
                      />
                      <p className="hint" id={f("cr-channel-h")}>
                        채널 주소는 가입한 뒤 본인 확인 때 받아요.
                      </p>
                    </div>
                    <TagPicker
                      idBase={f("cr-tags")}
                      options={tagOptions}
                      picked={tagIds}
                      custom={customTag}
                      onPickedChange={setTagIds}
                      onCustomChange={setCustomTag}
                      invalid={error?.field === "tags" ? { describedBy: f("error") } : null}
                    />
                  </div>
                ) : null}
                <div>
                  <label className="label" htmlFor={f("heard")}>
                    어디서 팬꾹을 알게 되셨나요? <span className={`t-meta ${s.opt}`}>(선택)</span>
                  </label>
                  <select
                    className="field"
                    id={f("heard")}
                    value={heardFrom ?? ""}
                    onChange={(e) => setHeardFrom(isHeardFrom(e.currentTarget.value) ? e.currentTarget.value : null)}
                    aria-describedby={f("heard-h")}
                  >
                    <option value="">고르지 않을래요</option>
                    {HEARD_FROM.map((k) => (
                      <option key={k} value={k}>
                        {HEARD_FROM_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <p className="hint" id={f("heard-h")}>
                    답하지 않아도 가입돼요. 어떤 길로 많이 찾아오시는지만 모아서 봐요.
                  </p>
                </div>
                <div role="group" aria-labelledby={f("terms")}>
                  <p className="label" id={f("terms")}>
                    약관 동의
                  </p>
                  <div className={s.terms}>
                    <div>
                      <label className="check">
                        <input type="checkbox" checked={allAgreed} onChange={(e) => setAll(e.target.checked)} /> 전체 동의
                      </label>
                    </div>
                    {TERMS.map((t) => (
                      <div key={t.key} className={s.row}>
                        <label className="check">
                          <input
                            type="checkbox"
                            aria-required={t.required || undefined}
                            checked={agreed[t.key]}
                            onChange={(e) => setAgreed((prev) => ({ ...prev, [t.key]: e.target.checked }))}
                            {...(t.required ? invalid("terms") : {})}
                          />
                          <span>
                            {t.required ? <span className={s.req}>[필수]</span> : "[선택]"} {t.label}
                          </span>
                        </label>
                        {t.href ? (
                          <Link
                            className="btn btn--text btn--sm"
                            href={t.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${t.label} 보기 (새 창)`}
                          >
                            보기
                          </Link>
                        ) : (
                          <span className={s["link-off"]}>
                            보기<span className="sr-only"> — {t.label} 전문은 준비 중이에요</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {errorLine(step === 2)}
              </div>
            </fieldset>

            <fieldset className={s.step} hidden={step !== 3}>
              <legend className="sr-only">카카오톡 본인 확인</legend>
              <div className={s.sh}>
                {stepNo(3)}
                <div>
                  {heading(3, "카카오톡으로 본인 확인")}
                  <p className="t-desc">휴대폰 번호의 주인이 맞는지 카카오톡 인증으로 확인해요. 인증이 끝나면 가입이 마무리돼요.</p>
                </div>
              </div>
              <ol className={s.kakao}>
                <li className={requested ? s["is-done"] : undefined}>
                  {requested ? (
                    <span className={s.mark}>
                      <CheckIcon size={16} />
                    </span>
                  ) : null}
                  <span>
                    아래 버튼을 누르면 <strong>{phone || "입력한 번호"}</strong>의 카카오톡으로 인증 요청이 가요.
                    {requested ? <span className={s.sent}> 요청을 보냈어요.</span> : null}
                  </span>
                </li>
                <li>
                  <span>카카오톡에서 요청을 열고 인증을 눌러 주세요.</span>
                </li>
                <li>
                  <span>팬꾹으로 돌아와 「인증했어요, 가입하기」를 누르면 가입 완료예요.</span>
                </li>
              </ol>
              {requested ? (
                <p className={`hint ${s.again}`}>
                  요청이 오지 않았나요?{" "}
                  <button className={s["text-btn"]} type="button" aria-disabled={busy} onClick={() => void sendRequest()}>
                    다시 보내기
                  </button>
                </p>
              ) : null}
              {errorLine(step === 3)}
            </fieldset>

            <div className={step === 1 ? `${s["step-actions"]} ${s["no-prev"]}` : s["step-actions"]}>
              {step > 1 ? (
                <button
                  className="btn btn--line"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    go(step - 1);
                  }}
                >
                  이전
                </button>
              ) : null}
              {step < LAST ? (
                <button className={`btn ${s.next}`} type="submit">
                  다음
                </button>
              ) : (
                <button className={`btn btn--kakao ${s.next}`} type="submit" aria-disabled={busy} aria-busy={busy || undefined}>
                  <KakaoBubble size={24} />
                  {requested ? "인증했어요, 가입하기" : "카카오톡으로 인증 요청 보내기"}
                </button>
              )}
            </div>
          </form>
          <p className="foot-line">
            이미 회원이신가요? <Link href="/login">로그인</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
