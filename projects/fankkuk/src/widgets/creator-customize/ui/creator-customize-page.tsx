"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { canDownloadNotice, linkText } from "@/entities/creator/model/creator-handle";
import { thanksLine } from "@/entities/creator/model/fan-name";
import {
  creatorBackgroundUrl,
  creatorPhotoUrl,
  creatorSymbolUrl,
  nameInitial,
  previewPickOf,
  type PreviewPick,
  type PublicCreatorLook,
} from "@/entities/creator/model/link-images";
import { deleteCreatorImage, sendCreatorImage } from "@/features/creator-photo/api/send-creator-image";
import { deleteCreatorPhoto, sendCreatorPhoto } from "@/features/creator-photo/api/send-creator-photo";
import { sendCreatorProfile, sendPreviewPick } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars, FAN_NAME_MAX, INTRO_MAX, oneLine, PUBLIC_NAME_MAX } from "@/features/creator-settings-save/model/creator-settings-input";
import { charCount } from "@/shared/lib/validation/char-count";
import { CustomizePreview } from "./customize-preview";
import { ImageField, type ImageSendResult } from "./image-field";
import { NoticeSizes } from "./notice-sizes";
import s from "./creator-customize.module.css";

// 내 팬꾹 꾸미기 (디자인 기준 10절, 시안 docs/design/mockups/addendum/customize/customize-b.html · 스펙 creator-link INV-E1·E6·E9·E10·E12).
// 편집 칸(프로필 · 팬덤 · 링크 미리보기 이미지 · 공지 이미지 받기) + 내 링크 페이지 바로 미리보기. 본문 영역 폭이 1080 보다 좁으면 미리보기가 위에 붙어 따라온다(화면 폭이 아니라 본문 영역 기준).
// - 사진 셋(프로필 사진·배경사진·심볼)은 고르는 즉시 서버로 보낸다. 서버가 열어 보고 사진 정보를 지운 뒤 다시 굽는다 — 화면은 보내기만 한다.
// - 심볼은 권리 확인 체크를 해야 고를 수 있다. 체크는 요청에도 실려 서버가 다시 본다(INV-E12). 신고 버튼은 두지 않는다(권리 문제는 1:1 문의).
// - 공개 이름·한 줄 소개·팬을 부르는 이름은 「저장」으로 보낸다(프로필·팬덤 카드 어느 쪽 버튼이든 세 칸을 같이). 이 화면이 고치는 세 칸만 보낸다 —
//   찾기 노출은 「주소와 설정」의 칸이라 보내지 않는다(DB 가 지금 값 그대로 둔다. 처음 읽은 값을 보내면 그사이 바꾼 값을 덮어쓴다).
// - 미리보기 이미지 고르기는 누르는 즉시 저장한다. 저장하는 동안에는 다시 고를 수 없다(응답 순서가 뒤바뀌어 엉뚱한 값으로 되돌리지 않게).
//   심볼이 없으면 고를 수 없다(DB 도 거부한다). 심볼을 지운 뒤의 고르기는 서버가 돌려준 값을 쓴다.
// - 테마 색·무늬·글꼴 고르기는 없다(디자인 기준 10절).

export type CreatorCustomizeProps = {
  creatorId: string;
  verified: boolean;
  handle: string | null;
  name: string;
  intro: string;
  fanName: string;
  photoPath: string | null;
  look: PublicCreatorLook;
  /** 공개 저장소 주소 — 사진 미리보기 주소를 만든다 */
  photoBase: string;
  /** 사이트 주소 — 공지 이미지 링크 복사에 붙인다 */
  siteOrigin: string;
};

const LOGIN = "/login?next=/creator/customize";

/** 글자 칸 저장 버튼 자리 — 프로필 카드(공개 이름·소개)와 팬덤 카드(팬을 부르는 이름). 둘 다 세 칸을 같이 저장하고, 결과는 누른 자리에 보인다. */
type SaveAt = "prof" | "fan";

export function CreatorCustomizePage(p: CreatorCustomizeProps) {
  const router = useRouter();
  const [name, setName] = useState(p.name);
  const [intro, setIntro] = useState(p.intro);
  const [fanName, setFanName] = useState(p.fanName);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string; at: SaveAt } | null>(null);
  const [photoPath, setPhotoPath] = useState(p.photoPath);
  const [bgPath, setBgPath] = useState(p.look.bgPath);
  const [symbolPath, setSymbolPath] = useState(p.look.symbolPath);
  const [pick, setPick] = useState<PreviewPick>(p.look.previewPick);
  const [pickMsg, setPickMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickSaving, setPickSaving] = useState(false);
  // 같은 틀 안에서 두 번 눌러도 막히게 — 상태는 다음 그리기 전까지 옛 값이다
  const pickBusy = useRef(false);
  const [rights, setRights] = useState(false);

  const toLogin = () => router.push(LOGIN);
  const look: PublicCreatorLook = { bgPath, symbolPath, previewPick: pick };
  const shownPick = previewPickOf(look);
  const photoUrl = creatorPhotoUrl(p.photoBase, photoPath);
  const bgUrl = creatorBackgroundUrl(p.photoBase, bgPath);
  const symbolUrl = creatorSymbolUrl(p.photoBase, symbolPath);
  const initial = nameInitial(name) || "?";

  const saveText = async (at: SaveAt) => {
    if (saving) return;
    setSaving(true);
    setSaveMsg(null);
    const r = await sendCreatorProfile({ name, intro, fanName });
    setSaving(false);
    if (r.kind === "login") return toLogin();
    if (r.kind === "failed") return setSaveMsg({ ok: false, text: r.message, at });
    setSaveMsg({ ok: true, text: "저장했어요. 링크 페이지에 바로 보여요.", at });
    router.refresh(); // 머리 메뉴의 이름도 새 공개 이름으로
  };

  const choosePick = async (next: PreviewPick) => {
    if (pickBusy.current) return;
    pickBusy.current = true;
    setPickSaving(true);
    const before = pick;
    setPick(next);
    setPickMsg(null);
    const r = await sendPreviewPick({ pick: next });
    pickBusy.current = false;
    setPickSaving(false);
    if (r.kind === "login") return toLogin();
    if (r.kind === "failed") {
      setPick(before);
      return setPickMsg({ ok: false, text: r.message });
    }
    setPickMsg({ ok: true, text: next === "symbol" ? "링크 미리보기에 팬덤 심볼을 써요." : "링크 미리보기에 프로필 사진을 써요." });
  };

  const saveRow = (at: SaveAt) => {
    const msg = saveMsg?.at === at ? saveMsg : null;
    return (
      <div className={s.saveRow}>
        <button className="btn" type="button" aria-disabled={saving} aria-describedby={`cz-save-${at}`} onClick={() => void saveText(at)}>
          {saving ? "저장하는 중…" : "저장"}
        </button>
        <p className={`${s.msg} ${msg && !msg.ok ? "err" : "t-meta"}`} role="status" id={`cz-save-${at}`}>
          {msg?.text}
        </p>
      </div>
    );
  };

  const photoOut = (r: Awaited<ReturnType<typeof sendCreatorPhoto>>): ImageSendResult => (r.kind === "ok" ? { kind: "ok", path: r.photoPath } : r);

  return (
    <div className={s.root}>
      <header className="page-head">
        <h1 className="ph-title">내 팬꾹 꾸미기</h1>
        <p className="ph-desc">팬이 보게 될 내 선물 링크 페이지를 직접 다듬어요. 바꾸는 즉시 미리보기에서 확인할 수 있어요.</p>
      </header>

      <div className={s.cz}>
        <div className={s.edit}>
          <section className={`card ${s.set}`} aria-labelledby="h-prof">
            <h2 className="t-card" id="h-prof">
              프로필
            </h2>
            <ImageField
              id="cz-photo"
              label="프로필 사진"
              view={<span className={s.avatar}>{photoUrl ? <img src={photoUrl} alt="" width={512} height={512} /> : initial}</span>}
              hasImage={photoPath !== null}
              pickLabel="사진 바꾸기"
              removeLabel="사진 지우기"
              hint="jpg·png·webp, 10MB 까지. 가운데를 정사각으로 잘라 저장하고 촬영 위치 같은 사진 정보는 지워요. 지우면 이름 첫 글자가 대신 보여요."
              upload={async (f) => photoOut(await sendCreatorPhoto(f))}
              remove={async () => photoOut(await deleteCreatorPhoto())}
              onSaved={setPhotoPath}
              onLogin={toLogin}
              savedText="프로필 사진을 바꿨어요. 사진 정보(촬영 위치 등)는 지우고 저장했어요."
              removedText="프로필 사진을 지웠어요."
            />
            <ImageField
              id="cz-bg"
              label="프로필 배경사진"
              optional
              view={<span className={`${s.bgBox} ${bgUrl ? s.has : ""}`}>{bgUrl ? <img src={bgUrl} alt="" width={1280} height={427} /> : "배경사진 없음"}</span>}
              hasImage={bgPath !== null}
              pickLabel="배경사진 올리기"
              removeLabel="지우기"
              hint="링크 페이지 맨 위와 공지 이미지 위쪽에 들어가요. 가로로 긴 사진이 잘 맞아요. 없으면 옅은 코랄 바탕이에요. 사진 정보는 지우고 저장해요."
              upload={(f) => sendCreatorImage("background", f, { rightsChecked: false })}
              remove={() => deleteCreatorImage("background")}
              onSaved={setBgPath}
              onLogin={toLogin}
              savedText="배경사진을 바꿨어요. 사진 정보(촬영 위치 등)는 지우고 저장했어요."
              removedText="배경사진을 지웠어요."
            />
            <div className={s.fld}>
              <label className={s.lbl} htmlFor="cz-name">
                공개 이름
              </label>
              <input
                className="field"
                id="cz-name"
                value={name}
                autoComplete="off"
                // 글자 수는 저장 검사와 같은 셈(코드 포인트)으로 막는다 — maxLength 는 이모지를 두 글자로 센다
                onChange={(e) => setName(clipChars(e.target.value, PUBLIC_NAME_MAX))}
                aria-describedby="cz-name-hint"
              />
              <p className="t-meta" id="cz-name-hint">
                팬에게 보이는 이름이에요. {PUBLIC_NAME_MAX}자까지, 언제든 바꿀 수 있어요. 바꾼 기록은 운영팀이 볼 수 있어요.
              </p>
            </div>
            <div className={s.fld}>
              <div className={s.fldRow}>
                <label className={s.lbl} htmlFor="cz-intro">
                  한 줄 소개
                </label>
                <span className={s.count} aria-hidden="true">
                  {charCount(intro.trim())} / {INTRO_MAX}
                </span>
              </div>
              <input
                className="field"
                id="cz-intro"
                value={intro}
                autoComplete="off"
                // 한 줄 — 붙여 넣은 줄바꿈은 띄어쓰기로 바꾼다(creator-link INV-E6)
                onChange={(e) => setIntro(clipChars(oneLine(e.target.value), INTRO_MAX))}
                aria-describedby="cz-intro-hint"
              />
              <p className="t-meta" id="cz-intro-hint">
                {INTRO_MAX}자까지({charCount(intro.trim())}/{INTRO_MAX}). 전화번호·이메일·인터넷 주소는 쓸 수 없어요.
              </p>
            </div>
            {saveRow("prof")}
          </section>

          <section className={`card ${s.set}`} aria-labelledby="h-fan">
            <h2 className="t-card" id="h-fan">
              팬덤
            </h2>
            <p className="t-meta">팬을 부르는 이름과 캐릭터 이미지를 넣을 수 있어요. 둘 다 비워 둬도 괜찮아요.</p>
            <div className={s.fld}>
              <div className={s.fldRow}>
                <label className={s.lbl} htmlFor="cz-fan">
                  팬을 부르는 이름<span className={s.optn}>선택</span>
                </label>
                <span className={s.count} aria-hidden="true">
                  {charCount(fanName.trim())} / {FAN_NAME_MAX}
                </span>
              </div>
              <input
                className="field"
                id="cz-fan"
                value={fanName}
                placeholder="예: 달빛지기"
                autoComplete="off"
                onChange={(e) => setFanName(clipChars(oneLine(e.target.value), FAN_NAME_MAX))}
                aria-describedby="cz-fan-hint"
              />
              <p className="t-meta" id="cz-fan-hint">
                넣으면 링크 페이지 감사 문장이 「{thanksLine(fanName.trim() || "달빛지기")}」로 바뀌어요({charCount(fanName.trim())}/{FAN_NAME_MAX}). 비우면
                「{thanksLine(null)}」가 그대로 나와요.
              </p>
            </div>
            {saveRow("fan")}
            <ImageField
              id="cz-sym"
              label="팬덤 심볼"
              optional
              view={<span className={`${s.symBox} ${symbolUrl ? s.has : ""}`}>{symbolUrl ? <img src={symbolUrl} alt="" width={512} height={512} /> : "이미지 없음"}</span>}
              hasImage={symbolPath !== null}
              pickLabel="캐릭터 이미지 올리기"
              removeLabel="지우기"
              hint="아래 칸에 체크하면 올릴 수 있어요. 정사각 이미지(PNG·JPG)를 권해요. 가운데를 정사각으로 잘라 저장해요."
              blocked={rights ? null : "cz-sym-right"}
              upload={(f) => sendCreatorImage("symbol", f, { rightsChecked: rights })}
              remove={() => deleteCreatorImage("symbol")}
              onSaved={(path, pickNow) => {
                setSymbolPath(path);
                if (pickNow) setPick(pickNow); // 심볼을 지우면 DB 가 고르기를 프로필 사진으로 되돌린다 — 그 값을 서버 응답으로 받는다
              }}
              onLogin={toLogin}
              savedText="팬덤 심볼을 올렸어요."
              removedText="팬덤 심볼을 지웠어요."
            />
            <label className={s.chk} htmlFor="cz-rights">
              <input type="checkbox" id="cz-rights" checked={rights} onChange={(e) => setRights(e.currentTarget.checked)} />
              <span id="cz-sym-right">내가 만들었거나 쓸 권리가 있는 이미지예요</span>
            </label>
          </section>

          <section className={`card ${s.set}`} aria-labelledby="h-og">
            <h2 className="t-card" id="h-og">
              링크 미리보기 이미지
            </h2>
            <p className="t-meta">메신저나 SNS에 내 링크를 붙여 넣으면 보이는 그림이에요.</p>
            <div className={s.picks} role="radiogroup" aria-labelledby="h-og" aria-describedby="cz-pick-msg" aria-busy={pickSaving}>
              <label className={s.pickOpt}>
                <input type="radio" name="cz-og" value="photo" checked={shownPick === "photo"} onChange={() => void choosePick("photo")} />
                <span>프로필 사진</span>
              </label>
              <label className={s.pickOpt}>
                <input
                  type="radio"
                  name="cz-og"
                  value="symbol"
                  checked={shownPick === "symbol"}
                  disabled={symbolPath === null}
                  aria-describedby={symbolPath === null ? "cz-pick-hint" : undefined}
                  onChange={() => void choosePick("symbol")}
                />
                <span>
                  팬덤 심볼
                  {symbolPath === null ? (
                    <small className={s.pickHint} id="cz-pick-hint">
                      심볼을 올리면 고를 수 있어요
                    </small>
                  ) : null}
                </span>
              </label>
            </div>
            <p className={`${s.msg} ${pickMsg && !pickMsg.ok ? "err" : "t-meta"}`} role="status" id="cz-pick-msg">
              {pickMsg?.text}
            </p>
          </section>

          <section className={`card ${s.set}`} aria-labelledby="h-notice">
            <h2 className="t-card" id="h-notice">
              공지 이미지 받기
            </h2>
            <p className="t-meta">
              인스타·유튜브 같은 내 채널에 올려 내 링크를 알리는 이미지예요. 프로필 배경사진·사진·이름·소개가 나오고, 아래에 작은 글씨로 「팬꾹으로 선물 보내기」와 링크 주소가
              들어가요. 이름·소개를 바꿨다면 먼저 저장해 주세요. 스토리에 올릴 때는 이미지 속 주소를 누를 수 없으니 링크 스티커를 붙여 주세요.
            </p>
            <NoticeSizes creatorId={p.creatorId} ready={canDownloadNotice({ handle: p.handle, verified: p.verified })} siteOrigin={p.siteOrigin} />
          </section>
        </div>

        <CustomizePreview
          v={{
            name: name.trim(),
            initial,
            linkText: p.handle ? linkText(p.handle) : null,
            intro: intro.trim(),
            thanks: thanksLine(fanName),
            verified: p.verified,
            photoUrl,
            backgroundUrl: bgUrl,
            symbolUrl,
            pick: shownPick,
          }}
        />
      </div>
    </div>
  );
}
