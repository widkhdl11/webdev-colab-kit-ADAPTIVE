"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ANNIVERSARY_MAX, ANNIVERSARY_NAME_MAX, daysInMonth, type CalendarDate, type MyCreatorReceiving } from "@/entities/creator/model/receiving";
import { sendCreatorDays } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars } from "@/features/creator-settings-save/model/creator-settings-input";
import panel from "@/shared/ui/settings-panel.module.css";
import s from "./creator-settings.module.css";
import { SaveMessage, type SaveMsg } from "./receiving-section";

// 크리에이터 — 생일과 기념일 (creator-receiving INV-B1·B7·B8). 2026-11-14 계정 설정 「받기 설정」에서 프로필 수정 「프로필」 탭으로 옮겼다
// (사용자 「받기 설정에 기념일과 생일이 있어야하는게 아니라, 프로필이나 채널 설정에 있어야하는거아닐까?」). 저장 주소·검사는 그대로다.
// 판 모양은 프로필 탭의 다른 판(settings-panel)과 같다. 저장은 로그인 세션으로만 — 크리에이터 ID 를 보내지 않는다.

type AnniversaryDraft = {
  key: number;
  name: string;
  month: number;
  day: number;
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const daysOf = (month: number) => Array.from({ length: daysInMonth(month) }, (_, i) => i + 1);

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

export function DaysSection({ initial, today }: { initial: Pick<MyCreatorReceiving, "birthday" | "anniversaries">; today: CalendarDate }) {
  const router = useRouter();
  const [bMonth, setBMonth] = useState<number | null>(initial.birthday?.month ?? null);
  const [bDay, setBDay] = useState<number | null>(initial.birthday?.day ?? null);
  const [anniversaries, setAnniversaries] = useState<AnniversaryDraft[]>(initial.anniversaries.map((a, i) => ({ key: i, ...a })));
  const [nextKey, setNextKey] = useState(initial.anniversaries.length);
  const [daysSaving, setDaysSaving] = useState(false);
  const [daysMsg, setDaysMsg] = useState<SaveMsg>(null);

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
      router.push("/login?next=/creator/profile");
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
    <section id="days" className={panel.panel} aria-labelledby="days-h">
      <h2 className={panel.title} id="days-h">
        생일과 기념일
      </h2>
      <div className={`${panel.body} ${s.set}`}>
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
        {/* 저장은 판 아래 오른쪽 — 같은 탭 「소개」 판의 저장 줄과 같은 자리(design-prompt 2-21) */}
        <div className={s["save-end"]}>
          <button className="btn" type="button" aria-disabled={daysSaving} onClick={() => void saveDays()}>
            {daysSaving ? "저장 중…" : "생일·기념일 저장"}
          </button>
          <SaveMessage id="days-msg" msg={daysMsg} />
        </div>
      </div>
    </section>
  );
}
