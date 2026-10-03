"use client";

import { useState } from "react";
import { postLogout } from "../api/logout-client";

// 헤더의 로그아웃. 링크로 첫 화면에 가기만 하면 세션이 그대로 남는다(2026-10-03 발견) —
// 서버 로그아웃(INV-L7)을 부른 뒤 페이지를 새로 읽어 헤더까지 손님 상태로 바꾼다.
export function LogoutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      type="button"
      aria-disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        await postLogout();
        window.location.assign("/");
      }}
    >
      로그아웃
    </button>
  );
}
