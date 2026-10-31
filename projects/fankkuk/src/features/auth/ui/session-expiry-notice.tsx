"use client";

import { useEffect, useRef, useState } from "react";
import { SESSION_END_REASON } from "@/entities/session/model/session-end-notice";
import { SESSION_WARNING_MS } from "@/entities/session/model/session-lifetime";
import type { SessionClock } from "../model/session-clock";

// 운영자 화면의 「곧 로그아웃됩니다」 (session-login INV-L19). 끝나는 시각은 서버가 준 값으로만 센다(브라우저 시계와의 차이를 처음에 잰다).
// 끝나기 5분 전이 되면 서버에 지금 끝나는 시각을 다시 묻는다(다른 탭·요청이 마지막 사용 시각을 고쳤을 수 있다 — 이 질문은 사용으로 치지 않는다).
// 끝나는 시각이 바뀌면(다른 탭에서 씀) 보이던 안내를 숨기고 새 시각으로 다시 센다.
// [연장] 은 미사용 끝이 먼저일 때만 — 절대 기간은 늘지 않는다. 서버가 끝났다고 답하면 로그인 화면으로 간다(돌아갈 곳 = 지금 화면, reason=session).
// 다시 읽기만 하면 안 된다 — 그 확인 요청에서 서버가 이미 세션을 끝내 쿠키를 지웠으므로, 다시 읽은 운영자 화면은 손님에게 보이는 404 다(2026-10-31 실측).
// 서버에 못 물은 것(네트워크·500·JSON 아님)은 끝남이 아니다 — 다음 회차에 다시 묻는다.

type Asked = { kind: "clock"; clock: SessionClock } | { kind: "ended" } | { kind: "failed" };

async function ask(path: string, init?: RequestInit): Promise<Asked> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init });
  } catch {
    return { kind: "failed" };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: "failed" };
  }
  if (typeof body !== "object" || body === null) return { kind: "failed" };
  // 끝났다는 답은 그 꼴일 때만 — 로그인 안 함(401)도 같은 꼴로 온다
  if ((body as { ended?: unknown }).ended === true) return { kind: "ended" };
  const c = body as Partial<SessionClock>;
  if (res.ok && typeof c.endsAt === "number" && typeof c.now === "number" && typeof c.extendable === "boolean") {
    return { kind: "clock", clock: { endsAt: c.endsAt, now: c.now, extendable: c.extendable } };
  }
  return { kind: "failed" };
}

/** session-login INV-L17: 끝났을 때 가는 곳 — 누구에게나 같은 표시(reason=session) 하나 */
function toLogin(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}&reason=${SESSION_END_REASON}`);
}

/** 다시 볼 간격 — 너무 자주 묻지 않게 30초마다 브라우저 안에서만 센다. 못 물었을 때도 이 간격 뒤 다시 묻는다 */
const TICK_MS = 30_000;

/** 위 줄의 알약 모양 — 색·반경은 사이트 토큰(CSS 파일 없이 둔다: 이 한 줄뿐이다) */
const NOTICE_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  minHeight: 36,
  padding: "0 6px 0 14px",
  borderRadius: "var(--r-pill)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontWeight: 700,
  fontSize: 14,
} as const;

export function SessionExpiryNotice({ initial, onEnded = toLogin }: { initial: SessionClock | null; onEnded?: () => void }) {
  const [clock, setClock] = useState<SessionClock | null>(initial);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const skew = useRef(initial ? initial.now - Date.now() : 0);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  /** 서버가 준 새 시각으로 — 끝나는 시각이 바뀌었으면 보이던 안내를 숨긴다(코드 리뷰 1) */
  const adopt = (fresh: SessionClock, current: SessionClock | null) => {
    skew.current = fresh.now - Date.now();
    if (!current || fresh.endsAt !== current.endsAt || fresh.extendable !== current.extendable) {
      setShown(false);
      setClock(fresh);
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!clock) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = (ms: number) => {
      if (!stopped) timer = setTimeout(tick, Math.max(1000, ms));
    };
    const serverNow = () => Date.now() + skew.current;
    async function tick() {
      if (stopped) return;
      const left = clock!.endsAt - serverNow();
      if ((left <= SESSION_WARNING_MS && !shown) || left <= 0) {
        const got = await ask("/api/auth/session/status");
        if (stopped) return;
        if (got.kind === "ended") return endedRef.current();
        if (got.kind === "failed") return later(TICK_MS);
        // 같은 시각이면 안내를 보이고 끝날 때까지 다시 센다. 바뀌었으면 새 시각으로 다시 시작한다(clock 이 바뀌어 effect 가 다시 돈다)
        if (adopt(got.clock, clock)) {
          if (!shown) setShown(true);
          else later(Math.min(TICK_MS, Math.max(left, 1000)));
        }
        return;
      }
      const untilWarn = left - SESSION_WARNING_MS;
      later(Math.min(TICK_MS, untilWarn > 0 ? untilWarn : left));
    }
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [clock, shown]);

  if (!clock || !shown) return null;
  return (
    <div style={NOTICE_STYLE} role="alert" data-session-notice>
      <span>곧 로그아웃됩니다</span>
      {clock.extendable && (
        <button
          className="btn btn--sm"
          type="button"
          aria-disabled={busy}
          aria-busy={busy || undefined}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            const got = await ask("/api/auth/session/extend", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
            setBusy(false);
            if (got.kind === "ended") return endedRef.current();
            // 못 물었으면 안내를 그대로 둔다 — 다시 누를 수 있다
            if (got.kind === "clock") adopt(got.clock, clock);
          }}
        >
          연장
        </button>
      )}
    </div>
  );
}
