"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type RefObject } from "react";
import type { BoxApplication, MyBox } from "@/entities/revgift-box/api/box-reads";
import { BOX_STATUS_NAME, isExcluded, isWaitlisted } from "@/entities/revgift-box/model/box-status";
import { formatDateTime, formatMonthDayTimeKo } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import { ConfirmDialog, StepDialog } from "@/shared/ui/step-dialog";
import { sendCancelBox, sendCloseBox, sendRenewInvite, sendSetExcluded, type BoxOutcome } from "../api/box-requests";
import s from "./box-manage.module.css";

// 신청 관리 (revgift-box INV-GB5·GB7·GB8·GB9 · UX 명세 creator-revgifts-new 「2026-11-10 시안 승인」 · design-rules 43절).
// BoxManageDialog — 신청 받는 중인 선물함의 신청 관리 모달. 목록 위에 뜨고 주소는 바뀌지 않는다.
//   머리(고정): 이름 · 링크 복사(0명이면 채움) · 닫기 / 꼬리표. 본문(스크롤): 현황+막대 · 닉네임 검색 · 신청 칩 · 대기 칩.
//   신청 칩의 체크 해제 = 제외(그 자리에서 저장, 「제외됨」), 대기 칩의 체크 = 마감 때 넣을 사람. 아래(고정): 결과 줄 · 사실 두 줄 · 선물함 취소 · 마감하기.
//   「마감하기」 한 번이 확정이다 — 두 번째 확인 창이 없다. 고른 대기 신청 번호를 마감 요청에 싣는다(INV-GB8). 0명이어도 마감할 수 있다.
// BoxManagePanel — 신청 받는 중이 아닌 선물함(마감 뒤 단계 화면이 없는 상태)의 읽기 전용 목록 + 선물함 취소.
// 보이는 팬 정보는 닉네임·신청 시각·순번뿐이다(INV-GB9 — 읽기 함수가 그 칸만 준다). 제외·마감·취소의 판정(주인·상태·받을 인원)은 서버가 한다.

/** 신청 관리에 보이는 신청 — 신청(제외 포함)과 대기로 나눈다. 신청 취소·마감 뒤 단계의 줄은 여기 오지 않는다 */
export function splitApplications(box: Pick<MyBox, "status" | "applications">): { applicants: BoxApplication[]; waitlist: BoxApplication[] } {
  const applicants = box.applications.filter((a) => a.status === "applied" || a.status === "excluded");
  const waitlist = box.applications
    .filter((a) => isWaitlisted(a.status, box.status))
    .sort((a, b) => (a.waitlistNo ?? 0) - (b.waitlistNo ?? 0));
  return { applicants, waitlist };
}

export function BoxManageDialog({
  box,
  applyUrl,
  open,
  onClose,
  returnFocusRef,
}: {
  box: MyBox;
  applyUrl: string;
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(box.applications);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState(applyUrl);
  const [linkMsg, setLinkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);

  const { applicants, waitlist } = useMemo(() => splitApplications({ status: box.status, applications: rows }), [rows, box.status]);
  const active = applicants.filter((a) => !isExcluded(a.status)).length;
  const chosenWait = waitlist.filter((w) => picked.has(w.id)).length;
  const total = active + chosenWait;
  const full = active >= box.capacity;
  const q = query.trim();
  const shownApplicants = q ? applicants.filter((a) => a.nickname.includes(q)) : applicants;
  const shownWait = q ? waitlist.filter((a) => a.nickname.includes(q)) : waitlist;
  const nobody = applicants.length === 0 && waitlist.length === 0;

  const refusal = (o: BoxOutcome<unknown>): string | null => {
    if (o.kind === "ok") return null;
    if (o.kind === "login") {
      router.push(`/login?next=${encodeURIComponent(`/creator/revgift-boxes/${box.id}`)}`);
      return null;
    }
    return o.kind === "refused" ? o.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  };

  // 신청 칩 — 체크 해제가 제외, 다시 체크가 다시 넣기(그 자리에서 저장, INV-GB7)
  const toggle = async (id: string, excluded: boolean) => {
    if (busyRow || busy) return;
    setBusyRow(id);
    setError(null);
    const o = await sendSetExcluded(box.id, id, excluded);
    setBusyRow(null);
    if (o.kind === "ok") {
      setRows((all) => all.map((r) => (r.id === id ? { ...r, status: o.data } : r)));
      return;
    }
    setError(refusal(o));
  };

  const copy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setLinkMsg("복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.");
      return;
    }
    navigator.clipboard.writeText(link).then(
      () => setLinkMsg("링크를 복사했습니다."),
      () => setLinkMsg("복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요."),
    );
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

  // 마감하기 한 번이 확정 — 고른 대기 신청만 싣는다(INV-GB8). 보낼 팬이 있으면 상자 고르기 화면으로 간다
  const close = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ids = waitlist.filter((w) => picked.has(w.id)).map((w) => w.id);
    const o = await sendCloseBox(box.id, ids);
    setBusy(false);
    if (o.kind === "ok") {
      onClose();
      if (total > 0) router.push(`/creator/revgift-boxes/${box.id}`);
      else router.refresh();
      return;
    }
    setError(refusal(o));
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const o = await sendCancelBox(box.id);
    setBusy(false);
    setCancelAsk(false);
    if (o.kind === "ok") {
      onClose();
      router.refresh();
      return;
    }
    setError(refusal(o));
  };

  const fixed = (
    <>
      {nobody ? null : (
        <p className={s.pickres}>
          <b>{waitlist.length > 0 ? `보낼 팬 ${active}명 + 대기 ${chosenWait}명 = ${total}명` : `보낼 팬 ${active}명`}</b>
          <span>{`받을 인원 ${box.capacity}명`}</span>
        </p>
      )}
      <div className={s.pnotes}>
        {total === 0 ? (
          <p>신청한 팬이 없습니다. 마감하면 이 선물함은 끝납니다.</p>
        ) : (
          <>
            <p>선택하지 않은 팬의 주소는 마감과 함께 지웁니다.</p>
            <p>마감한 뒤에는 바꿀 수 없습니다.</p>
          </>
        )}
      </div>
      <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
    </>
  );

  return (
    <>
      <StepDialog
        open={open}
        tall={!nobody}
        title={box.name}
        headExtra={
          <button className={nobody ? "btn btn--sm" : "btn btn--sm btn--line"} type="button" onClick={copy}>
            <LinkIcon />
            링크 복사
          </button>
        }
        tags={
          <>
            <span className="tag tag--dot tag--info">{BOX_STATUS_NAME.open}</span>
            {full ? <span className="tag tag--line">인원 마감</span> : null}
            <span className="tag tag--line">{box.isPublic ? "공개" : "비공개"}</span>
            <p className={s.linkMsg} role="status">
              {linkMsg}
            </p>
          </>
        }
        bodyLabel={nobody ? undefined : "보낼 팬 고르기"}
        fixed={fixed}
        busy={busy}
        onRequestClose={onClose}
        returnFocusRef={returnFocusRef}
        footer={
          <>
            <button className="btn btn--text" type="button" disabled={busy} onClick={() => setCancelAsk(true)}>
              선물함 취소
            </button>
            <button className="btn" type="button" onClick={() => void close()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
              {busy ? "마감하는 중…" : "마감하기"}
            </button>
          </>
        }
      >
        <div className={s.mgTop}>
          <div className={s.mgSt}>
            <p className={s.rNum}>
              <b>{`신청 ${active}명`}</b>
              <span>{` / ${box.capacity}명${waitlist.length > 0 ? ` · 대기 ${waitlist.length}명` : ""}`}</span>
            </p>
            <div
              className={s.bar}
              role="progressbar"
              aria-label={`신청 ${active}명 / ${box.capacity}명`}
              aria-valuemin={0}
              aria-valuemax={box.capacity}
              aria-valuenow={Math.min(active, box.capacity)}
            >
              <i style={{ width: `${Math.min(100, Math.round((active / Math.max(1, box.capacity)) * 100))}%` }} />
            </div>
          </div>
          {box.isPublic ? null : (
            <div className={s.renew}>
              <button className="btn btn--text btn--sm" type="button" onClick={() => void renew()}>
                링크 다시 만들기
              </button>
            </div>
          )}
          {nobody ? null : (
            <div>
              <label className="sr-only" htmlFor={`mg-search-${box.id}`}>
                닉네임 검색
              </label>
              <input
                id={`mg-search-${box.id}`}
                className="input"
                type="search"
                placeholder="닉네임 검색"
                value={query}
                maxLength={20}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
        </div>
        {nobody ? (
          <p className={s.none}>아직 신청한 팬이 없습니다.</p>
        ) : shownApplicants.length === 0 && shownWait.length === 0 ? (
          <p className={s.none}>검색 결과가 없습니다.</p>
        ) : (
          <>
            {applicants.length > 0 ? (
              <section aria-labelledby={`mg-a-${box.id}`}>
                <h3 className={s.pkH} id={`mg-a-${box.id}`}>
                  신청한 팬 <span className={s.count}>{`${applicants.length}명`}</span>
                </h3>
                <ul className={s.pgrid}>
                  {shownApplicants.map((r) => {
                    const off = isExcluded(r.status);
                    return (
                      <li key={r.id}>
                        <label className={off ? `${s.pchip} ${s.isOff}` : s.pchip}>
                          <span className={s.pcT}>
                            <span className={s.cmN} title={r.nickname}>
                              {r.nickname}
                            </span>
                            <span className={s.cmW}>{off ? `제외됨 · ${formatMonthDayTimeKo(r.appliedAt)}` : formatMonthDayTimeKo(r.appliedAt)}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={!off}
                            aria-label={`${r.nickname} 보낼 팬에 넣기`}
                            aria-busy={busyRow === r.id || undefined}
                            onChange={(e) => void toggle(r.id, !e.target.checked)}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {waitlist.length > 0 ? (
              <section aria-labelledby={`mg-w-${box.id}`}>
                <h3 className={s.pkH} id={`mg-w-${box.id}`}>
                  대기 <span className={s.count}>{`${waitlist.length}명`}</span>
                </h3>
                <ul className={s.pgrid}>
                  {shownWait.map((r) => {
                    const on = picked.has(r.id);
                    return (
                      <li key={r.id}>
                        <label className={on ? s.pchip : `${s.pchip} ${s.isOff}`}>
                          <span className={s.mNo} aria-hidden="true">
                            {r.waitlistNo}
                          </span>
                          <span className={s.pcT}>
                            <span className={s.cmN} title={r.nickname}>
                              {r.nickname}
                            </span>
                            <span className={s.cmW}>{`대기 ${r.waitlistNo}번 · ${formatMonthDayTimeKo(r.appliedAt)}`}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={on}
                            aria-label={`${r.nickname} 대기 ${r.waitlistNo}번 보낼 팬에 넣기`}
                            onChange={(e) =>
                              setPicked((cur) => {
                                const next = new Set(cur);
                                if (e.target.checked) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              })
                            }
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </StepDialog>
      <ConfirmDialog
        open={cancelAsk}
        title="선물함을 취소할까요?"
        description="신청한 팬의 주소는 바로 삭제되고, 이 선물함으로는 선물을 보낼 수 없습니다."
        onCancel={() => setCancelAsk(false)}
      >
        <button className="btn btn--line" type="button" disabled={busy} onClick={() => setCancelAsk(false)}>
          닫기
        </button>
        <button className="btn" type="button" onClick={() => void cancel()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
          선물함 취소
        </button>
      </ConfirmDialog>
    </>
  );
}

function LinkIcon() {
  return (
    <svg className={s.ico} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

type Sheet = "cancel" | null;

/** 신청 받는 중이 아닌 선물함 — 읽기 전용 신청 목록 + (마감·팬꾹으로 배송하기 동안) 선물함 취소 */
export function BoxManagePanel({ box }: { box: MyBox }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const rows = box.applications;

  const confirm = async () => {
    if (busy || !sheet) return;
    setBusy(true);
    setSheetError(null);
    const o = await sendCancelBox(box.id);
    setBusy(false);
    if (o.kind === "ok") {
      setSheet(null);
      router.refresh();
      return;
    }
    if (o.kind === "login") {
      router.push(`/login?next=${encodeURIComponent(`/creator/revgift-boxes/${box.id}`)}`);
      return;
    }
    setSheetError(o.kind === "refused" ? o.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  };

  return (
    <div className={s.stack}>
      <section aria-labelledby="box-fans-h">
        <h2 id="box-fans-h" className={s.secH}>
          신청한 팬 <span className={s.count}>{`${rows.filter((r) => !isExcluded(r.status)).length}명 / ${box.capacity}명`}</span>
        </h2>
        {rows.length === 0 ? (
          <p className={s.none}>신청한 팬이 없습니다.</p>
        ) : (
          <ul className={s.rows}>
            {rows.map((r) => (
              <li key={r.id} className={isExcluded(r.status) ? `${s.row} ${s.off}` : s.row}>
                <span className={s.nick} title={r.nickname}>
                  {r.nickname}
                </span>
                <span className={s.when}>{formatDateTime(r.appliedAt)}</span>
                {isExcluded(r.status) ? <span className="tag">제외</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {["closed", "awaiting_box"].includes(box.status) ? (
        <div className={s.actions}>
          <button className="btn btn--line" type="button" onClick={() => setSheet("cancel")}>
            선물함 취소
          </button>
        </div>
      ) : null}

      <BottomSheet
        open={sheet !== null}
        title="선물함을 취소할까요?"
        busy={busy}
        onClose={() => {
          setSheet(null);
          setSheetError(null);
        }}
      >
        <div className={d.stack}>
          <p className={d.note}>신청한 팬의 주소는 바로 삭제되고, 이 선물함으로는 선물을 보낼 수 없습니다.</p>
          <div role="alert">{sheetError ? <p className="err">{sheetError}</p> : null}</div>
          <div className={`${d.btns} ${d.two}`}>
            <button className="btn btn--line" type="button" onClick={() => setSheet(null)} disabled={busy}>
              닫기
            </button>
            <button className="btn" type="button" onClick={() => void confirm()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
              선물함 취소
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
