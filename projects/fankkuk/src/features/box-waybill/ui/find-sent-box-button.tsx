"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FindSentBox, type SentBoxCandidate } from "./find-sent-box";

// 「내 상자 찾기」 버튼 + 창 (inbound-address-code INV-C4 ②-나 · action-center INV-J8·J10 — 2026-10-16 카드 d96).
// 보낸 역조공 화면의 아직 입고 전인 줄마다, 처리할 일의 아직 도착하지 않은 상자 줄에서 같은 창을 연다. 늦지 않아도 누를 수 있다.
// 창은 그 줄의 팬을 먼저 골라 두고(다른 후보로 바꿀 수 있다) 송장번호·택배사와 함께 한 번에 맞춰 본다. 보내는 중에는 창이 닫히지 않는다.

export function FindSentBoxButton({
  candidates,
  shareId,
  meta,
  label,
  className = "btn",
}: {
  candidates: readonly SentBoxCandidate[];
  /** 그 줄의 몫 — 창이 먼저 골라 둔다 */
  shareId: string;
  /** 창 제목 아래 한 줄(보낸 날) */
  meta: string;
  /** 낭독용 버튼 이름(어느 팬 줄인지) */
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(false);
  const router = useRouter();
  // 찾은 뒤에는 닫을 때 목록을 새로 읽는다 — 먼저 읽으면 이 버튼이 있던 줄이 사라지며 결과(「사무실에 도착했어요」)가 보이기 전에 창도 사라진다
  const close = () => {
    setOpen(false);
    if (found) router.refresh();
  };
  return (
    <>
      <button className={className} type="button" aria-haspopup="dialog" aria-label={label} onClick={() => setOpen(true)}>
        내 상자 찾기
      </button>
      {open ? (
        <BottomSheet open busy={busy} title="내 상자 찾기" meta={meta} onClose={close}>
          <FindSentBox candidates={candidates} initialShareId={shareId} onBusyChange={setBusy} onFound={() => setFound(true)} />
        </BottomSheet>
      ) : null}
    </>
  );
}
