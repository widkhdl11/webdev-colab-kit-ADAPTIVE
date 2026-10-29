"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { PASSWORD_HINT } from "@/entities/session/model/password-rule";
import { PHONE_CODE_EXPIRED_MESSAGE, PHONE_CODE_TTL_SECONDS } from "@/entities/session/model/phone-code";
import { resolveTagSelection, type TagOption } from "@/entities/creator/model/creator-tags";
import { FAN_NAME_MAX } from "@/entities/creator/model/fan-name";
import { HEARD_FROM, HEARD_FROM_LABEL, isHeardFrom, type HeardFrom } from "@/entities/metrics/model/signup-source";
import { TagPicker } from "@/features/creator-tags-edit/ui/tag-picker";
import { completeSignup } from "@/features/signup/api/complete-signup";
import { checkPhoneCode, requestPhoneCode } from "@/features/signup/api/signup-client";
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
import { useCountdown } from "@/shared/lib/time/use-countdown";
import { Sentences } from "@/shared/ui/sentences";
import { SIGNUP_PHONE_KEY } from "../model/signup-phone-key";
import s from "./signup.module.css";

// 회원가입 단계 화면. 시안: docs/design/mockups/site/v43-signup/signup-1-role·2-info·3-phone (UX 명세 signup.md 「2026-10-29 단계 화면」) · 스펙: docs/specs/signup.md
// 팬은 세 단계(유형 선택 → 정보 입력 → 휴대폰 확인), 크리에이터는 다섯 단계(+ 채널 확인 → 승인 서명)다. 한 번에 지금 단계의 카드 한 장만 보인다.
// 3단계: 「인증번호 받기」 → 문자로 받은 6자리 입력 → 「확인」 → 「가입 완료」(크리에이터는 「다음」). 계정은 여기서 만들어진다.
// 브라우저는 번호표(쿠키)와 입력한 6자리만 다룬다 — 맞혔는지는 서버가 판정한다(INV-U1·U15). 남은 시간 표시는 화면 편의일 뿐 만료 판정은 DB 가 한다.
// 입력칸에 name 을 두지 않는다 — 폼 기본 제출이 일어나도 값이 주소창에 실리지 않게.
// 2단계 칸은 입력하거나 칸을 떠난 뒤부터 바로 아래에 안내를 띄운다(맞으면 짧은 확인, 틀리면 무엇이 틀렸는지 — 판정은 checkField).
// 아이디·닉네임은 형식이 맞으면 입력을 멈춘 뒤 0.4초에 서버에 미리 묻는다(INV-U14) — 문구는 name-availability.ts.
// 입력이 바뀌면 이전 답은 버린다. 최종 판정은 가입 때 서버가 한다(INV-U13).
// 줄바꿈(29절): 칸 안내는 문장마다 줄(<Sentences>), 붙여 쓰는 말은  , 가운뎃점 덩어리는 ⁠ 으로 붙인다.

const FORM_STEPS = ["유형 선택", "정보 입력", "휴대폰 확인"] as const;
// 크리에이터만 더 붙는 단계 — 계정을 만든 뒤라 로그인한 화면(/signup/creator, widgets/signup/ui/signup-creator-steps)이 맡는다
const CREATOR_STEPS = ["채널 확인", "승인 서명"] as const;
const LAST = FORM_STEPS.length;
/** 인증번호를 맞힐 수 있는 시간(INV-U15) — 표시용. 판정은 DB 가 한다 */
const CODE_SECONDS = PHONE_CODE_TTL_SECONDS;
const EXPIRED_MESSAGE = PHONE_CODE_EXPIRED_MESSAGE;

type TermKey = "age14" | "service" | "privacy" | "news";
type Role = "fan" | "creator";
type ErrorField = DetailsField | "verification" | "form";
type LiveMessage = { tone: AvailabilityTone; message: string };
/** 3단계 진행 — idle: 받기 전 · sent: 받은 뒤 입력 중 · verified: 맞힘 */
type PhonePhase = "idle" | "sent" | "verified";
/** 휴대폰 칸 오류 — field: 칸 아래 줄(형식) · box: 빨간 상자(발송·한도) · exists: 빨간 상자 + 로그인(INV-U11) */
type PhoneProblem = { kind: "field" | "box" | "exists"; message: string };

/** 칸별 안내가 붙는 칸(2단계) → 입력 요소 id 의 꼬리. 「다음」에서 막히면 이 칸으로 포커스를 보낸다. */
const LIVE_IDS: Partial<Record<LiveField, string>> = {
  loginId: "id",
  nickname: "nick",
  email: "mail",
  password: "pw",
  passwordConfirm: "pw2",
  creatorName: "cr-name",
  channelTitle: "cr-channel",
};
const LIVE_FIELDS = Object.keys(LIVE_IDS) as LiveField[];
const isLiveField = (x: ErrorField): x is LiveField => Object.hasOwn(LIVE_IDS, x);

// href 가 없는 항목(만 14세 확인·선택 동의)은 「보기」를 그리지 않는다(갈 곳이 없다). 전문 화면이 생기면 href 만 채운다.
const TERMS: ReadonlyArray<{
  key: TermKey;
  label: string;
  required: boolean;
  href?: string;
  /** 체크 칸 아래 한 줄 — 무엇을 어디로 받는지(전문 화면이 없는 선택 동의) */
  detail?: string;
}> = [
  // INV-U16: 만 14세 확인 — 약관 동의와 같이 동의 시각으로 남는다
  { key: "age14", label: "만 14세 이상입니다", required: true },
  { key: "service", label: "이용약관", required: true, href: "/terms" },
  {
    key: "privacy",
    label: "개인정보 수집⁠·⁠이용",
    required: true,
    href: "/privacy",
  },
  { key: "news", label: "이벤트⁠·⁠소식 알림 받기", required: false, detail: "팬꾹 이벤트와 새 소식을 이메일로 보내 드려요." },
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
    age14: false,
    service: false,
    privacy: false,
    news: false,
  });
  // metrics INV-Q4: 「어디서 알게 되셨나요」 — 고르지 않아도 가입된다
  const [heardFrom, setHeardFrom] = useState<HeardFrom | null>(null);
  // 3단계. 번호표 자체는 서버가 쿠키로 들고 있다(INV-U1). 받은 뒤 번호를 고치면 받기부터 다시 —
  // 다른 번호의 확인으로 가입하지 않게(서버도 번호 대조로 막는다).
  const [phase, setPhase] = useState<PhonePhase>("idle");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [codeNote, setCodeNote] = useState<LiveMessage | null>(null);
  // 다섯 번 틀려 버려진 인증번호 — 다시 받기 전까지 입력·확인을 잠근다(INV-U10)
  const [locked, setLocked] = useState(false);
  const [phoneProblem, setPhoneProblem] = useState<PhoneProblem | null>(null);
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
  const codeRef = useRef<HTMLInputElement>(null);
  const headingRefs = useRef<Array<HTMLHeadingElement | null>>([]);

  // 단계를 옮기면 새 단계 제목으로 포커스를 보내고 단계 표시가 보이게 올린다(시안과 같다). 처음 열 때는 옮기지 않는다.
  useEffect(() => {
    if (!moved) return;
    headingRefs.current[step - 1]?.focus({ preventScroll: true });
    navRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [step, moved]);

  // 남은 시간 — 받은 뒤에만 1초마다 다시 그린다(번호 바꾸기 패널과 같은 시계)
  const countdown = useCountdown(phase === "sent" ? expiresAt : null, CODE_SECONDS);
  const expired = phase === "sent" && countdown.expired;
  const timerText = countdown.text;

  const steps: readonly string[] = role === "creator" ? [...FORM_STEPS, ...CREATOR_STEPS] : FORM_STEPS;

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
  const liveId = (field: LiveField) => f(`${LIVE_IDS[field] ?? field}-m`);
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
        <span>
          <Sentences text={m.message} />
        </span>
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
    requestAnimationFrame(() => document.getElementById(f(LIVE_IDS[field] ?? field))?.focus());
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

  // 「이 번호로 가입된 계정이 있습니다」 뒤에는 번호 칸을 고치기 전까지 다시 받지 않는다(고치면 onPhoneChange 가 안내를 내린다)
  const phoneTaken = phoneProblem?.kind === "exists";

  const sendCode = async () => {
    if (busy || phase === "verified" || phoneTaken) return;
    const own = checkField("phone", liveValues);
    if (!own.ok) {
      setPhoneProblem({ kind: "field", message: own.message });
      document.getElementById(f("tel"))?.focus();
      return;
    }
    setBusy(true);
    setPhoneProblem(null);
    const r = await requestPhoneCode(phone);
    setBusy(false);
    if (!r.ok) {
      setPhoneProblem({ kind: r.reason === "phone" ? "field" : "box", message: r.message });
      return;
    }
    const sentAt = Date.now();
    setPhase("sent");
    setCode("");
    setLocked(false);
    setExpiresAt(sentAt + CODE_SECONDS * 1000);
    setCodeNote({ tone: "wait", message: `${phone} 번호로 인증번호를 보냈습니다.` });
    requestAnimationFrame(() => codeRef.current?.focus());
  };

  const confirmCode = async () => {
    if (busy || phase !== "sent" || locked || expired) return;
    setBusy(true);
    const r = await checkPhoneCode(code);
    setBusy(false);
    if (r.ok) {
      setPhase("verified");
      setCodeNote({ tone: "ok", message: "휴대폰 번호를 확인했습니다." });
      return;
    }
    if (r.reason === "locked") setLocked(true);
    if (r.reason === "expired") setExpiresAt(Date.now());
    setCodeNote({ tone: "bad", message: r.message });
    if (r.reason !== "locked") requestAnimationFrame(() => codeRef.current?.focus());
  };

  // 받기 전으로 돌아간다 — 번호표가 쓸 수 없게 됐거나(10분 지남 등) 번호가 이미 가입돼 있을 때, 받은 뒤 번호를 고쳤을 때
  const resetPhone = (problem: PhoneProblem | null) => {
    setPhase("idle");
    setCode("");
    setCodeNote(null);
    setLocked(false);
    setPhoneProblem(problem);
  };

  const finish = async () => {
    if (busy || phase !== "verified") return;
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
      // 팬: 「/」 가 역할별 첫 화면으로 나눈다. 크리에이터: 4단계(채널 확인)로 — 5단계가 3단계 번호를 미리 채우도록 이 탭에만 남긴다
      if (role === "creator" && r.loggedIn) {
        try {
          window.sessionStorage.setItem(SIGNUP_PHONE_KEY, phone);
        } catch {
          // 저장소를 못 쓰면 5단계에서 번호를 다시 적는다
        }
        router.push("/signup/creator");
      } else {
        router.push(r.loggedIn ? "/" : "/login");
      }
      router.refresh();
      return;
    }
    setBusy(false);
    // INV-U11: 번호 중복은 인증번호를 맞힌 뒤의 가입에서만 알려 주고, 로그인으로 안내한다
    if (r.field === "phone") return resetPhone({ kind: "exists", message: r.message });
    if (r.dropVerification) return resetPhone({ kind: "box", message: r.message });
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
    else void finish();
  };

  const allAgreed = TERMS.every((t) => agreed[t.key]);
  const setAll = (value: boolean) => setAgreed({ age14: value, service: value, privacy: value, news: value });

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
        <Sentences text={error.message} />
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
    // 받은 뒤 번호를 고치면 받기 전으로(UX 명세 step 3 sent) — 맞힌 뒤에는 칸이 읽기 전용이다
    resetPhone(null);
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

  // 시간이 지났으면 서버에 묻지 않고 바로 알린다(서버도 같은 답을 한다)
  const codeLine: LiveMessage | null = expired && !locked ? { tone: "bad", message: EXPIRED_MESSAGE } : codeNote;
  const codeClosed = busy || phase !== "sent" || locked || expired;

  return (
    <main id="main">
      <section className={s.page} aria-labelledby={f("title")}>
        <div className={`container auth ${s.box}`}>
          <div className="head">
            <h1 className="t-title" id={f("title")}>
              회원가입
            </h1>
          </div>

          <nav className={s["steps-wrap"]} aria-label="가입 단계" ref={navRef}>
            <ol className={s.steps}>
              {steps.map((label, i) => {
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
              <legend className="sr-only">어떤 분이세요?</legend>
              {heading(1, "어떤 분이세요?")}
              <div className={s.choices}>
                <label className={s.choice}>
                  <input type="radio" name="kind" value="fan" checked={role === "fan"} onChange={() => setRole("fan")} />
                  <span>
                    <strong>팬</strong>
                    <span className="t-meta">좋아하는 크리에이터에게 선물 보내기</span>
                  </span>
                </label>
                <label className={s.choice}>
                  <input type="radio" name="kind" value="creator" checked={role === "creator"} onChange={() => setRole("creator")} />
                  <span>
                    <strong>크리에이터</strong>
                    <span className="t-meta">팬이 보내는 선물 받기</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className={s.step} hidden={step !== 2}>
              <legend className="sr-only">회원 정보 입력</legend>
              {heading(2, "회원 정보 입력")}
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
                      {"영문 소문자⁠·⁠숫자⁠·⁠밑줄(_) 4~20자 · 가입 후 변경 불가"}
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
                      {"팬꾹에서 사용할 이름 · 최대 12자 · 중복 사용 불가"}
                      <br />
                      {"가입 후 ‘프로필 수정’에서 변경할 수 있습니다."}
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
                        placeholder="이메일 아이디"
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
                        aria-label="이메일 도메인 선택(@ 뒤)"
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
                        <option value="">이메일 도메인 선택</option>
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
                      <Sentences text={"가입 후 확인 메일을 발송합니다. 메일의 링크에서 주소를 확인하면 선물 소식을 이메일로 받을 수 있습니다."} />
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
                        {`팬에게 표시되는 이름 · 최대 ${CREATOR_PROFILE_LIMITS.name}자`}
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
                        채널 주소는 4단계에서 입력합니다.
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
                        {`팬을 부르는 이름 · 최대 ${FAN_NAME_MAX}자 · 선택 입력`}
                        <br />
                        {"가입 후 ‘상세 설정 > 팬덤’에서 변경할 수 있습니다."}
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
                <h3 className={s["grp-title"]}>선택 입력 사항</h3>
                <div className="form">
                  <div>
                    <label className="label" htmlFor={f("heard")}>
                      팬꾹을 알게 된 경로 <span className={`t-meta ${s.opt}`}>(선택)</span>
                    </label>
                    <select
                      className="field"
                      id={f("heard")}
                      aria-describedby={f("heard-h")}
                      value={heardFrom ?? ""}
                      onChange={(e) => setHeardFrom(isHeardFrom(e.currentTarget.value) ? e.currentTarget.value : null)}
                    >
                      <option value="">선택 안 함</option>
                      {HEARD_FROM.map((k) => (
                        <option key={k} value={k}>
                          {HEARD_FROM_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <p className="hint" id={f("heard-h")}>
                      서비스 유입 경로를 파악하기 위한 선택 항목입니다.
                    </p>
                  </div>
                </div>
              </div>
              <div className={s.grp}>
                <h3 className={s["grp-title"]} id={f("terms")}>
                  약관 동의
                </h3>
                <div className="form">
                  <div role="group" aria-labelledby={f("terms")}>
                    <div className={s.terms}>
                      <div>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={allAgreed}
                            onChange={(e) => setAll(e.target.checked)}
                            aria-describedby={f("all-h")}
                          />{" "}
                          전체 동의
                        </label>
                        <p className={`t-meta ${s["term-detail"]}`} id={f("all-h")}>
                          {"선택 항목 동의가 포함됩니다. 선택 항목에 동의하지 않아도 가입할 수 있습니다."}
                        </p>
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
                              {t.detail ? <span className={`t-meta ${s["term-detail"]}`}>{t.detail}</span> : null}
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
              <legend className="sr-only">휴대폰 번호 확인</legend>
              {heading(3, "휴대폰 번호 확인")}
              <div className="form">
                <div>
                  <label className="label" htmlFor={f("tel")}>
                    휴대폰 번호
                  </label>
                  <div className={s["phone-row"]}>
                    <input
                      className="field"
                      id={f("tel")}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="010-0000-0000"
                      value={phone}
                      readOnly={phase === "verified"}
                      onChange={onPhoneChange}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault(); // 폼 제출(가입 완료) 대신 인증번호 받기
                        void sendCode();
                      }}
                      aria-invalid={phoneProblem ? true : undefined}
                      aria-describedby={phoneProblem ? f("tel-m") : undefined}
                    />
                    <button className="btn btn--line" type="button" aria-disabled={busy || phase === "verified" || phoneTaken} onClick={() => void sendCode()}>
                      {phase === "sent" ? "다시 받기" : "인증번호 받기"}
                    </button>
                  </div>
                  {phoneProblem?.kind === "field" ? (
                    <p className={`${s.live} ${s["live-bad"]}`} id={f("tel-m")} role="alert">
                      <span>{phoneProblem.message}</span>
                    </p>
                  ) : null}
                  {phoneProblem && phoneProblem.kind !== "field" ? (
                    <div className={`err ${s["phone-err"]}`} id={f("tel-m")} role="alert">
                      <Sentences text={phoneProblem.message} />
                      {phoneProblem.kind === "exists" ? (
                        <div className={s["phone-err-action"]}>
                          <Link className="btn btn--line btn--sm" href="/login">
                            로그인
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {phase !== "idle" ? (
                  <div>
                    <label className="label" htmlFor={f("code")}>
                      인증번호
                    </label>
                    <div className={s["phone-row"]}>
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
                          disabled={phase === "verified" || locked}
                          onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault(); // 폼 제출(가입 완료) 대신 인증번호 확인
                            void confirmCode();
                          }}
                          aria-invalid={codeLine?.tone === "bad" ? true : undefined}
                          aria-describedby={codeLine ? f("code-m") : undefined}
                        />
                        <span className={expired ? `${s.timer} ${s["is-zero"]}` : s.timer} role="timer" aria-label="남은 시간">
                          {phase === "sent" ? timerText : ""}
                        </span>
                      </div>
                      <button className="btn" type="button" aria-disabled={codeClosed} onClick={() => void confirmCode()}>
                        확인
                      </button>
                    </div>
                    {codeLine ? (
                      <p className={`${s.live} ${s[`live-${codeLine.tone}`]}`} id={f("code-m")} role={codeLine.tone === "bad" ? "alert" : "status"}>
                        {codeLine.tone === "ok" ? <CheckIcon size={16} /> : null}
                        <span>{codeLine.message}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {errorLine(step === 3)}
            </fieldset>

            <div className={[s["step-actions"], step === 1 ? s["no-prev"] : ""].filter(Boolean).join(" ")}>
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
              <button
                className={`btn ${s.next}`}
                type="submit"
                aria-disabled={busy || (step === LAST && phase !== "verified")}
                aria-busy={busy || undefined}
              >
                {step < LAST || role === "creator" ? "다음" : "가입 완료"}
              </button>
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
