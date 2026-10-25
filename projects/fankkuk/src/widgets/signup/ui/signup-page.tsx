"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { PASSWORD_HINT } from "@/entities/session/model/password-rule";
import { resolveTagSelection, type TagOption } from "@/entities/creator/model/creator-tags";
import { FAN_NAME_MAX } from "@/entities/creator/model/fan-name";
import { HEARD_FROM, HEARD_FROM_LABEL, isHeardFrom, type HeardFrom } from "@/entities/metrics/model/signup-source";
import { TagPicker } from "@/features/creator-tags-edit/ui/tag-picker";
import { completeSignup } from "@/features/signup/api/complete-signup";
import { requestPhoneVerification } from "@/features/signup/api/signup-client";
import { availabilityBlock, availabilityLine, type AvailabilityTone } from "@/features/signup/model/name-availability";
import { useNameAvailability } from "@/features/signup/model/use-name-availability";
import {
  applyPhoneEdit,
  EMAIL_CUSTOM,
  EMAIL_DOMAINS,
  emailLocalTyped,
  joinEmail,
  type EmailParts,
} from "@/features/signup/model/signup-fields";
import {
  checkDetails,
  checkField,
  CREATOR_PROFILE_LIMITS,
  type DetailsField,
  type LiveField,
  type LiveValues,
} from "@/features/signup/model/signup-input";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import { Sentences } from "@/shared/ui/sentences";
import s from "./signup.module.css";

// 회원가입 3단계. 시안: docs/design/mockups/site/part6-2026-10-25/signup.html (design-rules 29절 — 머리는 카드 밖, 단계 표시는 알약 줄 하나, 2단계는 구분선 + 소제목 묶음 넷) · 스펙: docs/specs/signup.md
// 시안은 세 단계를 한 화면에 쌓아 보이지만, 가입은 한 번에 한 단계씩 넘기는 흐름을 그대로 둔다 — 지금 단계의 카드 한 장만 보인다.
// 3단계: 「인증 요청 보내기」로 카카오톡에 요청 → 카카오톡에서 인증 → 「인증했어요, 가입하기」.
// 브라우저는 번호표만 들고 있다 — 인증됐는지는 서버가 카카오에게 묻는다(INV-U1).
// 입력칸에 name 을 두지 않는다 — 폼 기본 제출이 일어나도 값이 주소창에 실리지 않게.
// 2단계 칸은 입력하거나 칸을 떠난 뒤부터 바로 아래에 안내를 띄운다(맞으면 짧은 확인, 틀리면 무엇이 틀렸는지 — 판정은 checkField).
// 아이디·닉네임은 형식이 맞으면 입력을 멈춘 뒤 0.4초에 서버에 미리 묻는다(INV-U14) — 확인 중… / 쓸 수 있어요 / 이미 쓰고 있어요 /
// 형식이 맞지 않아요 / 잠시 뒤에 다시 확인해 주세요. 입력이 바뀌면 이전 답은 버린다. 최종 판정은 가입 때 서버가 한다(INV-U13).
// 줄바꿈(29절): 칸 안내는 문장마다 줄(<Sentences>), 붙여 쓰는 말은 \u00a0, 가운뎃점 덩어리는 \u2060 으로 붙인다.

const STEPS = ["유형 선택", "정보 입력", "본인 확인"] as const;
const LAST = STEPS.length;

type TermKey = "service" | "privacy" | "news";
type Role = "fan" | "creator";
type ErrorField = DetailsField | "verification" | "form";
type LiveMessage = { tone: AvailabilityTone; message: string };

/** 칸별 안내가 붙는 칸 → 입력 요소 id 의 꼬리. 「다음」에서 막히면 이 칸으로 포커스를 보낸다. */
const LIVE_IDS: Record<LiveField, string> = {
  loginId: "id",
  nickname: "nick",
  email: "mail",
  password: "pw",
  passwordConfirm: "pw2",
  phone: "tel",
  creatorName: "cr-name",
  channelTitle: "cr-channel",
};
const LIVE_FIELDS = Object.keys(LIVE_IDS) as LiveField[];
const isLiveField = (x: ErrorField): x is LiveField => Object.hasOwn(LIVE_IDS, x);

// href 가 없는 항목(선택 동의)은 「보기」를 그리지 않는다(갈 곳이 없다 — UX 명세 signup.md 바꿀 것 2). 전문 화면이 생기면 href 만 채운다.
const TERMS: ReadonlyArray<{
  key: TermKey;
  label: string;
  required: boolean;
  href?: string;
}> = [
  { key: "service", label: "이용약관", required: true, href: "/terms" },
  {
    key: "privacy",
    label: "개인정보 수집\u2060·\u2060이용",
    required: true,
    href: "/privacy",
  },
  { key: "news", label: "이벤트\u2060·\u2060소식 알림 받기", required: false },
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
  const [nickname, setNickname] = useState("");
  const [emailParts, setEmailParts] = useState<EmailParts>({
    local: "",
    choice: "",
    custom: "",
  });
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [phone, setPhone] = useState("");
  // 크리에이터로 가입할 때만 받는 기본 공개 정보(creator-verification INV-V1). 채널 주소는 가입 뒤 본인 확인 때 받는다.
  const [creatorName, setCreatorName] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  // 팬덤 이름(추가 요청 3) — 선택. 비우면 없음
  const [fanName, setFanName] = useState("");
  const [agreed, setAgreed] = useState<Record<TermKey, boolean>>({
    service: false,
    privacy: false,
    news: false,
  });
  // metrics INV-Q4: 「어디서 알게 되셨나요」 — 고르지 않아도 가입된다
  const [heardFrom, setHeardFrom] = useState<HeardFrom | null>(null);
  // 인증 요청을 보냈는가. 번호표 자체는 서버가 쿠키로 들고 있다(INV-U1). 번호를 고치면 요청부터 다시 —
  // 다른 번호의 확인으로 가입하지 않게(서버도 번호 대조로 막는다).
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  // server: 가입 요청에서 서버가 돌려준 오류(칸별 안내 칸이라도 낭독기에 알린다)
  const [error, setError] = useState<{
    field: ErrorField;
    message: string;
    server?: boolean;
  } | null>(null);
  // 한 번이라도 입력했거나 떠난 칸 — 그 전에는 안내를 띄우지 않는다
  const [touched, setTouched] = useState<Partial<Record<LiveField, boolean>>>({});
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

  const showError = (next: { field: ErrorField; message: string; server?: boolean }) => {
    setError(next);
    setErrorSeq((n) => n + 1);
  };

  const email = joinEmail(emailParts);
  const liveValues: LiveValues = {
    loginId,
    nickname,
    email: emailParts,
    password,
    passwordConfirm,
    phone,
    creatorName,
    channelTitle,
  };
  const touch = (field: LiveField) => setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  // 칸을 고치면 그 칸에 걸려 있던 「다음」·서버 오류를 내리고 실시간 안내로 돌아간다
  const edited = (field: LiveField) => {
    touch(field);
    setError((e) => (e?.field === field ? null : e));
  };
  // INV-U14: 형식이 맞는 아이디·닉네임만 미리 묻는다(형식이 틀리면 묻지 않고 형식 안내만)
  const askable = (field: "loginId" | "nickname") => (touched[field] && checkField(field, liveValues).ok ? liveValues[field].trim() : null);
  const idCheck = useNameAvailability("loginId", askable("loginId"));
  const nickCheck = useNameAvailability("nickname", askable("nickname"));
  // 지금 칸 값에 대한 답이 아니면(아직 묻는 중·이전 값의 답) 확인 중으로 둔다
  const availabilityOf = (field: "loginId" | "nickname"): LiveMessage =>
    availabilityLine((field === "loginId" ? idCheck : nickCheck).state, liveValues[field].trim());
  const liveOf = (field: LiveField): LiveMessage | null => {
    if (error?.field === field) return { tone: "bad", message: error.message };
    if (!touched[field]) return null;
    const own = checkField(field, liveValues);
    if (!own.ok) return { tone: "bad", message: own.message };
    if (field === "loginId" || field === "nickname") return availabilityOf(field);
    return { tone: "ok", message: own.message };
  };
  const liveId = (field: LiveField) => f(`${LIVE_IDS[field]}-m`);
  const liveAttrs = (field: LiveField, hintId?: string) => {
    const m = liveOf(field);
    const describedBy = [hintId, m ? liveId(field) : null].filter(Boolean).join(" ");
    return {
      "aria-describedby": describedBy || undefined,
      "aria-invalid": m?.tone === "bad" ? true : undefined,
    };
  };
  const liveLine = (field: LiveField) => {
    const m = liveOf(field);
    if (!m) return null;
    return (
      <p className={`${s.live} ${s[`live-${m.tone}`]}`} id={liveId(field)}>
        {m.tone === "ok" ? <CheckIcon size={16} /> : null}
        {m.message}
      </p>
    );
  };

  // 「다음」에서 막혔을 때 — 칸별 안내 칸이면 모든 칸의 안내를 켜고 틀린 칸으로 포커스, 아니면(약관·태그) 아래 오류 줄
  const reject = (problem: { field: DetailsField; message: string }) => {
    const field = problem.field;
    if (!isLiveField(field)) {
      showError(problem);
      return;
    }
    setTouched(Object.fromEntries(LIVE_FIELDS.map((k) => [k, true])));
    const own = checkField(field, liveValues);
    showError({ field, message: own.ok ? problem.message : own.message });
    requestAnimationFrame(() => document.getElementById(f(LIVE_IDS[field]))?.focus());
  };

  // 태그는 화면에서 먼저 합친다(creator-tags INV-T3) — 직접 입력이 선택지 이름과 같으면 그 선택지로 세어 보낸다.
  // 합칠 수 없으면(숨긴 선택지·개수 초과 등) 고른 그대로 두고, details() 가 태그 칸에 문구를 띄운다.
  const tagSelection = () => resolveTagSelection(tagOptions, tagIds, customTag);
  const creatorProfile = () => {
    if (role !== "creator") return undefined;
    const t = tagSelection();
    return t.ok
      ? {
          name: creatorName,
          channelTitle,
          tagIds: t.tagIds,
          customTag: t.customTag ?? "",
          fanName,
        }
      : { name: creatorName, channelTitle, tagIds, customTag, fanName };
  };
  const details = (): { field: DetailsField; message: string } | null => {
    const problem = checkDetails({
      loginId,
      nickname,
      email,
      password,
      passwordConfirm,
      phone,
      terms: agreed,
      creator: creatorProfile(),
    });
    if (problem || role !== "creator") return problem;
    const t = tagSelection();
    return t.ok ? null : { field: "tags", message: t.message };
  };
  // 2단계 → 3단계. 칸 검사가 맞으면 아이디·닉네임 미리 확인의 답이 올 때까지 기다렸다가 판정한다(INV-U14) —
  // 확인 중에 눌러도 「이미 쓰는」 값으로 넘어가지 않게. 「이미 씀」·「형식 틀림」이면 그 칸에서 막는다(그 사이 바뀌는 것은 가입 때 서버가 다시 본다).
  const leaveDetails = async () => {
    if (busy) return;
    const problem = details();
    if (problem) {
      go(2);
      reject(problem);
      return;
    }
    const values = { loginId: loginId.trim(), nickname: nickname.trim() };
    setBusy(true);
    const [idState, nickState] = await Promise.all([idCheck.settle(values.loginId), nickCheck.settle(values.nickname)]);
    setBusy(false);
    const block = availabilityBlock({ loginId: idState, nickname: nickState }, values);
    if (block) {
      go(2);
      reject(block);
      return;
    }
    setError(null);
    go(LAST);
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
      nickname: nickname.trim(),
      email,
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
    showError({ field: r.field, message: r.message, server: true });
    if (r.field !== "verification" && r.field !== "form") go(2);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step === 2) {
      void leaveDetails();
      return;
    }
    setError(null);
    if (step < LAST) go(step + 1);
    else if (requested) void finish();
    else void sendRequest();
  };

  const allAgreed = TERMS.every((t) => agreed[t.key]);
  const setAll = (value: boolean) => setAgreed({ service: value, privacy: value, news: value });

  const invalid = (field: ErrorField) => (error?.field === field ? { "aria-invalid": true, "aria-describedby": f("error") } : {});
  // 칸별 안내 칸의 오류는 칸 아래에 보인다 — 서버가 돌려준 것만 낭독기용으로 한 번 더 알린다(눈에는 한 번만)
  const errorLine = (show: boolean) => {
    if (!show || !error) return null;
    if (isLiveField(error.field)) {
      return error.server ? (
        <p className="sr-only" role="alert" key={errorSeq}>
          {error.message}
        </p>
      ) : null;
    }
    return (
      <p className={`err ${s.error}`} id={f("error")} role="alert" key={errorSeq}>
        {error.message}
      </p>
    );
  };

  const onPhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const native = e.nativeEvent;
    const type = native instanceof InputEvent ? native.inputType : "";
    const deleting = type === "deleteContentBackward" ? "backward" : type === "deleteContentForward" ? "forward" : null;
    const next = applyPhoneEdit(phone, el.value, el.selectionStart ?? el.value.length, deleting);
    // 요소 값과 커서를 먼저 맞춘다 — 상태와 같은 값이 되므로 다시 그릴 때 React 가 커서를 끝으로 옮기지 않는다
    el.value = next.value;
    el.setSelectionRange(next.caret, next.caret);
    setPhone(next.value);
    setRequested(false);
    edited("phone");
  };

  const onEmailLocalChange = (value: string) => {
    // @ 를 치거나 주소를 통째로 붙여 넣으면 @ 뒤를 주소 칸으로 옮긴다 — 목록에 있는 주소면 고르고, 아니면 「직접 입력」 칸으로 포커스
    const next = emailLocalTyped(emailParts, value);
    setEmailParts(next.parts);
    edited("email");
    if (next.focusCustom) {
      requestAnimationFrame(() => {
        const el = document.getElementById(f("mail-custom"));
        if (el instanceof HTMLInputElement) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  };

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
                        if (k === LAST) {
                          void leaveDetails();
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
              {heading(1, "어떤 분이세요?")}
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
              {/* 크리에이터를 골랐을 때만(UX 명세 signup.md 바꿀 것 1) */}
              {role === "creator" ? (
                <p className={s.note}>
                  <strong>크리에이터로 가입하면</strong> 가입한 뒤에 활동 채널 주인이 맞는지 한 번 더 확인해요.
                  <span className="brk">
                    {
                      " 유튜브\u2060·\u2060치지직은 그 계정으로 로그인하면 바로 끝나요(인스타그램은 프로페셔널\u00a0계정만). SOOP 은 인증\u00a0코드를 채널\u00a0소개란에 붙이거나 팬꾹\u00a0계정 DM 으로 보내면 운영자가 확인해요."
                    }
                  </span>
                  <span className="brk">
                    {" 확인이 끝나야 "}
                    <span className="nw">「크리에이터 찾기」에</span> 나타나요.
                  </span>
                </p>
              ) : null}
            </fieldset>

            <fieldset className={s.step} hidden={step !== 2}>
              <legend className="sr-only">가입 정보</legend>
              {heading(2, "정보를 입력해\u00a0주세요")}
              <div className={s.grp}>
                <h3 className={s["grp-title"]}>계정 정보</h3>
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
                      onChange={(e) => {
                        setLoginId(e.target.value);
                        edited("loginId");
                      }}
                      onBlur={() => touch("loginId")}
                      {...liveAttrs("loginId", f("id-h"))}
                    />
                    {liveLine("loginId")}
                    <p className="hint" id={f("id-h")}>
                      <Sentences text={"영문 소문자\u2060·\u2060숫자\u2060·\u2060밑줄(_)로 4~20자예요. 가입한 뒤에는 아이디를 바꿀\u00a0수\u00a0없어요."} />
                    </p>
                  </div>
                  <div>
                    <label className="label" htmlFor={f("nick")}>
                      닉네임
                    </label>
                    <input
                      className="field"
                      id={f("nick")}
                      type="text"
                      autoComplete="nickname"
                      spellCheck={false}
                      value={nickname}
                      onChange={(e) => {
                        setNickname(e.target.value);
                        edited("nickname");
                      }}
                      onBlur={() => touch("nickname")}
                      {...liveAttrs("nickname", f("nick-h"))}
                    />
                    {liveLine("nickname")}
                    <p className="hint" id={f("nick-h")}>
                      <Sentences text={"팬꾹에서 보이는 이름이에요. 12자까지, 다른 사람이 쓰는 닉네임은 쓸\u00a0수\u00a0없어요. 가입한 뒤 계정\u00a0설정에서 바꿀\u00a0수\u00a0있어요."} />
                    </p>
                  </div>
                  <div>
                    <label className="label" htmlFor={f("mail")}>
                      이메일
                    </label>
                    <div className={s.email}>
                      <input
                        className="field"
                        id={f("mail")}
                        type="text"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="앞부분"
                        value={emailParts.local}
                        onChange={(e) => onEmailLocalChange(e.target.value)}
                        onBlur={() => touch("email")}
                        {...liveAttrs("email", f("mail-h"))}
                      />
                      <span className={s.at} aria-hidden="true">
                        @
                      </span>
                      <select
                        className="field"
                        aria-label="이메일 주소 고르기(@ 뒤)"
                        value={emailParts.choice}
                        onChange={(e) => {
                          const choice = e.currentTarget.value;
                          setEmailParts((p) => ({ ...p, choice }));
                          edited("email");
                          if (choice === EMAIL_CUSTOM) requestAnimationFrame(() => document.getElementById(f("mail-custom"))?.focus());
                        }}
                        onBlur={() => touch("email")}
                        {...liveAttrs("email")}
                      >
                        <option value="">주소 고르기</option>
                        {EMAIL_DOMAINS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                        <option value={EMAIL_CUSTOM}>직접 입력</option>
                      </select>
                    </div>
                    {emailParts.choice === EMAIL_CUSTOM ? (
                      <input
                        className={`field ${s["email-custom"]}`}
                        id={f("mail-custom")}
                        type="text"
                        inputMode="url"
                        autoCapitalize="none"
                        spellCheck={false}
                        aria-label="이메일 주소 직접 입력(@ 뒤)"
                        placeholder="예: example.co.kr"
                        value={emailParts.custom}
                        onChange={(e) => {
                          const custom = e.target.value;
                          setEmailParts((p) => ({ ...p, custom }));
                          edited("email");
                        }}
                        onBlur={() => touch("email")}
                        {...liveAttrs("email")}
                      />
                    ) : null}
                    {liveLine("email")}
                    <p className="hint" id={f("mail-h")}>
                      <Sentences text={"가입하면 확인 메일을 보내\u00a0드려요. 메일의 링크를 눌러야 이 주소로 선물\u00a0소식을 받아요."} />
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
                      onChange={(e) => {
                        setPassword(e.target.value);
                        edited("password");
                      }}
                      onBlur={() => touch("password")}
                      {...liveAttrs("password", f("pw-h"))}
                    />
                    {liveLine("password")}
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
                      onChange={(e) => {
                        setPasswordConfirm(e.target.value);
                        edited("passwordConfirm");
                      }}
                      onBlur={() => touch("passwordConfirm")}
                      {...liveAttrs("passwordConfirm")}
                    />
                    {liveLine("passwordConfirm")}
                  </div>
                </div>
              </div>
              <div className={s.grp}>
                <h3 className={s["grp-title"]}>연락처</h3>
                <div className="form">
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
                      onChange={onPhoneChange}
                      onBlur={() => touch("phone")}
                      {...liveAttrs("phone", f("tel-h"))}
                    />
                    {liveLine("phone")}
                    <p className="hint" id={f("tel-h")}>
                      <Sentences text={"선물\u00a0소식을 카카오톡 알림톡으로 보내\u00a0드릴 번호예요. 실명\u2060·\u2060주소처럼 따로 나눠 보관해요."} />
                    </p>
                  </div>
                </div>
              </div>
              {role === "creator" ? (
                <div className={s.grp}>
                  <h3 className={s["grp-title"]}>채널 정보</h3>
                  <div className="form">
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
                        onChange={(e) => {
                          setCreatorName(e.target.value);
                          edited("creatorName");
                        }}
                        onBlur={() => touch("creatorName")}
                        {...liveAttrs("creatorName", f("cr-name-h"))}
                      />
                      {liveLine("creatorName")}
                      <p className="hint" id={f("cr-name-h")}>
                        <Sentences text={`팬에게 보이는 이름이에요. ${CREATOR_PROFILE_LIMITS.name}자까지 적을\u00a0수\u00a0있어요.`} />
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
                        onChange={(e) => {
                          setChannelTitle(e.target.value);
                          edited("channelTitle");
                        }}
                        onBlur={() => touch("channelTitle")}
                        {...liveAttrs("channelTitle", f("cr-channel-h"))}
                      />
                      {liveLine("channelTitle")}
                      <p className="hint" id={f("cr-channel-h")}>
                        채널 주소는 가입한 뒤 본인 확인 때 받아요.
                      </p>
                    </div>
                    <div>
                      <label className="label" htmlFor={f("cr-fan")}>
                        팬덤 이름 <span className={`t-meta ${s.opt}`}>(선택)</span>
                      </label>
                      <input
                        className="field"
                        id={f("cr-fan")}
                        type="text"
                        autoComplete="off"
                        placeholder="예: 꿀벌단"
                        maxLength={FAN_NAME_MAX}
                        value={fanName}
                        onChange={(e) => {
                          setFanName(e.target.value);
                          setError((x) => (x?.field === "fanName" ? null : x));
                        }}
                        aria-describedby={error?.field === "fanName" ? `${f("cr-fan-h")} ${f("error")}` : f("cr-fan-h")}
                        aria-invalid={error?.field === "fanName" ? true : undefined}
                      />
                      <p className="hint" id={f("cr-fan-h")}>
                        <Sentences
                          text={`팬을 부르는 이름이에요. ${FAN_NAME_MAX}자까지, 비워 둬도 돼요. 가입한 뒤 내\u00a0팬꾹\u00a0꾸미기에서 바꿀\u00a0수\u00a0있어요.`}
                        />
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
                </div>
              ) : null}
              <div className={s.grp}>
                <h3 className={s["grp-title"]}>마무리</h3>
                <div className="form">
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
                      <Sentences text="답하지 않아도 가입돼요. 어떤 길로 많이 찾아오시는지만 모아서 봐요." />
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
                              onChange={(e) =>
                                setAgreed((prev) => ({
                                  ...prev,
                                  [t.key]: e.target.checked,
                                }))
                              }
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
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  {errorLine(step === 2)}
                </div>
              </div>
            </fieldset>

            <fieldset className={s.step} hidden={step !== 3}>
              <legend className="sr-only">카카오톡 본인 확인</legend>
              {heading(3, "카카오톡으로 본인 확인")}
              <p className={`t-desc ${s.lead}`}>
                <Sentences text={"휴대폰 번호의 주인이 맞는지 카카오톡\u00a0인증으로 확인해요. 인증이 끝나면 가입이 마무리돼요."} />
              </p>
              <ol className={s.kakao}>
                <li className={requested ? s["is-done"] : undefined}>
                  {requested ? (
                    <span className={s.mark}>
                      <CheckIcon size={16} />
                    </span>
                  ) : null}
                  <span>
                    아래 버튼을 누르면 <strong className="nw">{phone || "입력한 번호"}</strong>의 카카오톡으로 인증 요청이 가요.
                    {requested ? <span className={s.sent}> 요청을 보냈어요.</span> : null}
                  </span>
                </li>
                <li>
                  <span>{"카카오톡에서 요청을 열고 인증을 눌러\u00a0주세요."}</span>
                </li>
                <li>
                  <span>
                    팬꾹으로 돌아와 <span className="nw">「인증했어요, 가입하기」를</span> 누르면 가입 완료예요.
                  </span>
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

            {/* 휴대폰 폭에서 글자가 긴 카카오 버튼 줄은 위아래로 쌓고 주 버튼이 위(29절 줄바꿈 5) */}
            <div
              className={[s["step-actions"], step === 1 ? s["no-prev"] : "", step === LAST ? s["kakao-row"] : ""].filter(Boolean).join(" ")}
            >
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
                <button className={`btn ${s.next}`} type="submit" aria-disabled={busy} aria-busy={busy || undefined}>
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
