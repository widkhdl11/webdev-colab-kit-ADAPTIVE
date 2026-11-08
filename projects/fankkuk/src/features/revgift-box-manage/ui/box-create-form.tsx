"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BOX_CAPACITY_MAX, BOX_NAME_MAX } from "@/entities/revgift-box/model/box-rules";
import { sendCreateBox } from "../api/box-requests";
import s from "./box-manage.module.css";

// 선물함 만들기 (revgift-box INV-GB3 · UX 명세 creator-revgifts-new 상태 `open` 의 들어오는 조건). 받는 값은 셋 — 이름 · 받을 인원(1~100) · 공개/비공개.
// 공개면 크리에이터 상세 페이지에 입구가 보이고, 비공개면 초대 링크로만 신청한다(정한 것 ②). 만들면 신청 관리 창으로 간다.

export function BoxCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const n = Number(capacity);
    if (!name.trim() || !Number.isInteger(n) || n < 1 || n > BOX_CAPACITY_MAX) {
      setError(`선물함 이름과 받을 인원(1~${BOX_CAPACITY_MAX}명)을 입력해 주세요.`);
      return;
    }
    if (isPublic === null) {
      setError("공개 여부를 선택해 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    const o = await sendCreateBox({ name: name.trim(), capacity: n, isPublic });
    if (o.kind === "ok") {
      router.push(`/creator/revgift-boxes/${o.data}`);
      return;
    }
    setBusy(false);
    if (o.kind === "login") {
      router.push(`/login?next=${encodeURIComponent("/creator/revgift-boxes/new")}`);
      return;
    }
    setError(o.kind === "refused" ? o.message : "선물함을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  };

  return (
    <form className={s.form} onSubmit={(e) => void submit(e)} noValidate>
      <div className="field">
        <label htmlFor="box-name">선물함 이름</label>
        <input id="box-name" className="input" type="text" value={name} maxLength={BOX_NAME_MAX} required onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="box-capacity">받을 인원</label>
        <input
          id="box-capacity"
          className="input"
          type="number"
          inputMode="numeric"
          min={1}
          max={BOX_CAPACITY_MAX}
          step={1}
          value={capacity}
          required
          aria-describedby="box-capacity-hint"
          onChange={(e) => setCapacity(e.target.value)}
        />
        <p className="hint" id="box-capacity-hint">{`1~${BOX_CAPACITY_MAX}명`}</p>
      </div>
      <fieldset className={s.fs}>
        <legend className="label">공개 여부</legend>
        <div className={s.pubOpts}>
          <label className="opt">
            <input type="radio" name="box-public" checked={isPublic === true} onChange={() => setIsPublic(true)} />
            공개
          </label>
          <label className="opt">
            <input type="radio" name="box-public" checked={isPublic === false} onChange={() => setIsPublic(false)} />
            비공개
          </label>
        </div>
        <p className="hint">공개: 내 크리에이터 페이지에서 신청 · 비공개: 초대 링크로만 신청</p>
      </fieldset>
      <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
      <div>
        <button className="btn" type="submit" aria-busy={busy || undefined} aria-disabled={busy || undefined}>
          {busy ? "만드는 중…" : "선물함 만들기"}
        </button>
      </div>
    </form>
  );
}
