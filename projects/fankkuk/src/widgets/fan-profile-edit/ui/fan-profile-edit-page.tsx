"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { fanImageUrl, type FanImageKind } from "@/entities/fan/model/fan-profile";
import { NICKNAME_MAX } from "@/entities/session/model/nickname-rule";
import { postAccount } from "@/features/account-edit/api/save-account-client";
import { accountInputSchema } from "@/features/account-edit/model/account-input";
import { deleteFanImage, sendFanImage, sendFanIntro } from "@/features/fan-profile-edit/api/send-fan-profile";
import { FAN_INTRO_MAX, introInputSchema } from "@/features/fan-profile-edit/model/intro-input";
import { PHOTO_ACCEPT } from "@/shared/lib/image/photo-limits";
import { photoPickProblem } from "@/shared/lib/image/photo-pick";
import { charCount } from "@/shared/lib/validation/char-count";
import s from "./fan-profile-edit.module.css";

// 팬 프로필 수정 (design-rules 12절, 시안 docs/design/mockups/site/v21-addendum3/fan-profile-edit.html, 입력형 720 — 00절 「본문 틀」).
// 스펙 my-account INV-A12~A14:
// - 사진·배경 사진은 고르는 즉시 서버로 보낸다(/api/me/profile/image/…). 서버가 열어 보고 사진 정보를 지운 뒤 다시 그린다 — 화면은 보내기만 한다.
// - 자기소개·닉네임은 「저장하기」로 보낸다. 소개는 /api/me/profile, 닉네임은 지금의 내 정보 저장(/api/me — 닉네임 규칙을 새로 만들지 않는다, INV-A12).
//   내 정보 저장은 이메일·알림도 같이 받으므로 지금 값 그대로 실어 보낸다(바뀌지 않는다). 바뀐 칸만 보낸다.
// 시안의 자물쇠 안내 줄(「나와 승인 요청을 받은 크리에이터에게만」)은 카드 d91 로 맞지 않게 되어 옮기지 않는다 — 공개 범위 설명 문구는 두지 않는다(2026-10-15 사용자).
// 시안의 「사용할 수 있는 닉네임이에요」 미리 확인은 로그인한 사람용 확인 경로가 없어 두지 않는다 — 겹치면 저장할 때 칸 아래에 알린다.

export type FanProfileEditProps = {
  nickname: string;
  intro: string;
  photoPath: string | null;
  bgPath: string | null;
  /** 공개 저장소 주소 — 사진 미리보기 주소를 만든다 */
  photoBase: string;
  /** 닉네임을 내 정보 저장 경로로 보낼 때 그대로 실어 보낼 지금 값 */
  account: { email: string | null; notifyKakao: boolean; notifyEmail: boolean };
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
  help: string;
  onSaved: (path: string | null) => void;
  onLogin: () => void;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const finish = (r: Awaited<ReturnType<typeof sendFanImage>>, okText: string) => {
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
      if (fileRef.current) fileRef.current.value = "";
      return setMsg({ ok: false, text: problem });
    }
    setBusy(true);
    setMsg(null);
    finish(await sendFanImage(kind, file), `${title}을 바꿨어요.`);
  };

  const removeNow = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    finish(await deleteFanImage(kind), `${title}을 지웠어요.`);
  };

  return (
    <section className={s.sec} aria-labelledby={`${id}-t`}>
      <h2 className="label" id={`${id}-t`}>
        {title}
      </h2>
      <div className={kind === "photo" ? s.photo : s.photoWide}>
        {view}
        <div>
          <div className={s.btns}>
            <input
              className="sr-only"
              id={`${id}-f`}
              ref={fileRef}
              type="file"
              accept={PHOTO_ACCEPT}
              disabled={busy}
              aria-describedby={`${id}-h ${id}-m`}
              onChange={(e) => void picked(e.currentTarget.files?.[0])}
            />
            <label className={`btn btn--line btn--sm ${s.pick}`} htmlFor={`${id}-f`} aria-disabled={busy}>
              {busy ? "저장하는 중…" : "사진 바꾸기"}
            </label>
            {hasImage ? (
              <button className={`btn btn--sm ${s.danger}`} type="button" aria-disabled={busy} onClick={() => void removeNow()}>
                지우기
              </button>
            ) : null}
          </div>
          <p className={s.help} id={`${id}-h`}>
            {help}
          </p>
          <p className={`${s.msg} ${msg && !msg.ok ? s.bad : ""}`} role="status" id={`${id}-m`}>
            {msg?.text}
          </p>
        </div>
      </div>
    </section>
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

    const introParsed = introInputSchema.safeParse({ intro });
    if (!introParsed.success) return setIntroErr(introParsed.error.issues[0]?.message ?? "자기소개를 확인해 주세요.");
    const nickChanged = nickname.trim() !== saved.current.nickname;
    const email = p.account.email;
    const account = nickChanged
      ? accountInputSchema.safeParse({ nickname, email: email ?? "", notifyKakao: p.account.notifyKakao, notifyEmail: p.account.notifyEmail })
      : null;
    if (account && !account.success) {
      const issue = account.error.issues[0];
      if (issue?.path[0] === "nickname") return setNickErr(issue.message);
      return setNotice({ ok: false, text: "계정 설정에서 이메일을 먼저 확인해 주세요." });
    }
    const introChanged = introParsed.data.intro !== saved.current.intro;
    if (!introChanged && !account) return setNotice({ ok: true, text: "바뀐 내용이 없어요." });

    setSaving(true);
    try {
      if (introChanged) {
        const r = await sendFanIntro(introParsed.data.intro);
        if (r.kind === "login") return toLogin();
        if (r.kind === "failed") return setIntroErr(r.message);
        saved.current.intro = r.intro;
        setIntro(r.intro);
      }
      if (account?.success) {
        const r = await postAccount(account.data);
        if (r.kind === "login") return toLogin();
        if (r.kind === "failed") {
          if (r.field === "nickname") return setNickErr(r.message);
          return setNotice({ ok: false, text: r.message });
        }
        saved.current.nickname = account.data.nickname;
        setNickname(account.data.nickname);
      }
      setNotice({ ok: true, text: "저장했어요." });
      router.refresh(); // 사이드바 이름 메뉴의 닉네임도 새 값으로
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.col}>
      <header className="page-head">
        <h1 className="ph-title">프로필 수정</h1>
        <p className="ph-desc">사진과 소개를 바꾸고 닉네임도 여기서 고쳐요.</p>
      </header>

      <PhotoField
        kind="photo"
        title="프로필 사진"
        view={
          <span className={s.avatar} aria-hidden="true">
            {photoUrl ? <img src={photoUrl} alt="" width={512} height={512} /> : initial}
          </span>
        }
        hasImage={photoPath !== null}
        help="사진이 없으면 닉네임 첫 글자가 보여요. JPG·PNG·WebP, 10MB까지."
        onSaved={setPhotoPath}
        onLogin={toLogin}
      />
      <PhotoField
        kind="background"
        title="배경 사진"
        view={
          <span className={s.banner} aria-hidden="true">
            {bgUrl ? <img src={bgUrl} alt="" width={1280} height={427} /> : <span className={s.bannerEmpty}>배경 사진이 없어요</span>}
          </span>
        }
        hasImage={bgPath !== null}
        help="가로로 긴 사진이 잘 어울려요. 없으면 기본 하늘색 띠가 나와요."
        onSaved={setBgPath}
        onLogin={toLogin}
      />

      <form className={s.form} onSubmit={onSubmit} noValidate>
        <section className={s.sec}>
          <div className={s.fHead}>
            <label className="label" htmlFor={`${id}-nick`}>
              닉네임
            </label>
            <span className={s.count} aria-hidden="true">
              {charCount(nickname.trim())}/{NICKNAME_MAX}
            </span>
          </div>
          <input
            className="field"
            id={`${id}-nick`}
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
            <p className={`${s.help} ${s.bad}`} id={`${id}-nick-e`} role="alert">
              {nickErr}
            </p>
          ) : null}
          <p className={s.help} id={`${id}-nick-h`}>
            1~{NICKNAME_MAX}자. 팔로우하면 크리에이터가 이 닉네임을 볼 수 있어요.
          </p>
        </section>

        <section className={s.sec}>
          <div className={s.fHead}>
            <label className="label" htmlFor={`${id}-bio`}>
              자기소개
            </label>
            <span className={s.count} aria-hidden="true">
              {charCount(intro.trim())}/{FAN_INTRO_MAX}
            </span>
          </div>
          <textarea
            className={`field ${s.bio}`}
            id={`${id}-bio`}
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
            <p className={`${s.help} ${s.bad}`} id={`${id}-bio-e`} role="alert">
              {introErr}
            </p>
          ) : null}
          <p className={s.help} id={`${id}-bio-h`}>
            짧게 나를 소개해 주세요. {FAN_INTRO_MAX}자까지 쓸 수 있어요.
          </p>
        </section>

        <p className={`${s.msg} ${notice && !notice.ok ? s.bad : ""}`} role="status">
          {notice?.text}
        </p>
        <div className={s.actions}>
          <button className="btn" type="submit" aria-disabled={saving} aria-busy={saving}>
            {saving ? "저장하는 중…" : "저장하기"}
          </button>
          <Link className="btn btn--line" href="/home">
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
