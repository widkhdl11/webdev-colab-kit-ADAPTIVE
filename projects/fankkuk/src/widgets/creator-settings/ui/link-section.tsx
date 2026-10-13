"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { MyCreatorLink } from "@/entities/creator/api/creator-link-reads";
import { canDownloadNotice, HANDLE_LOCK_DAYS, HANDLE_MAX, HANDLE_RETIRE_DAYS, isSameHandle, LINK_HOST, linkText, normalizeHandle } from "@/entities/creator/model/creator-handle";
import { creatorPhotoUrl } from "@/entities/creator/model/link-images";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { deleteCreatorPhoto, sendCreatorPhoto } from "@/features/creator-photo/api/send-creator-photo";
import { sendCreatorHandle } from "@/features/creator-settings-save/api/send-creator-settings";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { CopyButton } from "@/shared/ui/copy-button";
import s from "./creator-settings.module.css";

// 선물 링크·프로필 사진·공지 이미지 (creator-link INV-E2~E4·E9·E10). 「주소와 설정」 프로필 카드 다음 — 같은 카드 언어(제목 줄·필드·저장 버튼·상태 문구).
// 링크용 아이디는 저장 전에 「정하면 30일 동안 바꿀 수 없어요」를 확인 창으로 보인다(스펙 「스스로 정한 것」). 저장 검사는 DB 가 다시 한다.
// 사진은 서버가 열어 보고 사진 정보를 지운 512 정사각만 저장한다 — 화면은 파일을 서버로 보내기만 한다.
// 파일 칸은 브라우저 기본 모양이 좁은 폭에서 가로로 넘쳐 화면에서 숨기고(sr-only, 키보드·화면 읽기는 그대로), 「사진 고르기」 라벨을 버튼 모양으로 보인다. 고른 파일 이름은 따로 적는다.
// 공지 이미지는 링크 주소가 있고 본인 확인을 마쳤을 때만 내려받는다(INV-E10).

export function LinkSection({
  initial,
  photoBase,
  verified,
}: {
  initial: MyCreatorLink;
  /** 공개 저장소 주소 — 사진 미리보기 주소를 만든다 */
  photoBase: string;
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
  const [photoPath, setPhotoPath] = useState(initial.photoPath);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const uploadPhoto = async () => {
    const file = fileRef.current?.files?.[0];
    if (photoBusy) return;
    if (!file) {
      setPhotoMsg({ ok: false, text: "올릴 사진을 먼저 골라 주세요." });
      return;
    }
    setPhotoBusy(true);
    setPhotoMsg(null);
    const r = await sendCreatorPhoto(file);
    setPhotoBusy(false);
    if (r.kind === "login") {
      router.push("/login?next=/creator/settings");
      return;
    }
    if (r.kind === "failed") {
      setPhotoMsg({ ok: false, text: r.message });
      return;
    }
    setPhotoPath(r.photoPath);
    if (fileRef.current) fileRef.current.value = "";
    setFileName(null);
    setPhotoMsg({
      ok: true,
      text: "프로필 사진을 바꿨어요. 사진 정보(촬영 위치 등)는 지우고 저장했어요.",
    });
  };

  const removePhoto = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    setPhotoMsg(null);
    const r = await deleteCreatorPhoto();
    setPhotoBusy(false);
    if (r.kind === "login") {
      router.push("/login?next=/creator/settings");
      return;
    }
    if (r.kind === "failed") {
      setPhotoMsg({ ok: false, text: r.message });
      return;
    }
    setPhotoPath(null);
    setPhotoMsg({ ok: true, text: "프로필 사진을 지웠어요." });
  };

  const photoUrl = creatorPhotoUrl(photoBase, photoPath);
  const noticeReady = canDownloadNotice({ handle, verified });

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

      <hr className={s.rule} />

      <div role="group" aria-labelledby="link-photo-title">
        <p className="label" id="link-photo-title">
          프로필 사진
        </p>
        <div className={s["photo-row"]}>
          <CreatorPhoto photoUrl={photoUrl} tone="var(--face-1)" className={s["photo-prev"]} />
          <div className={s["photo-ctl"]}>
            <div className="btn-stack">
              <input
                className={`sr-only ${s.file}`}
                id="link-photo"
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-describedby="link-photo-name link-photo-hint link-photo-msg"
                onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? null)}
              />
              <label className={`btn btn--line btn--sm ${s.pick}`} htmlFor="link-photo">
                사진 고르기
              </label>
              <button className="btn btn--sm" type="button" aria-disabled={photoBusy} onClick={() => void uploadPhoto()}>
                {photoBusy ? "저장하는 중…" : "사진 올리기"}
              </button>
              {photoPath ? (
                <button className="btn btn--line btn--sm" type="button" aria-disabled={photoBusy} onClick={() => void removePhoto()}>
                  사진 지우기
                </button>
              ) : null}
            </div>
            <p className={`t-meta ${s["file-name"]}`} id="link-photo-name">
              {fileName ? `고른 사진: ${fileName}` : "아직 고른 사진이 없어요."}
            </p>
          </div>
        </div>
        <p className="t-meta hint" id="link-photo-hint">
          jpg·png·webp, 10MB 까지. 가운데를 정사각으로 잘라 저장하고, 촬영 위치 같은 사진 정보는 지워요. 링크 미리보기에도 이 사진이 들어가요.
        </p>
        <p className={`${s.msg} ${photoMsg && !photoMsg.ok ? "err" : "t-meta"}`} role="status" id="link-photo-msg">
          {photoMsg?.text}
        </p>
      </div>

      <hr className={s.rule} />

      <div className={`card card--soft ${s.inner}`}>
        <p className="t-strong">공지 이미지</p>
        <p className={s["body-gap"]}>
          {noticeReady ? "「선물은 팬꾹으로 받아요」 이미지를 내려받아 방송·SNS 공지에 쓰세요." : "본인 확인을 마치고 링크 주소를 정하면 내려받을 수 있어요."}
        </p>
        {noticeReady ? (
          <p className={s["inner-btn"]}>
            <a className="btn btn--line btn--sm" href="/api/creator/notice-image" download="fankkuk-notice.png">
              내려받기
            </a>
          </p>
        ) : null}
      </div>

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
