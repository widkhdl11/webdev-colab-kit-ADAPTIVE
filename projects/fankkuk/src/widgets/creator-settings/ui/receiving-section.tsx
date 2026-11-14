"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { resumeRange, type CalendarDate, type MyCreatorReceiving } from "@/entities/creator/model/receiving";
import { sendCreatorReceiving } from "@/features/creator-settings-save/api/send-creator-settings";
import panel from "@/shared/ui/settings-panel.module.css";
import s from "./creator-settings.module.css";

// 크리에이터 — 선물 받기(받는 상태, creator-receiving INV-B1·B3). 생일·기념일은 2026-11-14 프로필 탭으로 옮겼다(days-section).
// 저장은 로그인 세션으로만 — 크리에이터 ID 를 보내지 않는다. 범위 검사는 서버·DB 가 한국 시간 오늘로 다시 한다.

/** field 가 있으면 그 칸의 오류다(칸에 aria-invalid·aria-describedby 를 건다). */
type Msg = { ok: boolean; text: string; field?: "resumeOn" } | null;
/** 저장 결과 줄 — 받기 어려운 품목 칸(hard-items-section)도 같은 줄을 쓴다. */
export type SaveMsg = Msg;

/** 저장됨은 상태 줄(role=status, 늘 있음)로 조용히, 오류는 오류 줄(role=alert, id = `${id}-err`)로 바로 읽힌다. */
export function SaveMessage({ id, msg }: { id: string; msg: Msg }) {
  return (
    <>
      <p className={`okmsg ${s.msg}`} role="status" id={id}>
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

export function ReceivingSection({ initial, today }: { initial: MyCreatorReceiving; today: CalendarDate }) {
  const router = useRouter();
  const range = resumeRange(today);

  const [resting, setResting] = useState(initial.resumeOn !== null);
  const [resumeOn, setResumeOn] = useState(initial.resumeOn ?? "");
  const [recvSaving, setRecvSaving] = useState(false);
  const [recvMsg, setRecvMsg] = useState<Msg>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const resumeInvalid = recvMsg?.field === "resumeOn";
  // 바뀐 값이 있는가 — 「저장」 모양만 가른다(누르면 지금처럼 보낸다, days-section 과 같음). 저장하면 그 값이 새 기준
  const snapshot = JSON.stringify([resting, resumeOn]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;

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
    setSavedSnapshot(JSON.stringify([resting, resting ? resumeOn : ""]));
    setRecvMsg({ ok: true, text: "선물 받기 설정이 저장되었습니다." });
    router.refresh();
  };

  return (
    // 시안 settings-account-20261113 #recv: 카드 안 카드 없이 구역 제목 + 가는 줄로 나눈다. 저장은 이 구역만(받기 어려운 선물과 따로 — 2026-11-14 사용자 「구역마다 저장」)
    <section id="recv" className={s.sec} aria-labelledby="recv-h">
      <h3 className={s.secT} id="recv-h">
        선물 받기
      </h3>
      <div className={s.opts} role="radiogroup" aria-label="받는 상태">
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
            className={`field ${s.w200}`}
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
        <div className={s.bar}>
          <button className={`btn ${dirty || recvSaving ? "" : panel.idle}`} type="button" aria-disabled={recvSaving} onClick={() => void saveReceiving()}>
            {recvSaving ? "저장 중…" : "선물 받기 설정 저장"}
          </button>
        </div>
        <SaveMessage id="recv-msg" msg={recvMsg} />
      </div>
    </section>
  );
}
