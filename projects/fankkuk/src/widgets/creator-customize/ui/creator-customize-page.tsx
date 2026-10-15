"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { canDownloadNotice, linkText } from "@/entities/creator/model/creator-handle";
import type { CreatorColors } from "@/entities/creator/model/creator-color";
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
import { CREATOR_SETTINGS } from "@/entities/session/model/home-path";
import { sendPreviewPick } from "@/features/creator-settings-save/api/send-creator-settings";
import { CustomizePreview } from "./customize-preview";
import { NoticeSizes } from "./notice-sizes";
import s from "./creator-customize.module.css";

// 내 팬꾹 꾸미기 (디자인 기준 10절, 시안 docs/design/mockups/addendum/customize/customize-b.html · 스펙 creator-link INV-E10).
// 링크 미리보기 이미지 고르기 · 공지 이미지 받기 + 내 링크 페이지 바로 미리보기. 본문 영역 폭이 1080 보다 좁으면 미리보기가 위에 붙어 따라온다(화면 폭이 아니라 본문 영역 기준).
// 2026-10-16 (design-rules 12절, 시안 v21-addendum3): 프로필 사진·배경사진·공개 이름·한 줄 소개는 「프로필 수정」(/creator/profile)으로,
// 팬을 부르는 이름·팬덤 심볼(팬마크)은 「상세 설정」(/creator/settings#fandom)으로 옮겼다 — 같은 칸이 두 곳에 있지 않게. 미리보기는 저장된 값을 그린다.
// - 미리보기 이미지 고르기는 누르는 즉시 저장한다. 저장하는 동안에는 다시 고를 수 없다(응답 순서가 뒤바뀌어 엉뚱한 값으로 되돌리지 않게).
//   심볼이 없으면 고를 수 없다(DB 도 거부한다).
// - 테마 색·무늬·글꼴 고르기는 없다(디자인 기준 10절). 퍼스널 컬러·팬컬러는 상세 설정에 있다(creator-link INV-E13).

export type CreatorCustomizeProps = {
  creatorId: string;
  verified: boolean;
  handle: string | null;
  name: string;
  intro: string;
  fanName: string;
  photoPath: string | null;
  look: PublicCreatorLook;
  /** 퍼스널 컬러 — 미리보기 띠·사진 테두리를 공개 페이지와 같게 그린다(creator-link INV-E13) */
  colors: CreatorColors;
  /** 공개 저장소 주소 — 사진 미리보기 주소를 만든다 */
  photoBase: string;
  /** 사이트 주소 — 공지 이미지 링크 복사에 붙인다 */
  siteOrigin: string;
};

const LOGIN = "/login?next=/creator/customize";

export function CreatorCustomizePage(p: CreatorCustomizeProps) {
  const router = useRouter();
  const [pick, setPick] = useState<PreviewPick>(p.look.previewPick);
  const [pickMsg, setPickMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickSaving, setPickSaving] = useState(false);
  // 같은 틀 안에서 두 번 눌러도 막히게 — 상태는 다음 그리기 전까지 옛 값이다
  const pickBusy = useRef(false);

  const look: PublicCreatorLook = { ...p.look, previewPick: pick };
  const shownPick = previewPickOf(look);
  const symbolPath = p.look.symbolPath;
  const photoUrl = creatorPhotoUrl(p.photoBase, p.photoPath);
  const bgUrl = creatorBackgroundUrl(p.photoBase, p.look.bgPath);
  const symbolUrl = creatorSymbolUrl(p.photoBase, symbolPath);
  const initial = nameInitial(p.name) || "?";

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
    if (r.kind === "login") return router.push(LOGIN);
    if (r.kind === "failed") {
      setPick(before);
      return setPickMsg({ ok: false, text: r.message });
    }
    setPickMsg({ ok: true, text: next === "symbol" ? "링크 미리보기에 팬덤 심볼을 써요." : "링크 미리보기에 프로필 사진을 써요." });
  };

  return (
    <div className={s.root}>
      <header className="page-head">
        <h1 className="ph-title">내 팬꾹 꾸미기</h1>
        <p className="ph-desc">팬이 보게 될 내 선물 링크 페이지를 직접 다듬어요. 바꾸는 즉시 미리보기에서 확인할 수 있어요.</p>
      </header>

      <div className={s.cz}>
        <div className={s.edit}>
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
                      <a href={`${CREATOR_SETTINGS}#fandom`}>심볼을 올리면</a> 고를 수 있어요
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
              들어가요. 스토리에 올릴 때는 이미지 속 주소를 누를 수 없으니 링크 스티커를 붙여 주세요.
            </p>
            <NoticeSizes creatorId={p.creatorId} ready={canDownloadNotice({ handle: p.handle, verified: p.verified })} siteOrigin={p.siteOrigin} />
          </section>
        </div>

        <CustomizePreview
          v={{
            name: p.name.trim(),
            initial,
            linkText: p.handle ? linkText(p.handle) : null,
            intro: p.intro.trim(),
            thanks: thanksLine(p.fanName),
            verified: p.verified,
            photoUrl,
            backgroundUrl: bgUrl,
            symbolUrl,
            pick: shownPick,
            personalColor: p.colors.personal,
          }}
        />
      </div>
    </div>
  );
}
