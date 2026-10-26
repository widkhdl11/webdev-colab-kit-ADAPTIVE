"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ANNIVERSARY_MAX, ANNIVERSARY_NAME_MAX, daysInMonth, MONTHLY_LIMIT_MAX, resumeRange, type CalendarDate, type MyCreatorReceiving } from "@/entities/creator/model/receiving";
import { sendCreatorDays, sendCreatorReceiving } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars } from "@/features/creator-settings-save/model/creator-settings-input";
import s from "./creator-settings.module.css";

// 크리에이터 — 선물 받기(받는 상태·팬당 한 달 한도)와 생일·기념일 (creator-receiving INV-B1·B3·B5·B7).
// 저장은 로그인 세션으로만 — 크리에이터 ID 를 보내지 않는다. 범위 검사는 서버·DB 가 한국 시간 오늘로 다시 한다.
// 한도 숫자는 이 본인 화면에만 보인다(INV-B6).

/** field 가 있으면 그 칸의 오류다(칸에 aria-invalid·aria-describedby 를 건다). */
type Msg = { ok: boolean; text: string; field?: "resumeOn" } | null;
/** 저장 결과 줄 — 받기 어려운 품목 칸(hard-items-section)도 같은 줄을 쓴다. */
export type SaveMsg = Msg;
type AnniversaryDraft = {
  key: number;
  name: string;
  month: number;
  day: number;
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const LIMITS = Array.from({ length: MONTHLY_LIMIT_MAX }, (_, i) => i + 1);
const daysOf = (month: number) => Array.from({ length: daysInMonth(month) }, (_, i) => i + 1);

/** 저장됨은 상태 줄(role=status, 늘 있음)로 조용히, 오류는 오류 줄(role=alert, id = `${id}-err`)로 바로 읽힌다. */
export function SaveMessage({ id, msg }: { id: string; msg: Msg }) {
  return (
    <>
      <p className={`t-meta ${s.msg}`} role="status" id={id}>
        {msg?.ok ? msg.text : null}
      </p>
      {msg && !msg.ok ? (
        <p className={`err ${s.msg}`} role="alert" id={`${id}-err`}>
          {msg.text}
        </p>
      ) : null}
    </>
  );
}

function MonthDaySelect({
  idBase,
  label,
  month,
  day,
  allowEmpty,
  onChange,
}: {
  idBase: string;
  label: string;
  month: number | null;
  day: number | null;
  allowEmpty: boolean;
  onChange: (month: number | null, day: number | null) => void;
}) {
  return (
    <div className={s["md-row"]} role="group" aria-label={label}>
      <label className="sr-only" htmlFor={`${idBase}-m`}>
        {label} 월
      </label>
      <select
        id={`${idBase}-m`}
        className="field"
        value={month ?? ""}
        onChange={(e) => {
          const m = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
          onChange(m, m === null ? null : Math.min(day ?? 1, daysInMonth(m)));
        }}
      >
        {allowEmpty ? <option value="">정하지 않음</option> : null}
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {m}월
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${idBase}-d`}>
        {label} 일
      </label>
      <select id={`${idBase}-d`} className="field" value={day ?? ""} disabled={month === null} onChange={(e) => onChange(month, Number(e.currentTarget.value))}>
        {month === null ? <option value="">—</option> : null}
        {daysOf(month ?? 1).map((d) => (
          <option key={d} value={d}>
            {d}일
          </option>
        ))}
      </select>
    </div>
  );
}

export function ReceivingSection({ initial, today }: { initial: MyCreatorReceiving; today: CalendarDate }) {
  const router = useRouter();
  const range = resumeRange(today);

  const [resting, setResting] = useState(initial.resumeOn !== null);
  const [resumeOn, setResumeOn] = useState(initial.resumeOn ?? "");
  const [limit, setLimit] = useState<number | null>(initial.monthlyLimit);
  const [recvSaving, setRecvSaving] = useState(false);
  const [recvMsg, setRecvMsg] = useState<Msg>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const resumeInvalid = recvMsg?.field === "resumeOn";

  const [bMonth, setBMonth] = useState<number | null>(initial.birthday?.month ?? null);
  const [bDay, setBDay] = useState<number | null>(initial.birthday?.day ?? null);
  const [anniversaries, setAnniversaries] = useState<AnniversaryDraft[]>(initial.anniversaries.map((a, i) => ({ key: i, ...a })));
  const [nextKey, setNextKey] = useState(initial.anniversaries.length);
  const [daysSaving, setDaysSaving] = useState(false);
  const [daysMsg, setDaysMsg] = useState<Msg>(null);

  const saveReceiving = async () => {
    if (recvSaving) return;
    setRecvMsg(null);
    if (resting && resumeOn === "") {
      setRecvMsg({
        ok: false,
        text: "쉬는 동안에는 다시 받는 날을 꼭 선택해 주세요.",
        field: "resumeOn",
      });
      resumeRef.current?.focus();
      return;
    }
    setRecvSaving(true);
    const r = await sendCreatorReceiving({
      resting,
      resumeOn: resting ? resumeOn : null,
      monthlyLimit: limit,
    });
    setRecvSaving(false);
    if (r.kind === "login") {
      router.push("/login?next=/creator/settings");
      return;
    }
    if (r.kind === "failed") {
      setRecvMsg({ ok: false, text: r.message });
      return;
    }
    if (!resting) setResumeOn("");
    setRecvMsg({ ok: true, text: "선물 받기 설정이 저장되었습니다." });
    router.refresh();
  };

  const saveDays = async () => {
    if (daysSaving) return;
    setDaysMsg(null);
    setDaysSaving(true);
    const r = await sendCreatorDays({
      birthday: bMonth !== null && bDay !== null ? { month: bMonth, day: bDay } : null,
      anniversaries: anniversaries.map(({ name, month, day }) => ({
        name: name.trim(),
        month,
        day,
      })),
    });
    setDaysSaving(false);
    if (r.kind === "login") {
      router.push("/login?next=/creator/settings");
      return;
    }
    if (r.kind === "failed") {
      setDaysMsg({ ok: false, text: r.message });
      return;
    }
    setDaysMsg({ ok: true, text: "생일과 기념일이 저장되었습니다." });
    router.refresh();
  };

  const updateAnniversary = (key: number, patch: Partial<AnniversaryDraft>) => setAnniversaries((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  return (
    <>
      <section id="recv" className={`card ${s.set}`} aria-labelledby="recv-h">
        <div className={s["set-head"]}>
          <h3 className="t-card" id="recv-h">
            선물 받기
          </h3>
        </div>
        <div className="grid cols-2" role="radiogroup" aria-label="받는 상태">
          <label className="opt">
            <input type="radio" name="recv-state" checked={!resting} onChange={() => setResting(false)} />
            <span>받는 중</span>
          </label>
          <label className="opt">
            <input type="radio" name="recv-state" checked={resting} onChange={() => setResting(true)} />
            <span>쉬는 중</span>
          </label>
        </div>
        {resting ? (
          <div>
            <label className="label" htmlFor="recv-resume">
              다시 받는 날
            </label>
            <input
              ref={resumeRef}
              id="recv-resume"
              className="field"
              type="date"
              min={range.min}
              max={range.max}
              value={resumeOn}
              onChange={(e) => {
                setResumeOn(e.currentTarget.value);
                if (resumeInvalid) setRecvMsg(null);
              }}
              aria-invalid={resumeInvalid || undefined}
              aria-describedby={resumeInvalid ? "recv-resume-hint recv-msg-err" : "recv-resume-hint"}
            />
            <p className="t-meta hint" id="recv-resume-hint">
              선택 가능: 내일~1년 이내 · 선택한 날짜 0시에 선물 받기 재개
              <br />
              쉬는 동안에도 기존 선물의 승인·거절은 가능합니다.
            </p>
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="recv-limit">
            팬 1명당 월 선물 한도
          </label>
          <select
            id="recv-limit"
            className="field"
            value={limit ?? ""}
            onChange={(e) => setLimit(e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
            aria-describedby="recv-limit-hint"
          >
            <option value="">정하지 않음</option>
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                {n}개
              </option>
            ))}
          </select>
          <p className="t-meta hint" id="recv-limit-hint">
            한도에 도달한 팬은 다음 달 1일부터 다시 보낼 수 있습니다. 설정한 한도는 크리에이터 페이지에 표시되지 않습니다.
          </p>
        </div>
        <div>
          <button className="btn" type="button" aria-disabled={recvSaving} onClick={() => void saveReceiving()}>
            {recvSaving ? "저장 중…" : "선물 받기 설정 저장"}
          </button>
          <SaveMessage id="recv-msg" msg={recvMsg} />
        </div>
      </section>

      <section id="days" className={`card ${s.set}`} aria-labelledby="days-h">
        <div className={s["set-head"]}>
          <h3 className="t-card" id="days-h">
            생일과 기념일
          </h3>
        </div>
        <p>크리에이터 페이지에 30일 전부터 D-day 표시 · 월·일만 입력</p>
        <div>
          <span className="label" id="bday-label">
            생일
          </span>
          <MonthDaySelect
            idBase="bday"
            label="생일"
            month={bMonth}
            day={bDay}
            allowEmpty
            onChange={(m, d) => {
              setBMonth(m);
              setBDay(d);
            }}
          />
        </div>
        <div>
          <span className="label">기념일 ({ANNIVERSARY_MAX}개까지)</span>
          {anniversaries.length === 0 ? <p className="t-meta">등록된 기념일이 없습니다.</p> : null}
          <ul className={s["ann-list"]}>
            {anniversaries.map((a, i) => (
              <li key={a.key} className={s["ann-row"]}>
                <label className="sr-only" htmlFor={`ann-${a.key}-name`}>
                  기념일 {i + 1} 이름
                </label>
                <input
                  id={`ann-${a.key}-name`}
                  className="field"
                  placeholder="예: 활동 시작일"
                  value={a.name}
                  onChange={(e) =>
                    updateAnniversary(a.key, {
                      name: clipChars(e.currentTarget.value, ANNIVERSARY_NAME_MAX),
                    })
                  }
                />
                <MonthDaySelect
                  idBase={`ann-${a.key}`}
                  label={`기념일 ${i + 1}`}
                  month={a.month}
                  day={a.day}
                  allowEmpty={false}
                  onChange={(m, d) => updateAnniversary(a.key, { month: m ?? 1, day: d ?? 1 })}
                />
                <button
                  className="btn btn--line btn--sm"
                  type="button"
                  aria-label={`기념일 ${i + 1} 삭제`}
                  onClick={() => setAnniversaries((list) => list.filter((x) => x.key !== a.key))}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
          {anniversaries.length < ANNIVERSARY_MAX ? (
            <button
              className="btn btn--line btn--sm"
              type="button"
              onClick={() => {
                setAnniversaries((list) => [
                  ...list,
                  {
                    key: nextKey,
                    name: "",
                    month: today.month,
                    day: today.day,
                  },
                ]);
                setNextKey((k) => k + 1);
              }}
            >
              기념일 추가
            </button>
          ) : null}
          <p className="t-meta hint">
            기념일 이름: 최대 {ANNIVERSARY_NAME_MAX}자
            <br />
            기념일 7일 전부터 팬이 ‘기념일 선물’ 표시를 선택할 수 있습니다.
          </p>
        </div>
        <div>
          <button className="btn" type="button" aria-disabled={daysSaving} onClick={() => void saveDays()}>
            {daysSaving ? "저장 중…" : "생일·기념일 저장"}
          </button>
          <SaveMessage id="days-msg" msg={daysMsg} />
        </div>
      </section>
    </>
  );
}
