"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { CreatorColors } from "@/entities/creator/model/creator-color";
import { resolveTagSelection, type TagOption } from "@/entities/creator/model/creator-tags";
import { creatorBackgroundUrl, creatorPhotoUrl } from "@/entities/creator/model/link-images";
import { CreatorHead } from "@/entities/creator/ui/creator-head";
import { CREATOR_HOME, CREATOR_PROFILE_TABS, creatorProfileTabHref, type CreatorProfileTab } from "@/entities/session/model/home-path";
import { NICKNAME_MAX } from "@/entities/session/model/nickname-rule";
import { deleteCreatorImage, sendCreatorImage } from "@/features/creator-photo/api/send-creator-image";
import { deleteCreatorPhoto, sendCreatorPhoto } from "@/features/creator-photo/api/send-creator-photo";
import { ImageField, type ImageSendResult } from "@/features/creator-photo/ui/image-field";
import { sendCreatorProfile } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars, INTRO_MAX, oneLine } from "@/features/creator-settings-save/model/creator-settings-input";
import { sendCreatorTags } from "@/features/creator-tags-edit/api/send-creator-tags";
import { TagPicker } from "@/features/creator-tags-edit/ui/tag-picker";
import { charCount } from "@/shared/lib/validation/char-count";
import panel from "@/shared/ui/settings-panel.module.css";
import s from "./creator-profile-edit.module.css";

// 크리에이터 프로필 수정 (design-rules 27절 「4파트 나머지」, 시안 docs/design/mockups/site/pilot-2026-10-22/creator-profile.html, 틀 1200).
// 2026-11-13 재분류(UX 명세 creator-profile 「바뀌는 것」, DECISIONS 같은 날) — 세 탭(?tab=profile|channel|account, 주소에 싣는다. 없으면 프로필):
// - 프로필: 닉네임 · 한 줄 소개 · 「저장」 · 미리보기
// - 채널: 배경 사진 · 태그 · 크리에이터 찾기에 보이기(「저장」) · 미리보기, 그 아래 앱 레이어가 넘긴 구역(채널 주소 · 팬덤 · 채널 소유자 확인)
// - 계정: 프로필 사진, 그 아래 앱 레이어가 넘긴 구역(비밀번호 · 휴대폰 번호 · 회원 탈퇴)
// 다른 위젯의 구역은 이 위젯이 import 하지 않고 ReactNode 로 받는다(FSD — 같은 레이어 슬라이스끼리 import 하지 않는다).
// 배치(2026-11-13 본체 지적 「탭 안 모양이 제각각」을 고침): 세 탭이 같은 두 열 — 왼쪽 기둥(--col-form) · 오른쪽 미리보기 열(나머지, 따라옴).
// 왼쪽 기둥의 모든 구역은 공용 settings-panel 판(같은 판 모양 · 제목 h2 하나). 미리보기는 탭마다 하나 — 프로필 탭은 프로필 머리,
// 채널 탭은 앱 레이어가 넘긴 팬덤 카드 미리보기(channelPreview), 계정 탭은 없다(오른쪽 열이 빈다).
// 저장 경로는 그대로다 — 새 저장 규칙은 없다:
// - 사진·배경사진은 고르는 즉시 서버로 보낸다(creator-link INV-E9 — 서버가 열어 보고 사진 정보를 지운 뒤 다시 굽는다).
// - 프로필 탭 「저장」은 닉네임(= 크리에이터 이름, creator-display-name INV-CN2)·한 줄 소개만 /api/creator/profile 에,
//   채널 탭 「저장」은 찾기 노출만 /api/creator/profile 에 보내고 이어서 태그를 /api/creator/tags 에(creator-tags INV-T3).
//   서버는 보낸 칸만 바꾼다(my-account INV-A9) — 두 탭의 「저장」이 서로의 칸을 덮어쓰지 않는다.

export type CreatorProfileEditProps = {
  /** 지금 탭(주소 ?tab=) — 없으면 프로필 */
  tab?: CreatorProfileTab;
  /** 채널 탭 아래에 놓을 구역(채널 주소 · 팬덤 · 채널 소유자 확인) — 앱 레이어가 다른 위젯 구역을 넘긴다 */
  channelSections?: ReactNode;
  /** 채널 탭 오른쪽 열의 미리보기 하나(팬덤 카드 미리보기) */
  channelPreview?: ReactNode;
  /** 계정 탭 아래에 놓을 구역(비밀번호 · 휴대폰 번호 · 회원 탈퇴) */
  accountSections?: ReactNode;
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

const TAB_LABEL: Readonly<Record<CreatorProfileTab, string>> = { profile: "프로필", channel: "채널", account: "계정" };

/** 탭 줄 — 화면 주소를 바꾸는 링크라 「보낸 내역」 탭(site-header SentTabs)과 같은 줄 탭(base.css .tabs--line)·aria-current */
function ProfileTabs({ current }: { current: CreatorProfileTab }) {
  return (
    <nav className="tabs tabs--line" aria-label="프로필 수정">
      {CREATOR_PROFILE_TABS.map((t) => (
        <Link key={t} href={creatorProfileTabHref(t)} aria-current={t === current ? "page" : undefined}>
          {TAB_LABEL[t]}
        </Link>
      ))}
    </nav>
  );
}

export function CreatorProfileEditPage({ tab = "profile", channelSections, channelPreview, accountSections, ...p }: CreatorProfileEditProps) {
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

  const toLogin = () => router.push(`/login?next=${encodeURIComponent(creatorProfileTabHref(tab))}`);
  const photoUrl = creatorPhotoUrl(p.photoBase, photoPath);
  const bgUrl = creatorBackgroundUrl(p.photoBase, bgPath);
  const photoOut = (r: Awaited<ReturnType<typeof sendCreatorPhoto>>): ImageSendResult => (r.kind === "ok" ? { kind: "ok", path: r.photoPath } : r);

  // 서버가 저장한 뒤에만 「저장되었습니다.」. 입력 검사는 서버가 다시 한다 — 화면은 서버가 준 문구를 그대로 보인다.
  // 프로필 탭 — 닉네임·한 줄 소개만 보낸다(찾기 노출·태그는 채널 탭 칸이라 싣지 않는다, INV-A9).
  const saveProfile = async () => {
    if (saving) return;
    setMsg(null);
    setSaving(true);
    const r = await sendCreatorProfile({ nickname: name, intro });
    setSaving(false);
    if (r.kind === "login") return toLogin();
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    setMsg({ ok: true, text: "저장되었습니다." });
    router.refresh(); // 사이드바 이름 메뉴도 새 닉네임으로
  };

  // 채널 탭 — 태그는 화면에서 먼저 1~5개인지 보고, 찾기 노출을 저장한 뒤 이어서 저장한다(서로 다른 DB 함수). 닉네임·소개는 싣지 않는다(INV-A9).
  const saveChannel = async () => {
    if (saving) return;
    setMsg(null);
    const tags = resolveTagSelection(p.tagOptions, tagIds, customTag);
    setTagsBad(!tags.ok);
    if (!tags.ok) return setMsg({ ok: false, text: tags.message });
    setSaving(true);
    const r = await sendCreatorProfile({ searchable: visible });
    const t = r.kind === "ok" ? await sendCreatorTags({ tagIds: tags.tagIds, customTag: tags.customTag }) : r;
    setSaving(false);
    if (r.kind === "login" || t.kind === "login") return toLogin();
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    if (t.kind === "failed") {
      setTagsBad(true);
      setMsg({ ok: false, text: t.message });
      router.refresh(); // 찾기 노출은 저장됐다
      return;
    }
    setMsg({ ok: true, text: "저장되었습니다." });
    router.refresh();
  };

  // 판 끝 — 결과 상자(완료 ✓ · 오류 !)는 비면 높이 0 이라 저장 줄 위 간격이 16(41절). 휴대폰에서는 화면 아래에 붙는다
  const formEnd = (
    <div className={s.end}>
      <p className={`${s.msg} ${msg && !msg.ok ? "err" : "okmsg"}`} role="status" id="pe-msg">
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
  );

  // 프로필 탭 오른쪽 — 판·상자 없이 「미리보기」 제목 아래 프로필 머리 하나, 스크롤하면 따라온다. 1100 이하는 입력 위로, 휴대폰은 작게
  const headPreview = (
    <aside className={s.pv} aria-labelledby="pe-pv">
      <h2 className={s.pvT} id="pe-pv">
        미리보기
      </h2>
      <CreatorHead
        label="프로필 머리 미리보기"
        name={name.trim() || p.name}
        intro={intro.trim()}
        photoUrl={photoUrl}
        backgroundUrl={bgUrl}
        colors={p.colors}
        fanName={p.fanName}
        symbolUrl={p.symbolUrl}
      />
    </aside>
  );

  return (
    <div className={`stack ${s.col}`}>
      <header className="page-head">
        <h1 className="ph-title">프로필 수정</h1>
        {/* 미리보기가 있는 탭(프로필 · 채널)에서만 미리보기 안내 문장을 잇는다 — 계정 탭은 앞 문장만 */}
        <p className="ph-desc">{tab === "account" ? "팬에게 공개되는 프로필입니다." : "팬에게 공개되는 프로필입니다. 변경할 내용을 미리보기에서 확인해 주세요."}</p>
      </header>

      <ProfileTabs current={tab} />

      <div className={s.grid} data-pe-tab={tab}>
        <div className={s.main}>
          {tab === "profile" ? (
            <form
              className={panel.panel}
              aria-labelledby="pe-in"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void saveProfile();
              }}
            >
              <h2 className={panel.title} id="pe-in">
                소개
              </h2>
              <div className={s.sub}>
                <label className={s.subT} htmlFor="pe-name">
                  닉네임
                </label>
                <input
                  className={`field ${s.w360}`}
                  id="pe-name"
                  type="text"
                  value={name}
                  autoComplete="off"
                  // 글자 수는 저장 검사와 같은 셈(코드 포인트)으로 막는다 — maxLength 는 이모지를 두 글자로 센다
                  // 크리에이터 이름은 닉네임이다(creator-display-name INV-CN2) — 저장하면 닉네임이 바뀌고 이름이 따라 바뀐다
                  onChange={(e) => setName(clipChars(e.currentTarget.value, NICKNAME_MAX))}
                  aria-describedby="pe-name-h"
                />
                <p className={s.hint} id="pe-name-h">
                  {`팬에게 표시되는 이름 · 최대 ${NICKNAME_MAX}자`}
                </p>
              </div>
              <div className={`${s.sub} ${s.last}`}>
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
              {formEnd}
            </form>
          ) : null}

          {tab === "channel" ? (
            <>
              {/* 배경 사진 판 — 고르는 즉시 저장 */}
              <section className={panel.panel} aria-labelledby="pe-bg-t">
                <h2 className={panel.title} id="pe-bg-t">
                  배경 사진
                </h2>
                <div className={`${s.sub} ${s.last}`}>
                  <ImageField
                    id="pe-bg"
                    labelledBy="pe-bg-t"
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
              </section>
              {/* 태그 · 크리에이터 찾기에 보이기 판 — 끝에 결과 안내와 [취소][저장] */}
              <form
                className={panel.panel}
                aria-labelledby="pe-tags-t"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveChannel();
                }}
              >
                <h2 className={panel.title} id="pe-tags-t">
                  태그
                </h2>
                <div className={`${s.sub} ${s.tags}`}>
                  <TagPicker
                    idBase="pe-tags"
                    labelledBy="pe-tags-t"
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
                {formEnd}
              </form>
              {channelSections}
            </>
          ) : null}

          {tab === "account" ? (
            <>
              {/* 프로필 사진 판 — 고르는 즉시 저장(creator-link INV-E9) */}
              <section className={panel.panel} aria-labelledby="pe-ph">
                <h2 className={panel.title} id="pe-ph">
                  프로필 사진
                </h2>
                <div className={`${s.sub} ${s.last}`}>
                  <ImageField
                    id="pe-photo"
                    labelledBy="pe-ph"
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
              {accountSections}
            </>
          ) : null}
        </div>

        {/* 오른쪽 열 — 탭마다 미리보기 하나(계정 탭은 없음) */}
        {tab === "profile" ? headPreview : tab === "channel" ? channelPreview : null}
      </div>
    </div>
  );
}
