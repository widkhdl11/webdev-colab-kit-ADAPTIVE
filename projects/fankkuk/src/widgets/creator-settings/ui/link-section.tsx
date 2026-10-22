"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MyCreatorLink } from "@/entities/creator/api/creator-link-reads";
import { HANDLE_LOCK_DAYS, HANDLE_MAX, HANDLE_RETIRE_DAYS, isSameHandle, LINK_HOST, linkText, normalizeHandle } from "@/entities/creator/model/creator-handle";
import { CREATOR_PROFILE_EDIT } from "@/entities/session/model/home-path";
import { sendCreatorHandle } from "@/features/creator-settings-save/api/send-creator-settings";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { CopyButton } from "@/shared/ui/copy-button";
import s from "./creator-settings.module.css";

// 선물 링크 (creator-link INV-E2~E4). 「주소와 설정」 프로필 카드 다음 — 같은 카드 언어(제목 줄·필드·저장 버튼·상태 문구).
// 프로필 사진·공지 이미지는 「내 팬꾹 꾸미기」(/creator/customize)로 옮겼다(디자인 기준 10절) — 여기는 그 화면으로 가는 링크만.
// 링크용 아이디는 저장 전에 「정하면 30일 동안 바꿀 수 없어요」를 확인 창으로 보인다(스펙 「스스로 정한 것」). 저장 검사는 DB 가 다시 한다.

export function LinkSection({
  initial,
  verified,
}: {
  initial: MyCreatorLink;
  /** 본인 확인을 마쳤는가 — 링크는 본인 확인 뒤에 열린다(INV-E5) */
  verified: boolean;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(initial.handle);
  const [draft, setDraft] = useState(initial.handle ?? "");
  const [lockedDays, setLockedDays] = useState(initial.lockedDays);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const locked = lockedDays > 0;

  const askSave = () => {
    setMsg(null);
    if (isSameHandle(draft, handle)) {
      setMsg({ ok: false, text: "지금 쓰는 링크 주소와 같아요." });
      return;
    }
    setConfirming(true);
  };

  const saveHandle = async () => {
    if (saving) return;
    setSaving(true);
    const r = await sendCreatorHandle({ handle: draft });
    setSaving(false);
    setConfirming(false);
    if (r.kind === "login") {
      router.push("/login?next=/creator/settings");
      return;
    }
    if (r.kind === "failed") {
      setMsg({ ok: false, text: r.message });
      return;
    }
    setHandle(r.handle);
    setDraft(r.handle);
    setLockedDays(HANDLE_LOCK_DAYS);
    setMsg({
      ok: true,
      text: `링크 주소를 ${linkText(r.handle)} 로 정했어요.`,
    });
    router.refresh();
  };

  return (
    <section id="link" className={`card ${s.set}`} aria-labelledby="link-h">
      <div className={s["set-head"]}>
        <h3 className="t-card" id="link-h">
          선물 링크
        </h3>
      </div>

      <div>
        <label className="label" htmlFor="link-handle">
          링크 주소
        </label>
        <div className={s["handle-row"]}>
          <span className={s["handle-host"]} aria-hidden="true">
            {LINK_HOST}/
          </span>
          <input
            className="field"
            id="link-handle"
            value={draft}
            maxLength={HANDLE_MAX + 4}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={locked}
            onChange={(e) => setDraft(e.target.value)}
            aria-describedby="link-handle-hint link-msg"
          />
        </div>
        <p className="t-meta hint" id="link-handle-hint">
          {locked
            ? `링크 주소는 ${lockedDays}일 뒤에 바꿀 수 있어요.`
            : `${LINK_HOST}/ 뒤에 붙는 주소예요. 영문·숫자·밑줄(_)로 3~${HANDLE_MAX}자. 방송·SNS 에 붙일 주소라 로그인 아이디와 다른 값으로 정해 주세요.`}
        </p>
        {handle ? (
          <div className={s["link-now"]}>
            <p className={`t-strong ${s["link-text"]}`}>{linkText(handle)}</p>
            <p className="t-meta">{verified ? "지금 이 주소로 내 페이지가 열려요." : "본인 확인을 마치면 이 주소로 내 페이지가 열려요."}</p>
          </div>
        ) : null}
      </div>
      {handle || !locked ? (
        <div className={`btn-stack ${s["link-btns"]}`}>
          {handle ? (
            <CopyButton
              className="btn btn--line btn--sm"
              text={`https://${linkText(handle)}`}
              label="복사"
              ariaLabel="링크 주소 복사"
              copiedMessage="링크 주소를 복사했어요."
              failedMessage="복사가 막혀 있어요. 주소를 직접 옮겨 적어 주세요."
            />
          ) : null}
          {!locked ? (
            <button className="btn btn--sm" type="button" aria-disabled={saving} onClick={askSave}>
              {handle ? "링크 주소 바꾸기" : "링크 주소 정하기"}
            </button>
          ) : null}
        </div>
      ) : null}
      <p className={`${s["set-msg"]} ${msg && !msg.ok ? "err" : "t-meta"}`} role="status" id="link-msg">
        {msg?.text}
      </p>

      <p className="t-meta">
        프로필 사진·배경사진은 <a className={s["text-link"]} href={CREATOR_PROFILE_EDIT}>
          프로필 수정
        </a>
        에서 바꿔요.
      </p>

      <BottomSheet open={confirming} title={`${linkText(normalizeHandle(draft) || "…")} 로 정할까요?`} onClose={() => setConfirming(false)}>
        <p>정하면 {HANDLE_LOCK_DAYS}일 동안 바꿀 수 없어요.</p>
        <p className={`t-meta ${s["sheet-sub"]}`}>
          {handle ? `지금 주소(${linkText(handle)})로 들어온 팬은 ${HANDLE_RETIRE_DAYS}일 동안 새 주소로 넘겨 드려요.` : "방송·SNS 에 붙이기 전에 철자를 한 번 더 확인해 주세요."}
        </p>
        <div className={s["sheet-btns"]}>
          <button className="btn btn--line" type="button" onClick={() => setConfirming(false)}>
            돌아가기
          </button>
          <button className="btn" type="button" aria-disabled={saving} onClick={() => void saveHandle()}>
            {saving ? "저장하는 중…" : "정하기"}
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
