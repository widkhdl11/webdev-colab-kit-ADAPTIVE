"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BoxCard, CancelledArrivalCard, HoldCard } from "@/entities/revgift-box/api/box-reads";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";
import { sendChooseCancelledArrival, sendResolveHold, type BoxOutcome } from "../api/box-requests";
import s from "./box-manage.module.css";

// 선물함 처리할 일 카드 (revgift-box INV-GB12 · GB23 · UX 명세 「정한 것 ⑧」).
// 확인 필요: 선물함 이름 · 작성한 닉네임 · 팬 선택하기 · 확인. 「빼기」는 없다. 고를 수 있는 팬은 그 선물함의 담길 팬뿐이다(서버가 다시 판정).
// 취소한 선물함 상자: 「선물함 다시 열기」·「돌려받기」. 기한까지 고르지 않으면 돌려받기와 같다.
// 선물 사진은 아직 없다 — 사무실 사진 저장이 생기면 더한다(BACKLOG).

function useSend(onDone: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (send: () => Promise<BoxOutcome<null>>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const o = await send();
    setBusy(false);
    if (o.kind === "ok") {
      onDone();
      return router.refresh();
    }
    if (o.kind === "login") return router.push(`/login?next=${encodeURIComponent("/creator/actions")}`);
    setError(o.kind === "refused" ? o.message : "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  };
  return { busy, error, run };
}

function HoldCardView({ card }: { card: HoldCard }) {
  const [pick, setPick] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSend(() => setDone(true));
  if (done) return null;
  const selectId = `hold-${card.id}`;
  return (
    <li className={s.card}>
      <p className={s.cardTitle}>확인 필요</p>
      <p className={s.cardMeta}>
        {card.boxName} · 작성한 닉네임 「{card.writtenNickname}」 · {formatMonthDayKo(card.dueAt)}까지
      </p>
      <div className={s.cardPick}>
        <label className="sr-only" htmlFor={selectId}>
          팬 선택하기
        </label>
        <select id={selectId} className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">팬 선택하기</option>
          {card.candidates.map((c) => (
            <option key={c.applicationId} value={c.applicationId}>
              {c.nickname}
            </option>
          ))}
        </select>
        <button type="button" className="btn" disabled={!pick || busy} onClick={() => run(() => sendResolveHold(card.id, pick))}>
          {busy ? "처리 중…" : "확인"}
        </button>
      </div>
      <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
    </li>
  );
}

function CancelledArrivalView({ card }: { card: CancelledArrivalCard }) {
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSend(() => setDone(true));
  if (done) return null;
  return (
    <li className={s.card}>
      <p className={s.cardTitle}>취소한 선물함의 상자가 도착했어요</p>
      <p className={s.cardMeta}>
        {card.boxName} · {formatMonthDayKo(card.dueAt)}까지 고르지 않으면 돌려보냅니다.
      </p>
      <div className={s.cardPick}>
        <button type="button" className="btn btn--line" disabled={busy} onClick={() => run(() => sendChooseCancelledArrival(card.id, "reopen"))}>
          선물함 다시 열기
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => run(() => sendChooseCancelledArrival(card.id, "return"))}>
          돌려받기
        </button>
      </div>
      <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
    </li>
  );
}

export function BoxCards({ cards }: { cards: readonly BoxCard[] }) {
  if (cards.length === 0) return null;
  return (
    <ul className={s.rows}>
      {cards.map((c) => (c.kind === "hold" ? <HoldCardView key={c.id} card={c} /> : <CancelledArrivalView key={c.id} card={c} />))}
    </ul>
  );
}
