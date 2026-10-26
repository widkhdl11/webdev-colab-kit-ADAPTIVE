"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { fanImageUrl, type FanImageKind } from "@/entities/fan/model/fan-profile";
import { NICKNAME_MAX } from "@/entities/session/model/nickname-rule";
import { deleteFanImage, sendFanImage, sendFanProfile } from "@/features/fan-profile-edit/api/send-fan-profile";
import { planFanProfileSave } from "@/features/fan-profile-edit/model/plan-profile-save";
import { FAN_INTRO_MAX } from "@/features/fan-profile-edit/model/profile-input";
import { PHOTO_ACCEPT } from "@/shared/lib/image/photo-limits";
import { photoPickProblem } from "@/shared/lib/image/photo-pick";
import { charCount } from "@/shared/lib/validation/char-count";
import s from "./fan-profile-edit.module.css";

// 팬 프로필 수정 (design-rules 27절 「4파트 나머지 다섯 화면」, 카드 d115 · 시안 docs/design/mockups/site/pilot-2026-10-22/me-profile.html, 값은 pilot.css .me-*·.pf-*).
// 계정 설정(팬)과 같은 880 안 12열 4 + 8 묶음 둘 — 「사진」(즉시 저장) → 「소개」(닉네임·자기소개) → 저장 줄 [취소][저장하기]. 카드 없음.
// 스펙 my-account INV-A12~A14:
// - 사진·배경 사진은 고르는 즉시 서버로 보낸다(/api/me/profile/image/…). 서버가 열어 보고 사진 정보를 지운 뒤 다시 그린다 — 화면은 보내기만 한다.
// - 자기소개·닉네임은 「저장하기」로 /api/me/profile 에 한 번에 보낸다 — 한 처리라 둘 다 되거나 둘 다 안 된다(INV-A12).
//   무엇을 보낼지(바뀐 칸만·칸 오류)는 features 의 planFanProfileSave 가 정한다. 닉네임 판정은 내 정보 고치기와 같은 DB 판정이다.
// - 사진 칸: 지운 뒤에는 올리기 버튼(파일 칸)으로 초점을 옮기고 글자를 「사진 올리기」로 바꾼다(시안 스크립트와 같다).
// 시안의 자물쇠 안내 줄(「나와 승인 요청을 받은 크리에이터에게만」)은 카드 d91 로 맞지 않게 되어 옮기지 않는다 — 공개 범위 설명 문구는 두지 않는다(2026-10-15 사용자).
// 시안의 「사용할 수 있는 닉네임이에요」 미리 확인은 로그인한 사람용 확인 경로가 없어 두지 않는다 — 겹치면 저장할 때 칸 아래에 알린다.

export type FanProfileEditProps = {
  nickname: string;
  intro: string;
  photoPath: string | null;
  bgPath: string | null;
  /** 공개 저장소 주소 — 사진 미리보기 주소를 만든다 */
  photoBase: string;
};

const LOGIN = "/login?next=/me/profile";

type Msg = { ok: boolean; text: string } | null;

function PhotoField({
  kind,
  title,
  view,
  hasImage,
  help,
  onSaved,
  onLogin,
}: {
  kind: FanImageKind;
  title: string;
  view: ReactNode;
  hasImage: boolean;
  help: ReactNode;
  onSaved: (path: string | null) => void;
  onLogin: () => void;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  // 삭제 뒤 초점을 업로드 버튼으로 — 「삭제」 버튼이 사라져 초점이 맨 앞으로 빠지지 않게. 파일 칸이 다시 켜진 뒤에 옮긴다
  const [focusPick, setFocusPick] = useState(false);
  useEffect(() => {
    if (!focusPick || busy) return;
    fileRef.current?.focus();
    setFocusPick(false);
  }, [focusPick, busy]);

  const finish = (r: Awaited<ReturnType<typeof sendFanImage>>, okText: string, removed = false) => {
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (r.kind === "login") return onLogin();
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    onSaved(r.path);
    setMsg({ ok: true, text: okText });
    if (removed) setFocusPick(true);
  };

  const picked = async (file: File | undefined) => {
    if (!file || busy) return;
    const problem = photoPickProblem(file);
    if (problem) {
      if (fileRef.current) fileRef.current.value = "";
      return setMsg({ ok: false, text: problem });
    }
    setBusy(true);
    setMsg(null);
    finish(await sendFanImage(kind, file), `${title} 변경 완료`);
  };

  const removeNow = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    finish(await deleteFanImage(kind), `${title} 삭제 완료`, true);
  };

  const bad = msg !== null && !msg.ok;

  // 버튼 묶음 — 프로필 사진은 줄 오른쪽, 배경 사진은 이름 줄 오른쪽(시안 pilot .me-act)
  const actions = (
    <div className={s.act}>
      {/* 이름 = 칸 이름 + 버튼 글자(「프로필 사진 사진 업로드」) — 두 파일 칸의 이름이 같지 않게 */}
      <input
        className={`sr-only ${s.file}`}
        id={`${id}-f`}
        ref={fileRef}
        type="file"
        accept={PHOTO_ACCEPT}
        disabled={busy}
        aria-labelledby={`${id}-t ${id}-l`}
        aria-describedby={`${id}-h ${id}-e ${id}-m`}
        aria-invalid={bad ? true : undefined}
        onChange={(e) => void picked(e.currentTarget.files?.[0])}
      />
      <label className={`btn btn--line btn--sm ${s.pick}`} id={`${id}-l`} htmlFor={`${id}-f`} aria-disabled={busy}>
        {busy ? "저장 중…" : hasImage ? "사진 변경" : "사진 업로드"}
      </label>
      {hasImage ? (
        <button className={`btn btn--sm ${s.danger}`} type="button" aria-disabled={busy} onClick={() => void removeNow()}>
          삭제
        </button>
      ) : null}
    </div>
  );
  const name = (
    <span className={s.k} id={`${id}-t`}>
      {title}
    </span>
  );
  const helpLine = (
    <p className={s.sub} id={`${id}-h`}>
      {help}
    </p>
  );
  // 알림 칸은 늘 두고 글자만 바꾼다 — 오류는 alert, 끝남은 status
  const notes = (
    <>
      <p className={`${s.msg} ${s.bad}`} role="alert" id={`${id}-e`}>
        {bad ? msg.text : ""}
      </p>
      <p className={s.msg} role="status" id={`${id}-m`}>
        {msg?.ok ? msg.text : ""}
      </p>
    </>
  );

  return kind === "photo" ? (
    <div className={s.item} data-pf-row={kind}>
      <div className={`${s.row} ${s.photoRow}`}>
        {view}
        <div className={s.txt}>
          {name}
          {helpLine}
        </div>
        {actions}
      </div>
      {notes}
    </div>
  ) : (
    <div className={`${s.item} ${s.colRow}`} data-pf-row={kind}>
      <div className={s.lab}>
        {name}
        {actions}
      </div>
      {view}
      {helpLine}
      {notes}
    </div>
  );
}

export function FanProfileEditPage(p: FanProfileEditProps) {
  const router = useRouter();
  const id = useId();
  const [nickname, setNickname] = useState(p.nickname);
  const [intro, setIntro] = useState(p.intro);
  const [photoPath, setPhotoPath] = useState(p.photoPath);
  const [bgPath, setBgPath] = useState(p.bgPath);
  const [saving, setSaving] = useState(false);
  const [nickErr, setNickErr] = useState<string | null>(null);
  const [introErr, setIntroErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<Msg>(null);
  // 마지막으로 저장된 값 — 바뀐 칸만 보낸다
  const saved = useRef({ nickname: p.nickname, intro: p.intro });

  const toLogin = () => router.push(LOGIN);
  const photoUrl = fanImageUrl(p.photoBase, photoPath);
  const bgUrl = fanImageUrl(p.photoBase, bgPath);
  const initial = Array.from(nickname.trim() || p.nickname)[0] ?? "";

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setNotice(null);
    setNickErr(null);
    setIntroErr(null);

    const plan = planFanProfileSave({ nickname, intro }, saved.current);
    if (plan.kind === "invalid") return plan.field === "nickname" ? setNickErr(plan.message) : setIntroErr(plan.message);
    if (plan.kind === "unchanged") return setNotice({ ok: true, text: "변경된 내용이 없습니다." });

    setSaving(true);
    try {
      const r = await sendFanProfile(plan.body);
      if (r.kind === "login") return toLogin();
      if (r.kind === "failed") {
        if (r.field === "nickname") return setNickErr(r.message);
        if (r.field === "intro") return setIntroErr(r.message);
        return setNotice({ ok: false, text: r.message });
      }
      if (r.intro !== null) {
        saved.current.intro = r.intro;
        setIntro(r.intro);
      }
      if (r.nickname !== null) {
        saved.current.nickname = r.nickname;
        setNickname(r.nickname);
      }
      setNotice({ ok: true, text: "저장되었습니다." });
      router.refresh(); // 사이드바 이름 메뉴의 닉네임도 새 값으로
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.wrap}>
      <header className="page-head">
        <h1 className="ph-title" id={`${id}-h1`}>
          프로필 수정
        </h1>
        <p className="ph-desc">프로필 사진·배경 사진·닉네임·자기소개를 수정합니다.</p>
      </header>

      <section className={s.grp} aria-labelledby={`${id}-g1`} data-pf-group="photo">
        <h2 className={s.nm} id={`${id}-g1`}>
          사진
        </h2>
        <div className={s.rows}>
          <PhotoField
            kind="photo"
            title="프로필 사진"
            view={
              <span className={s.avatar} aria-hidden="true">
                {photoUrl ? <img src={photoUrl} alt="" width={512} height={512} /> : initial}
              </span>
            }
            hasImage={photoPath !== null}
            help={
              <>
                JPG·PNG·WebP · 최대 10MB
                <br />
                사진 미등록 시 닉네임 첫 글자 표시
              </>
            }
            onSaved={setPhotoPath}
            onLogin={toLogin}
          />
          <PhotoField
            kind="background"
            title="배경 사진"
            view={
              <span className={s.banner} aria-hidden="true">
                {bgUrl ? <img src={bgUrl} alt="" width={1280} height={427} /> : <span className={s.bannerEmpty}>등록된 배경 사진 없음</span>}
              </span>
            }
            hasImage={bgPath !== null}
            help="가로형 사진 권장 · 미등록 시 기본 하늘색 배경 표시"
            onSaved={setBgPath}
            onLogin={toLogin}
          />
        </div>
      </section>

      {/* 소개 두 칸은 아래 저장 줄의 폼에 form 속성으로 붙는다 — 묶음(section)끼리 형제로 두어 구분선·간격을 계정 설정과 같게 */}
      <section className={s.grp} aria-labelledby={`${id}-g2`} data-pf-group="intro">
        <h2 className={s.nm} id={`${id}-g2`}>
          소개
        </h2>
        <div className={s.rows}>
          <div className={`${s.item} ${s.colRow}`}>
            <div className={s.lab}>
              <label className={s.k} htmlFor={`${id}-nick`}>
                닉네임
              </label>
              <span className={s.count} aria-hidden="true">
                {charCount(nickname.trim())}/{NICKNAME_MAX}
              </span>
            </div>
            <input
              className="field"
              id={`${id}-nick`}
              form={`${id}-form`}
              type="text"
              value={nickname}
              maxLength={NICKNAME_MAX}
              autoComplete="nickname"
              aria-invalid={nickErr ? true : undefined}
              aria-describedby={nickErr ? `${id}-nick-h ${id}-nick-e` : `${id}-nick-h`}
              onChange={(e) => {
                setNickname(e.currentTarget.value);
                setNickErr(null);
              }}
            />
            {nickErr ? (
              <p className={`${s.sub} ${s.bad}`} id={`${id}-nick-e`} role="alert">
                {nickErr}
              </p>
            ) : null}
            <p className={s.sub} id={`${id}-nick-h`}>
              1~{NICKNAME_MAX}자
            </p>
          </div>

          <div className={`${s.item} ${s.colRow}`}>
            <div className={s.lab}>
              <label className={s.k} htmlFor={`${id}-bio`}>
                자기소개
              </label>
              <span className={s.count} aria-hidden="true">
                {charCount(intro.trim())}/{FAN_INTRO_MAX}
              </span>
            </div>
            <textarea
              className={`field ${s.bio}`}
              id={`${id}-bio`}
              form={`${id}-form`}
              rows={4}
              value={intro}
              aria-invalid={introErr ? true : undefined}
              aria-describedby={introErr ? `${id}-bio-h ${id}-bio-e` : `${id}-bio-h`}
              onChange={(e) => {
                // 한 줄 칸 — 붙여 넣은 줄바꿈은 띄어쓰기로
                setIntro(e.currentTarget.value.replace(/[\r\n\u2028\u2029]+/g, " "));
                setIntroErr(null);
              }}
            />
            {introErr ? (
              <p className={`${s.sub} ${s.bad}`} id={`${id}-bio-e`} role="alert">
                {introErr}
              </p>
            ) : null}
            <p className={s.sub} id={`${id}-bio-h`}>
              최대 {FAN_INTRO_MAX}자
            </p>
          </div>
        </div>
      </section>

      {/* 저장 줄 — 저장하기가 보내는 소개 묶음 바로 아래(사진은 고르는 즉시 저장). 767 이하에서는 화면 아래에 붙는다 */}
      <form className={s.end} id={`${id}-form`} onSubmit={onSubmit} aria-labelledby={`${id}-h1`} noValidate data-pf-save="">
        <p className={`${s.msg} ${notice && !notice.ok ? s.bad : ""}`} role="status">
          {notice?.text}
        </p>
        <div className={s.btns}>
          <Link className="btn btn--line" href="/home">
            취소
          </Link>
          <button className="btn" type="submit" aria-disabled={saving} aria-busy={saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
