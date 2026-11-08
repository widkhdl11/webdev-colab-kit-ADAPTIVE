"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendCartonCount } from "../api/box-requests";
import s from "./box-manage.module.css";

// 3페이지 보낸 상자 수 (revgift-box INV-GB11 · UX 명세 「정한 것 ⓓ」). 첫 상자가 도착하기 전까지만 고친다(정할 것 Q8) — 그 뒤에는 숫자만 보인다.
// 적은 수만큼 상자가 들어오고 모든 선물이 실측되면 명세서가 만들어진다. 판정은 서버가 한다.

export function BoxCartonCount({ boxId, count, editable }: { boxId: string; count: number; editable: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(count));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!editable) {
    return (
      <p>
        보낸 상자 수 <strong>{count}개</strong>
      </p>
    );
  }

  const save = async () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return setMsg({ ok: false, text: "보낸 상자 수를 1 이상의 숫자로 입력해 주세요." });
    setBusy(true);
    setMsg(null);
    const o = await sendCartonCount(boxId, n);
    setBusy(false);
    if (o.kind === "ok") {
      setMsg({ ok: true, text: "저장했어요." });
      return router.refresh();
    }
    if (o.kind === "login") return router.push(`/login?next=${encodeURIComponent(`/creator/revgift-boxes/${boxId}`)}`);
    setMsg({ ok: false, text: o.kind === "refused" ? o.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  };

  return (
    <div className={s.cartons}>
      <div className="field">
        <label htmlFor="carton-count">보낸 상자 수</label>
        <input id="carton-count" className="input" type="number" inputMode="numeric" min={1} step={1} value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <button type="button" className="btn btn--line" disabled={busy || value === String(count)} onClick={save}>
        {busy ? "저장 중…" : "저장"}
      </button>
      <div role="status">{msg ? <p className={msg.ok ? undefined : "err"}>{msg.text}</p> : null}</div>
    </div>
  );
}
