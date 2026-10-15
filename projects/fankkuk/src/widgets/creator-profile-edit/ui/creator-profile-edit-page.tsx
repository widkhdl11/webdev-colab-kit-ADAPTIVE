"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CreatorColors } from "@/entities/creator/model/creator-color";
import { resolveTagSelection, type TagOption } from "@/entities/creator/model/creator-tags";
import { creatorBackgroundUrl, creatorPhotoUrl, nameInitial } from "@/entities/creator/model/link-images";
import { CreatorHead } from "@/entities/creator/ui/creator-head";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { deleteCreatorImage, sendCreatorImage } from "@/features/creator-photo/api/send-creator-image";
import { deleteCreatorPhoto, sendCreatorPhoto } from "@/features/creator-photo/api/send-creator-photo";
import { ImageField, type ImageSendResult } from "@/features/creator-photo/ui/image-field";
import { sendCreatorProfile } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars, INTRO_MAX, oneLine, PUBLIC_NAME_MAX } from "@/features/creator-settings-save/model/creator-settings-input";
import { sendCreatorTags } from "@/features/creator-tags-edit/api/send-creator-tags";
import { TagPicker } from "@/features/creator-tags-edit/ui/tag-picker";
import { charCount } from "@/shared/lib/validation/char-count";
import s from "./creator-profile-edit.module.css";

// 크리에이터 프로필 수정 (design-rules 12절, 시안 docs/design/mockups/site/v21-addendum3/cre-profile-edit.html, 입력형 720 — 00절 「본문 틀」).
// 위쪽 머리 모양이 곧 미리보기다(배경 띠·사진·공개 이름·팬덤 뱃지·소개). 그 아래 사진 칸 → 이름과 소개.
// 예전에 「내 팬꾹 꾸미기」(사진·배경사진·공개 이름·한 줄 소개)와 「주소와 설정」(태그·찾기 노출)에 흩어져 있던 칸을 이 화면에 모았다.
// 저장 경로는 그대로다 — 새 저장 규칙은 없다:
// - 사진·배경사진은 고르는 즉시 서버로 보낸다(creator-link INV-E9 — 서버가 열어 보고 사진 정보를 지운 뒤 다시 굽는다).
// - 공개 이름·한 줄 소개·찾기 노출은 「저장」으로 /api/creator/profile 에(my-account INV-A9 — 보낸 칸만 바뀐다), 이어서 태그를 /api/creator/tags 에(creator-tags INV-T3).

export type CreatorProfileEditProps = {
  name: string;
  intro: string;
  fanName: string;
  colors: CreatorColors;
  photoPath: string | null;
  bgPath: string | null;
  symbolUrl: string | null;
  visibleInSearch: boolean;
  tagIds: readonly string[];
  customTag: string;
  /** 고를 수 있는 태그 선택지(숨기지 않은 것, 선택지 순서 — creator-tags INV-T3) */
  tagOptions: readonly TagOption[];
  /** 공개 저장소 주소 — 사진 미리보기 주소를 만든다 */
  photoBase: string;
};

const LOGIN = "/login?next=/creator/profile";

export function CreatorProfileEditPage(p: CreatorProfileEditProps) {
  const router = useRouter();
  const [name, setName] = useState(p.name);
  const [intro, setIntro] = useState(p.intro);
  const [photoPath, setPhotoPath] = useState(p.photoPath);
  const [bgPath, setBgPath] = useState(p.bgPath);
  const [visible, setVisible] = useState(p.visibleInSearch);
  const [tagIds, setTagIds] = useState<string[]>([...p.tagIds]);
  const [customTag, setCustomTag] = useState(p.customTag);
  const [tagsBad, setTagsBad] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toLogin = () => router.push(LOGIN);
  const photoUrl = creatorPhotoUrl(p.photoBase, photoPath);
  const bgUrl = creatorBackgroundUrl(p.photoBase, bgPath);
  const photoOut = (r: Awaited<ReturnType<typeof sendCreatorPhoto>>): ImageSendResult => (r.kind === "ok" ? { kind: "ok", path: r.photoPath } : r);

  // 서버가 저장한 뒤에만 「저장했어요」. 입력 검사는 서버가 다시 한다 — 화면은 서버가 준 문구를 그대로 보인다.
  // 태그는 화면에서 먼저 1~5개인지 보고, 프로필을 저장한 뒤 이어서 저장한다(서로 다른 DB 함수).
  const save = async () => {
    if (saving) return;
    setMsg(null);
    const tags = resolveTagSelection(p.tagOptions, tagIds, customTag);
    setTagsBad(!tags.ok);
    if (!tags.ok) return setMsg({ ok: false, text: tags.message });
    setSaving(true);
    const r = await sendCreatorProfile({ name, intro, searchable: visible });
    const t = r.kind === "ok" ? await sendCreatorTags({ tagIds: tags.tagIds, customTag: tags.customTag }) : r;
    setSaving(false);
    if (r.kind === "login" || t.kind === "login") return toLogin();
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    if (t.kind === "failed") {
      setTagsBad(true);
      setMsg({ ok: false, text: t.message });
      router.refresh(); // 공개 이름은 저장됐다 — 사이드바 이름도 새로
      return;
    }
    setMsg({ ok: true, text: "저장했어요." });
    router.refresh(); // 사이드바 이름 메뉴도 새 공개 이름으로
  };

  return (
    <div className={`stack ${s.col}`}>
      <header className="page-head">
        <h1 className="ph-title">프로필 수정</h1>
        <p className="ph-desc">팬에게 보이는 내 프로필이에요. 위 모양이 그대로 보여요.</p>
      </header>

      <CreatorHead
        label="미리보기"
        name={name.trim() || p.name}
        intro={intro.trim()}
        photoUrl={photoUrl}
        initial={nameInitial(name.trim() || p.name) || "?"}
        backgroundUrl={bgUrl}
        colors={p.colors}
        fanName={p.fanName}
        symbolUrl={p.symbolUrl}
      />

      <section className={s.card} aria-labelledby="pe-ph">
        <h2 className={s.secT} id="pe-ph">
          사진
        </h2>
        <ImageField
          id="pe-bg"
          label="배경 사진"
          hasImage={bgPath !== null}
          pickLabel="배경 사진 바꾸기"
          removeLabel="배경을 퍼스널 컬러 띠로 되돌리기"
          hint="배경 사진은 가로로 긴 사진이 잘 어울려요(JPG·PNG·WebP). 올리면 위치 정보 같은 숨은 정보는 지워져요. 사진이 없으면 퍼스널 컬러 띠가 보여요."
          upload={(f) => sendCreatorImage("background", f, { rightsChecked: false })}
          remove={() => deleteCreatorImage("background")}
          onSaved={setBgPath}
          onLogin={toLogin}
          savedText="배경 사진을 바꿨어요."
          removedText="배경을 퍼스널 컬러 띠로 되돌렸어요."
        />
        <ImageField
          id="pe-photo"
          label="프로필 사진"
          hasImage={photoPath !== null}
          pickLabel="프로필 사진 바꾸기"
          removeLabel="사진 지우기"
          hint="가운데를 정사각으로 잘라 저장하고 촬영 위치 같은 사진 정보는 지워요(10MB 까지). 지우면 이름 첫 글자가 대신 보여요."
          upload={async (f) => photoOut(await sendCreatorPhoto(f))}
          remove={async () => photoOut(await deleteCreatorPhoto())}
          onSaved={setPhotoPath}
          onLogin={toLogin}
          savedText="프로필 사진을 바꿨어요."
          removedText="프로필 사진을 지웠어요."
        />
      </section>

      <form
        className={s.card}
        aria-label="이름과 소개"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className={s.fld}>
          <label className="label" htmlFor="pe-name">
            공개 이름
          </label>
          <input
            className="field"
            id="pe-name"
            type="text"
            value={name}
            autoComplete="off"
            // 글자 수는 저장 검사와 같은 셈(코드 포인트)으로 막는다 — maxLength 는 이모지를 두 글자로 센다
            onChange={(e) => setName(clipChars(e.currentTarget.value, PUBLIC_NAME_MAX))}
            aria-describedby="pe-name-h"
          />
          <p className={s.hint} id="pe-name-h">
            팬에게 보이는 이름이에요.
          </p>
        </div>
        <div className={s.fld}>
          <label className="label" htmlFor="pe-bio">
            한 줄 소개 <span className={s.optn}>({INTRO_MAX}자까지)</span>
          </label>
          <textarea
            className={`field ${s.bio}`}
            id="pe-bio"
            rows={2}
            value={intro}
            aria-describedby="pe-bio-c"
            // 한 줄 — 붙여 넣은 줄바꿈은 띄어쓰기로 바꾼다(creator-link INV-E6)
            onChange={(e) => setIntro(clipChars(oneLine(e.currentTarget.value), INTRO_MAX))}
          />
          <div className={s.count} id="pe-bio-c" aria-live="polite">
            {charCount(intro.trim())}/{INTRO_MAX}
          </div>
        </div>
        <TagPicker
          idBase="pe-tags"
          options={p.tagOptions}
          picked={tagIds}
          custom={customTag}
          onPickedChange={(next) => {
            setTagIds(next);
            setTagsBad(false);
          }}
          onCustomChange={(next) => {
            setCustomTag(next);
            setTagsBad(false);
          }}
          invalid={tagsBad ? { describedBy: "pe-msg" } : null}
        />
        <div className="sw-row">
          <label className={s.txt} htmlFor="pe-find">
            <strong className="t-strong">크리에이터 찾기에 보이기</strong>
            <span className="t-meta">끄면 크리에이터 찾기 목록에서만 빠져요. 내 페이지 링크·팔로우·선물 받기는 그대로예요. 본인 확인을 마쳐야 찾기에 보여요.</span>
          </label>
          <input className={s.switch} type="checkbox" role="switch" id="pe-find" checked={visible} onChange={(e) => setVisible(e.currentTarget.checked)} />
        </div>
        <p className={`${s.msg} ${msg && !msg.ok ? "err" : "t-meta"}`} role="status" id="pe-msg">
          {msg?.text}
        </p>
        <div className={s.btnEnd}>
          <Link className="btn btn--line" href={CREATOR_HOME}>
            취소
          </Link>
          <button className="btn" type="submit" aria-disabled={saving} aria-busy={saving}>
            {saving ? "저장하는 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
