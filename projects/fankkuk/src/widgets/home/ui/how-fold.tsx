"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./home.module.css";

// 팬 홈 맨 아래 「선물은 이렇게 도착해요」 4단계 — 시안 docs/design/mockups/site/v21-addendum3/fan-home.html (details.fold · ol.steps4).
// 처음 방문에는 펼쳐 두고 「알겠어요, 다시 보지 않기」를 누르면 그 뒤로는 접힌 한 줄(design-rules 12절). 접힌 줄을 누르면 언제든 펼친다.
// 본 적 있는지는 이 브라우저에만 적는다(localStorage). 읽기·쓰기가 막힌 브라우저에서는 이번 화면에서만 접고, 다음 방문에는 다시 펼친다.

const KEY = "home-how-dismissed";
const EVENT = "home-how-dismissed";

const STEPS = [
  { title: "선물을 보내요", text: "크리에이터와 선물을 고르고 결제해요." },
  { title: "승인을 받아요", text: PROMISE.approval },
  { title: "검수해요", text: PROMISE.inspection },
  { title: "대신 보내요", text: `팬꾹이 대신 보내요. ${PROMISE.addressFan}` },
] as const;

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function HowFold() {
  // 서버 그림은 처음 방문(펼침) — 다시 온 사람은 붙은 뒤 바로 접힌다
  const stored = useSyncExternalStore(subscribe, readDismissed, () => false);
  // 저장이 막혀도 누른 화면에서는 접힌다
  const [dismissedNow, setDismissedNow] = useState(false);
  const dismissed = stored || dismissedNow;
  const summaryRef = useRef<HTMLElement>(null);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // 저장이 막힌 브라우저 — 다음 방문에는 다시 펼쳐진다
    }
    setDismissedNow(true);
    window.dispatchEvent(new Event(EVENT));
    // 누른 버튼이 사라지므로 접힌 줄로 초점을 옮긴다
    summaryRef.current?.focus();
  };

  return (
    <details className={s.fold} open={!dismissed}>
      <summary ref={summaryRef}>
        <svg className={s.foldIco} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
          <path d="M15 18H9" />
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
          <circle cx="17" cy="18" r="2" />
          <circle cx="7" cy="18" r="2" />
        </svg>
        <span>
          선물은 <span className="accent">이렇게</span> 도착해요
        </span>
        <span className={s.foldMeta}>4단계</span>
        <svg className={s.foldChev} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={s.foldBody}>
        <ol className={s.steps4}>
          {STEPS.map((st, i) => (
            <li key={st.title}>
              <span className={s.stepN} aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <b>{st.title}</b>
                <p>{st.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {dismissed ? null : (
          <button className={`btn btn--line btn--sm ${s.dismiss}`} type="button" onClick={dismiss}>
            알겠어요, 다시 보지 않기
          </button>
        )}
      </div>
    </details>
  );
}
