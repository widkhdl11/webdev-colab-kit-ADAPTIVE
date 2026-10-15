"use client";

import { useEffect, useRef, useState } from "react";
import { checkNameAvailability } from "../api/signup-client";
import { createAvailabilityWatcher, type AvailabilityState } from "./name-availability";

// 가입 화면 칸 하나의 미리 확인 상태(signup INV-U14). value 가 null 이면 묻지 않는다(빈칸·형식 틀림).
// 판정은 name-availability 의 감시기가 한다 — 여기서는 화면 수명에 붙이기만 한다.
export function useNameAvailability(kind: "loginId" | "nickname", value: string | null): AvailabilityState | null {
  const [state, setState] = useState<AvailabilityState | null>(null);
  const watcher = useRef<ReturnType<typeof createAvailabilityWatcher> | null>(null);

  useEffect(() => {
    const w = createAvailabilityWatcher({ check: (v, signal) => checkNameAvailability(kind, v, signal), onChange: setState });
    watcher.current = w;
    return () => {
      w.dispose();
      watcher.current = null;
    };
  }, [kind]);

  useEffect(() => {
    watcher.current?.update(value);
  }, [value]);

  return state;
}
