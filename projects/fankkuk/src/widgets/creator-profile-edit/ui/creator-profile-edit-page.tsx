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

// 크리에이터 프로필 수정 (design-rules 27절 「4파트 나머지」, 시안 docs/design/mockups/site/pilot-2026-10-22/creator-profile.html, 틀 1200).
// 상세 설정 「팬덤」과 같은 입력 + 미리보기: 왼쪽 「사진」 판 → 「소개」 판, 오른쪽 프로필 머리 미리보기(배경 띠·사진·공개 이름·팬덤 뱃지·소개 — 입력하는 대로 바뀐다).
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
    setMsg({ ok: true, text: "저장되었습니다." });
    router.refresh(); // 사이드바 이름 메뉴도 새 공개 이름으로
  };

  return (
    <div className={`stack ${s.col}`}>
      <header className="page-head">
        <h1 className="ph-title">프로필 수정</h1>
        <p className="ph-desc">팬에게 공개되는 프로필입니다. 변경할 내용을 미리보기에서 확인해 주세요.</p>
      </header>

      <div className={s.grid}>
        {/* 왼쪽 — 「사진」 판(고르는 즉시 저장) → 「소개」 판(끝에 결과 안내와 [취소][저장]) */}
        <div className={s.main}>
          <section className={s.form} aria-labelledby="pe-ph">
            <div className={s.sub}>
              <h2 className={s.secT} id="pe-ph">
                사진
              </h2>
              <ImageField
                id="pe-bg"
                label="배경 사진"
                hasImage={bgPath !== null}
                pickLabel="배경 사진 변경"
                removeLabel="배경 사진 삭제"
                hint={
                  <>
                    JPG·PNG·WebP · 가로형 사진 권장
                    <br />
                    업로드 시 위치 정보 등 사진에 포함된 부가 정보는 삭제됩니다. 사진 미등록 시 테마 색이 표시됩니다.
                  </>
                }
                sizeHint="권장 크기 1200×600px"
                upload={(f) => sendCreatorImage("background", f, { rightsChecked: false })}
                remove={() => deleteCreatorImage("background")}
                onSaved={setBgPath}
                onLogin={toLogin}
                savedText="배경 사진이 변경되었습니다."
                removedText="배경에 테마 색이 적용되었습니다."
              />
            </div>
            <div className={`${s.sub} ${s.last}`}>
              <ImageField
                id="pe-photo"
                label="프로필 사진"
                hasImage={photoPath !== null}
                pickLabel="프로필 사진 변경"
                removeLabel="사진 삭제"
                upload={async (f) => photoOut(await sendCreatorPhoto(f))}
                remove={async () => photoOut(await deleteCreatorPhoto())}
                onSaved={setPhotoPath}
                onLogin={toLogin}
                savedText="프로필 사진이 변경되었습니다."
                removedText="프로필 사진이 삭제되었습니다."
              />
            </div>
          </section>

          <form
            className={s.form}
            aria-labelledby="pe-in"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className={s.sub}>
              <h2 className={s.secT} id="pe-in">
                소개
              </h2>
              <label className={s.subT} htmlFor="pe-name">
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
                팬에게 표시되는 이름
              </p>
            </div>
            <div className={s.sub}>
              <div className={s.subT}>
                <label htmlFor="pe-bio">
                  한 줄 소개 <span className={s.count}>({INTRO_MAX}자까지)</span>
                </label>
                <span className={s.count} id="pe-bio-c" aria-live="polite">
                  {charCount(intro.trim())}/{INTRO_MAX}
                </span>
              </div>
              <textarea
                className={`field ${s.bio}`}
                id="pe-bio"
                rows={2}
                value={intro}
                aria-describedby="pe-bio-c"
                // 한 줄 — 붙여 넣은 줄바꿈은 띄어쓰기로 바꾼다(creator-link INV-E6)
                onChange={(e) => setIntro(clipChars(oneLine(e.currentTarget.value), INTRO_MAX))}
              />
            </div>
            <div className={s.sub}>
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
            </div>
            <div className={`${s.sub} ${s.last}`}>
              {/* 줄 전체가 누르는 칸(라벨이 스위치를 감싼다) — 스위치만 누르던 26 을 44 넘게 */}
              <label className={s.swRow} htmlFor="pe-find">
                <strong className="t-strong">크리에이터 찾기에 보이기</strong>
                <input className={s.switch} type="checkbox" role="switch" id="pe-find" checked={visible} onChange={(e) => setVisible(e.currentTarget.checked)} />
              </label>
            </div>
            {/* 판 끝 — 결과 안내 자리는 비어 있어도 한 줄을 남긴다. 휴대폰에서는 화면 아래에 붙는다 */}
            <div className={s.end}>
              <p className={`${s.msg} ${msg && !msg.ok ? "err" : "t-meta"}`} role="status" id="pe-msg">
                {msg?.text}
              </p>
              <div className={s.btns}>
                <Link className="btn btn--line" href={CREATOR_HOME}>
                  취소
                </Link>
                <button className="btn" type="submit" aria-disabled={saving} aria-busy={saving}>
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* 오른쪽 — 판·상자 없이 「미리보기」 제목 아래 프로필 머리 하나, 스크롤하면 따라온다. 1100 이하는 입력 위로, 휴대폰은 작게 */}
        <aside className={s.pv} aria-labelledby="pe-pv">
          <h2 className={s.pvT} id="pe-pv">
            미리보기
          </h2>
          <CreatorHead
            label="프로필 머리 미리보기"
            name={name.trim() || p.name}
            intro={intro.trim()}
            photoUrl={photoUrl}
            initial={nameInitial(name.trim() || p.name) || "?"}
            backgroundUrl={bgUrl}
            colors={p.colors}
            fanName={p.fanName}
            symbolUrl={p.symbolUrl}
          />
        </aside>
      </div>
    </div>
  );
}
