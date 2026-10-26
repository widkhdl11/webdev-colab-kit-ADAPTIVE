"use client";

import { useRef, useState, type ReactNode } from "react";
import { PHOTO_ACCEPT } from "@/shared/lib/image/photo-limits";
import { photoPickProblem } from "@/shared/lib/image/photo-pick";
import s from "./image-field.module.css";

// 사진 한 칸(프로필 사진·배경사진·팬덤 심볼) — 크리에이터 「프로필 수정」·「상세 설정」(팬마크)이 같이 쓴다 — 고르면 바로 서버로 보낸다. 서버가 열어 보고 사진 정보를 지운 뒤 다시 굽는다(creator-link INV-E9).
// 파일 칸은 sr-only 로 숨기고 라벨을 버튼 모양으로 보인다(키보드·화면 읽기는 그대로). 결과 문구는 파일 칸의 설명으로 이어 읽힌다.
// 보내기 전 검사(종류·크기)는 안내일 뿐이다 — 판단은 서버가 다시 한다. 막혀 있으면(blocked) 파일 칸을 끄고 그 까닭을 설명으로 잇는다.

export type ImageSendResult = { kind: "ok"; path: string | null } | { kind: "login" } | { kind: "failed"; message: string };

/** 칸 이름 — 직접 그리거나(label), 바깥에 같은 이름의 제목이 이미 보이면 그 제목의 id(labelledBy)로 읽힌다(같은 이름을 두 번 읽지 않게). 둘 중 하나만 */
type ImageFieldName = { label: string; labelledBy?: never } | { label?: never; labelledBy: string };

export function ImageField({
  id,
  label,
  labelledBy,
  view,
  hasImage,
  pickLabel,
  removeLabel,
  hint,
  sizeHint,
  blocked = null,
  upload,
  remove,
  onSaved,
  onLogin,
  savedText,
  removedText,
}: {
  id: string;
} & ImageFieldName & {
  /** 지금 사진 보기 — 화면 위 미리보기가 이미 보여 주면 없다 */
  view?: ReactNode;
  hasImage: boolean;
  pickLabel: string;
  removeLabel: string;
  /** 칸 아래 안내 — 시안에 없으면 넘기지 않는다 */
  hint?: ReactNode;
  /** 안내 아래 권장 크기 한 줄(배경 사진 「권장 크기 1200×480」 — 시안 v24-creator-card cprofile) */
  sizeHint?: string;
  /** 고를 수 없는 까닭의 설명 요소 id — 있으면 파일 칸을 끈다 */
  blocked?: string | null;
  upload: (file: File) => Promise<ImageSendResult>;
  remove: () => Promise<ImageSendResult>;
  /** 저장된 새 경로(지웠으면 null) */
  onSaved: (path: string | null) => void;
  onLogin: () => void;
  savedText: string;
  removedText: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const finish = (r: ImageSendResult, okText: string) => {
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (r.kind === "login") return onLogin();
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    onSaved(r.path);
    setMsg({ ok: true, text: okText });
  };

  const picked = async (file: File | undefined) => {
    if (!file || busy) return;
    const problem = photoPickProblem(file);
    if (problem) {
      setMsg({ ok: false, text: problem });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    setMsg(null);
    finish(await upload(file), savedText);
  };

  const removeNow = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    finish(await remove(), removedText);
  };

  const off = busy || blocked !== null;
  return (
    <div className={s.fld} role="group" aria-labelledby={labelledBy ?? `${id}-t`}>
      {labelledBy ? null : (
        <p className={s.lbl} id={`${id}-t`}>
          {label}
        </p>
      )}
      <div className={s.imgRow}>
        {view ?? null}
        <div className="btn-stack">
          <input
            className={`sr-only ${s.file}`}
            id={id}
            ref={fileRef}
            type="file"
            accept={PHOTO_ACCEPT}
            disabled={off}
            aria-describedby={[blocked, hint ? `${id}-hint` : null, sizeHint ? `${id}-size` : null, `${id}-msg`].filter(Boolean).join(" ")}
            onChange={(e) => void picked(e.currentTarget.files?.[0])}
          />
          <label className={`btn btn--line btn--sm ${s.pick}`} htmlFor={id} aria-disabled={off}>
            {busy ? "저장 중…" : pickLabel}
          </label>
          {hasImage ? (
            <button className="btn btn--line btn--sm" type="button" aria-disabled={busy} onClick={() => void removeNow()}>
              {removeLabel}
            </button>
          ) : null}
        </div>
      </div>
      {hint ? (
        <p className="t-meta" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {sizeHint ? (
        <p className={s.size} id={`${id}-size`}>
          {sizeHint}
        </p>
      ) : null}
      <p className={`${s.msg} ${msg && !msg.ok ? "err" : "t-meta"}`} role="status" id={`${id}-msg`}>
        {msg?.text}
      </p>
    </div>
  );
}
