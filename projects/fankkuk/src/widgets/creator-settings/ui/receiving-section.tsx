"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ANNIVERSARY_MAX,
  ANNIVERSARY_NAME_MAX,
  daysInMonth,
  MONTHLY_LIMIT_MAX,
  resumeRange,
  type CalendarDate,
  type MyCreatorReceiving,
} from "@/entities/creator/model/receiving";
import { sendCreatorDays, sendCreatorReceiving } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars } from "@/features/creator-settings-save/model/creator-settings-input";
import s from "./creator-settings.module.css";

// 크리에이터 — 선물 받기(받는 상태·팬당 한 달 한도)와 생일·기념일 (creator-receiving INV-B1·B3·B5·B7).
// 저장은 로그인 세션으로만 — 크리에이터 ID 를 보내지 않는다. 범위 검사는 서버·DB 가 한국 시간 오늘로 다시 한다.
// 한도 숫자는 이 본인 화면에만 보인다(INV-B6).

type Msg = { ok: boolean; text: string } | null;
type AnniversaryDraft = { key: number; name: string; month: number; day: number };

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const LIMITS = Array.from({ length: MONTHLY_LIMIT_MAX }, (_, i) => i + 1);
const daysOf = (month: number) => Array.from({ length: daysInMonth(month) }, (_, i) => i + 1);

function SaveMessage({ id, msg }: { id: string; msg: Msg }) {
  return (
    <p className={msg && !msg.ok ? s.error : `sub ${s["save-msg"]}`} role="status" id={id}>
      {msg && !msg.ok ? (
        <span className={s["error-mark"]} aria-hidden="true">
          !
        </span>
      ) : null}
      {msg?.text}
    </p>
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
        className="input"
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
      <select
        id={`${idBase}-d`}
        className="input"
        value={day ?? ""}
        disabled={month === null}
        onChange={(e) => onChange(month, Number(e.currentTarget.value))}
      >
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
      setRecvMsg({ ok: false, text: "쉬는 동안에는 다시 받는 날을 꼭 골라 주세요." });
      return;
    }
    setRecvSaving(true);
    const r = await sendCreatorReceiving({ resting, resumeOn: resting ? resumeOn : null, monthlyLimit: limit });
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
    setRecvMsg({ ok: true, text: "선물 받기 설정을 저장했어요." });
    router.refresh();
  };

  const saveDays = async () => {
    if (daysSaving) return;
    setDaysMsg(null);
    setDaysSaving(true);
    const r = await sendCreatorDays({
      birthday: bMonth !== null && bDay !== null ? { month: bMonth, day: bDay } : null,
      anniversaries: anniversaries.map(({ name, month, day }) => ({ name: name.trim(), month, day })),
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
    setDaysMsg({ ok: true, text: "생일과 기념일을 저장했어요." });
    router.refresh();
  };

  const updateAnniversary = (key: number, patch: Partial<AnniversaryDraft>) =>
    setAnniversaries((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  return (
    <>
      <section aria-labelledby="recv-h">
        <div className={s["s-head"]}>
          <h3 id="recv-h">선물 받기</h3>
        </div>
        <div className={s.radios} role="radiogroup" aria-label="받는 상태">
          <label>
            <input type="radio" name="recv-state" checked={!resting} onChange={() => setResting(false)} /> 받는 중
          </label>
          <label>
            <input type="radio" name="recv-state" checked={resting} onChange={() => setResting(true)} /> 쉬는 중
          </label>
        </div>
        {resting ? (
          <div className={`field ${s["recv-field"]}`}>
            <label htmlFor="recv-resume">다시 받는 날</label>
            <input
              id="recv-resume"
              className="input"
              type="date"
              min={range.min}
              max={range.max}
              value={resumeOn}
              onChange={(e) => setResumeOn(e.currentTarget.value)}
              aria-describedby="recv-resume-hint"
            />
            <p className="hint" id="recv-resume-hint">
              내일부터 1년 안으로 골라요. 이날 0시부터 다시 받아요. 쉬는 동안에도 이미 받은 선물의 승인·거절은 그대로 할 수 있어요.
            </p>
          </div>
        ) : null}
        <div className={`field ${s["recv-field"]}`}>
          <label htmlFor="recv-limit">팬 한 명이 한 달에 보낼 수 있는 선물</label>
          <select
            id="recv-limit"
            className="input"
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
          <p className="hint" id="recv-limit-hint">
            정해 두면 이번 달에 그만큼 보낸 팬은 다음 달 1일부터 다시 보낼 수 있어요. 이 숫자는 크리에이터 페이지에 보이지 않아요.
          </p>
        </div>
        <button className={`btn ${s.save}`} type="button" aria-disabled={recvSaving} onClick={() => void saveReceiving()}>
          {recvSaving ? "저장하는 중…" : "선물 받기 저장"}
        </button>
        <SaveMessage id="recv-msg" msg={recvMsg} />
      </section>

      <section aria-labelledby="days-h">
        <div className={s["s-head"]}>
          <h3 id="days-h">생일과 기념일</h3>
        </div>
        <p className="sub">적어 두면 크리에이터 페이지에 30일 전부터 D-day 가 보여요. 연도는 받지 않아요.</p>
        <div className={`field ${s["recv-field"]}`}>
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
        <div className={`field ${s["recv-field"]}`}>
          <span className="label">기념일 ({ANNIVERSARY_MAX}개까지)</span>
          {anniversaries.length === 0 ? <p className="sub">아직 적은 기념일이 없어요.</p> : null}
          <ul className={s["ann-list"]}>
            {anniversaries.map((a, i) => (
              <li key={a.key} className={s["ann-row"]}>
                <label className="sr-only" htmlFor={`ann-${a.key}-name`}>
                  기념일 {i + 1} 이름
                </label>
                <input
                  id={`ann-${a.key}-name`}
                  className="input"
                  placeholder="예: 데뷔일"
                  value={a.name}
                  onChange={(e) => updateAnniversary(a.key, { name: clipChars(e.currentTarget.value, ANNIVERSARY_NAME_MAX) })}
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
                  className="btn btn--soft btn--sm"
                  type="button"
                  aria-label={`기념일 ${i + 1} 빼기`}
                  onClick={() => setAnniversaries((list) => list.filter((x) => x.key !== a.key))}
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
          {anniversaries.length < ANNIVERSARY_MAX ? (
            <button
              className="btn btn--line btn--sm"
              type="button"
              onClick={() => {
                setAnniversaries((list) => [...list, { key: nextKey, name: "", month: today.month, day: today.day }]);
                setNextKey((k) => k + 1);
              }}
            >
              기념일 더하기
            </button>
          ) : null}
          <p className="hint">이름은 {ANNIVERSARY_NAME_MAX}자까지예요. 기념일 7일 전부터는 팬이 「기념일 선물」 표시를 붙여 보낼 수 있어요.</p>
        </div>
        <button className={`btn ${s.save}`} type="button" aria-disabled={daysSaving} onClick={() => void saveDays()}>
          {daysSaving ? "저장하는 중…" : "생일·기념일 저장"}
        </button>
        <SaveMessage id="days-msg" msg={daysMsg} />
      </section>
    </>
  );
}
