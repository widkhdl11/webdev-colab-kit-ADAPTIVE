"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { MyBox } from "@/entities/revgift-box/api/box-reads";
import { isExcluded } from "@/entities/revgift-box/model/box-status";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { CopyButton } from "@/shared/ui/copy-button";
import d from "@/shared/ui/dialog-parts.module.css";
import { sendCancelBox, sendCloseBox, sendRenewInvite, sendSetExcluded, type BoxOutcome } from "../api/box-requests";
import s from "./box-manage.module.css";

// 신청 관리 창 (revgift-box INV-GB5·GB7·GB8·GB9 · UX 명세 docs/ux/pages/creator-revgifts-new.md 「정한 것 ①」).
// 팬 목록(닉네임·신청 시각) · 닉네임 검색 · 초대 링크 복사 · 마감(확인 창 한 번) · 선물함 취소. 제외는 줄마다 체크, 다시 누르면 다시 넣는다.
// 제외된 줄은 흐리게 목록에 남는다. 보이는 팬 정보는 닉네임·신청 시각·상태뿐이다(INV-GB9 — 읽기 함수가 그 칸만 준다).
// 제외·마감·취소의 판정(주인·상태·받을 인원)은 서버가 한다. 화면은 신청 받는 중일 때만 체크·마감 버튼을 그린다.

type Sheet = "close" | "cancel" | null;

export function BoxManagePanel({ box, applyUrl }: { box: MyBox; applyUrl: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(box.applications);
  const [query, setQuery] = useState("");
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [link, setLink] = useState(applyUrl);
  const [linkMsg, setLinkMsg] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const open = box.status === "open";
  const active = rows.filter((r) => !isExcluded(r.status)).length;
  const shown = useMemo(() => {
    const q = query.trim();
    return q ? rows.filter((r) => r.nickname.includes(q)) : rows;
  }, [rows, query]);

  const refusal = (o: BoxOutcome<unknown>): string | null => {
    if (o.kind === "ok") return null;
    if (o.kind === "login") {
      router.push(`/login?next=${encodeURIComponent(`/creator/revgift-boxes/${box.id}`)}`);
      return null;
    }
    return o.kind === "refused" ? o.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  };

  const toggle = async (id: string, excluded: boolean) => {
    if (busyRow) return;
    setBusyRow(id);
    setRowError(null);
    const o = await sendSetExcluded(box.id, id, excluded);
    setBusyRow(null);
    if (o.kind === "ok") {
      setRows((all) => all.map((r) => (r.id === id ? { ...r, status: o.data } : r)));
      return;
    }
    setRowError(refusal(o));
  };

  const renew = async () => {
    setLinkMsg("");
    const o = await sendRenewInvite(box.id);
    if (o.kind === "ok") {
      const url = new URL(link);
      url.searchParams.set("invite", o.data);
      setLink(url.toString());
      setLinkMsg("새 링크를 만들었습니다. 이전 링크로는 신청할 수 없습니다.");
      return;
    }
    setLinkMsg(refusal(o) ?? "");
  };

  const confirm = async () => {
    if (busy || !sheet) return;
    setBusy(true);
    setSheetError(null);
    const o = sheet === "close" ? await sendCloseBox(box.id) : await sendCancelBox(box.id);
    setBusy(false);
    if (o.kind === "ok") {
      setSheet(null);
      router.refresh();
      return;
    }
    setSheetError(refusal(o));
  };

  return (
    <div className={s.stack}>
      {open ? (
        <section className={s.invite} aria-labelledby="box-link-h">
          <h2 id="box-link-h" className={s.secH}>
            {box.isPublic ? "신청 링크" : "초대 링크"}
          </h2>
          <p className={s.link}>{link}</p>
          <div className={s.linkBtns}>
            <CopyButton
              text={link}
              label={box.isPublic ? "링크 복사" : "초대 링크 복사"}
              className="btn btn--line btn--sm"
              copiedMessage="링크를 복사했습니다."
              failedMessage="복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요."
            />
            {box.isPublic ? null : (
              <button className="btn btn--line btn--sm" type="button" onClick={() => void renew()}>
                링크 다시 만들기
              </button>
            )}
          </div>
          <p className="t-meta" role="status">
            {linkMsg}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="box-fans-h">
        <div className={s.listHead}>
          <h2 id="box-fans-h" className={s.secH}>
            신청한 팬 <span className={s.count}>{`${active}명 / ${box.capacity}명`}</span>
          </h2>
          <div className={s.search}>
            <label className="sr-only" htmlFor="box-search">
              닉네임 검색
            </label>
            <input id="box-search" className="input" type="search" placeholder="닉네임 검색" value={query} maxLength={20} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div role="alert">{rowError ? <p className={`err ${s.alert}`}>{rowError}</p> : null}</div>
        {rows.length === 0 ? (
          <p className={s.none}>아직 신청한 팬이 없습니다.</p>
        ) : shown.length === 0 ? (
          <p className={s.none}>검색 결과가 없습니다.</p>
        ) : (
          <ul className={s.rows}>
            {shown.map((r) => {
              const excluded = isExcluded(r.status);
              return (
                <li key={r.id} className={excluded ? `${s.row} ${s.off}` : s.row}>
                  <span className={s.nick} title={r.nickname}>
                    {r.nickname}
                  </span>
                  <span className={s.when}>{formatDateTime(r.appliedAt)}</span>
                  {open ? (
                    <label className={s.check}>
                      <input
                        type="checkbox"
                        checked={excluded}
                        aria-label={`${r.nickname} 제외`}
                        aria-busy={busyRow === r.id || undefined}
                        onChange={(e) => void toggle(r.id, e.target.checked)}
                      />
                      제외
                    </label>
                  ) : excluded ? (
                    <span className="tag">제외</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {["open", "closed", "awaiting_box"].includes(box.status) ? (
        <div className={s.actions}>
          {open ? (
            <button className="btn" type="button" onClick={() => setSheet("close")} aria-disabled={active === 0 || undefined} disabled={active === 0}>
              마감
            </button>
          ) : null}
          <button className="btn btn--line" type="button" onClick={() => setSheet("cancel")}>
            선물함 취소
          </button>
        </div>
      ) : null}

      <BottomSheet
        open={sheet !== null}
        title={sheet === "close" ? "신청을 마감할까요?" : "선물함을 취소할까요?"}
        busy={busy}
        onClose={() => {
          setSheet(null);
          setSheetError(null);
        }}
      >
        <div className={d.stack}>
          <p className={d.note}>
            {sheet === "close"
              ? `신청한 팬 ${active}명으로 마감합니다. 마감한 뒤에는 신청을 받거나 제외를 바꿀 수 없습니다.`
              : "신청한 팬의 주소는 바로 삭제되고, 이 선물함으로는 선물을 보낼 수 없습니다."}
          </p>
          <div role="alert">{sheetError ? <p className="err">{sheetError}</p> : null}</div>
          <div className={`${d.btns} ${d.two}`}>
            <button className="btn btn--line" type="button" onClick={() => setSheet(null)} disabled={busy}>
              닫기
            </button>
            <button className="btn" type="button" onClick={() => void confirm()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
              {sheet === "close" ? "마감" : "선물함 취소"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
