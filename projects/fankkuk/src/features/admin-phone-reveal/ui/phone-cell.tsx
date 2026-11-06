"use client";

import { useState } from "react";
import { postJson } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";

// 크리에이터 목록의 휴대폰 칸(admin-console INV-K14). 직원·대표 모두 가린 번호(010-****-1234)를 보고,
// 대표에게만 「보기」가 있다 — 누르면 사유 입력 없이 그 자리에서 원래 번호로 바뀐다. 볼 때마다 서버가 접속 기록을 남긴다.
// 원래 번호는 이 칸의 상태에만 있고 다시 읽으면(새로고침) 가린 번호로 돌아간다.

type Props = { loginId: string; name: string; masked: string | null; canReveal: boolean };

export function PhoneCell({ loginId, name, masked, canReveal }: Props) {
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!masked) return <span>—</span>;

  const reveal = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await postJson("/api/admin/creators/phone", { loginId }, "번호를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    setBusy(false);
    if (r.kind === "ok" && typeof r.body.phone === "string") setPhone(r.body.phone);
    else setError(r.kind === "failed" ? r.message : "번호를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  };

  return (
    <span className={a.nowrap}>
      <span className={a.mono}>{phone ?? masked}</span>
      {canReveal && !phone ? (
        <>
          {" "}
          <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={reveal} aria-disabled={busy} aria-label={`${name} 휴대폰 번호 보기`}>
            {busy ? "여는 중" : "보기"}
          </button>
        </>
      ) : null}
      {error ? (
        <span role="alert" className="err">
          {error}
        </span>
      ) : null}
    </span>
  );
}
