"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { MyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import type { AddressLabel } from "@/entities/address/model/address-label";
import { addressOnFileText } from "@/entities/address/ui/address-on-file-text";
import type { FanBox } from "@/entities/revgift-box/api/box-reads";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import { sendApply, sendWithdraw } from "../api/apply-requests";
import s from "./box-apply.module.css";

// 팬 신청 폼 (revgift-box INV-GB4·GB6·GB9 · 화면 명세 docs/ux/pages/gift-boxes-boxId.md).
// 신청 = 받기 — 받을 주소는 설정에 등록한 주소를 쓴다. 등록돼 있으면 이름표·등록한 날만 보이고(주소는 본인에게도 보이지 않는다, INV-P16),
// 「이 주소로 신청」을 누르면 서버가 그 주소를 이 신청에 복사한다. 등록 전이거나 바꾸려면 같은 자리에서 주소를 입력한다(이 브라우저에서 봉인한 값만).
// 역조공 받기(receive-flow)와 같은 흐름이다. 팔로우·인원·마감 판정은 서버가 한다.
// 다른 신청자 수·닉네임·받을 인원은 보이지 않는다(정할 것 Q6). 제외됐는지도 보이지 않는다.

export type ApplyAddressStep = {
  status: MyFanAddressStatus | null;
  canEnter: boolean;
  renderForm: (p: { initialLabel: AddressLabel | null; autoFocusFirst: boolean; onSaved: (label: AddressLabel) => void; onCancel: () => void }) => ReactNode;
  missingKeyText: string;
};

export function BoxApplyPanel({ box, token, address, followSlot }: { box: FanBox; token: string | null; address: ApplyAddressStep; followSlot: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState(address.status);
  const [editing, setEditing] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const here = `/gift-boxes/${box.id}${token ? `?invite=${encodeURIComponent(token)}` : ""}`;

  if (box.viewer === "guest") {
    return (
      <div className={s.card}>
        <p>로그인한 뒤 신청할 수 있습니다.</p>
        <Link className="btn" href={`/login?next=${encodeURIComponent(here)}`}>
          로그인
        </Link>
      </div>
    );
  }
  if (box.viewer === "owner") {
    return (
      <div className={s.card}>
        <p>내가 만든 선물함입니다.</p>
        <Link className="btn btn--line" href={`/creator/revgift-boxes/${box.id}`}>
          신청 관리
        </Link>
      </div>
    );
  }
  if (box.viewer === "not_fan") return <p className={s.card}>팬 계정만 신청할 수 있습니다.</p>;

  if (box.myState === "preparing") return <p className={s.card}>선물이 준비되고 있어요.</p>;
  if (box.myState === "cancelled") return <p className={s.card}>선물함이 취소됐어요.</p>;
  if (box.myState === "closed" || (!box.open && box.myState === "none")) return <p className={s.card}>이번 선물함은 마감됐어요.</p>;

  if (box.viewer === "not_follower" && box.myState === "none") {
    return (
      <div className={s.card}>
        <p>팔로우한 팬만 신청할 수 있습니다.</p>
        {followSlot}
      </div>
    );
  }

  const fail = (o: { status: number; message: string }) => {
    if (o.status === 401) {
      router.push(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    setError(o.message);
    // 마감·다 참·이미 신청 — 지금 상태를 다시 읽어 그 안내로 바꾼다
    if (o.status === 409 || o.status === 403) router.refresh();
  };

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const o = await sendApply(box.id, token);
    setBusy(false);
    if (o.ok) {
      router.refresh();
      return;
    }
    if (o.noAddress) {
      setStatus({ registered: false, label: null, updatedAt: null });
      setEditing(false);
    }
    fail(o);
  };

  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const o = await sendWithdraw(box.id);
    setBusy(false);
    setSheet(false);
    if (o.ok) {
      router.refresh();
      return;
    }
    fail(o);
  };

  if (box.myState === "applied") {
    return (
      <div className={s.card}>
        <p className={s.done}>신청했습니다.</p>
        <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
        <div>
          <button className="btn btn--line" type="button" onClick={() => setSheet(true)}>
            신청 취소
          </button>
        </div>
        <BottomSheet open={sheet} title="신청을 취소할까요?" busy={busy} onClose={() => setSheet(false)}>
          <div className={d.stack}>
            <p className={d.note}>이 신청에 복사한 받을 주소는 바로 삭제됩니다.</p>
            <div className={`${d.btns} ${d.two}`}>
              <button className="btn btn--line" type="button" onClick={() => setSheet(false)} disabled={busy}>
                닫기
              </button>
              <button className="btn" type="button" onClick={() => void withdraw()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
                신청 취소
              </button>
            </div>
          </div>
        </BottomSheet>
      </div>
    );
  }

  // 신청 폼 — 받을 주소
  const registered = status?.registered ?? false;
  return (
    <section className={s.card} aria-labelledby="apply-addr-h">
      <h2 id="apply-addr-h" className={s.secH}>
        {!registered ? "받을 주소 입력" : editing ? "받을 주소 변경" : "받을 주소 확인"}
      </h2>
      {!status ? (
        <p className="err">받을 주소를 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.</p>
      ) : registered && !editing ? (
        <>
          <p className={s.onFile}>{addressOnFileText(status)}</p>
          <p className="t-meta" role="status">
            {savedMsg ?? ""}
          </p>
          <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
          <div className={s.choice}>
            <button className="btn" type="button" onClick={() => void apply()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
              이 주소로 신청
            </button>
            <button
              className="btn btn--line"
              type="button"
              onClick={() => {
                setSavedMsg(null);
                setError(null);
                setEditing(true);
              }}
            >
              주소 변경
            </button>
          </div>
        </>
      ) : !address.canEnter ? (
        <p className="err" role="status">
          {address.missingKeyText}
        </p>
      ) : (
        <>
          <p className="t-meta">{`주소는 입력한 기기에서 암호화해 전송합니다. ${box.creator.name}님에게는 공개하지 않습니다.`}</p>
          <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
          {address.renderForm({
            initialLabel: status.label,
            autoFocusFirst: registered,
            onSaved: (label) => {
              setSavedMsg(registered ? "주소가 변경되었습니다." : "주소가 등록되었습니다.");
              setError(null);
              setStatus({ registered: true, label, updatedAt: new Date().toISOString() });
              setEditing(false);
            },
            onCancel: () => setEditing(false),
          })}
        </>
      )}
    </section>
  );
}
