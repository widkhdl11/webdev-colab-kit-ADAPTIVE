"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { canDownloadNotice } from "@/entities/creator/model/creator-handle";
import {
  creatorPhotoUrl,
  creatorSymbolUrl,
  nameInitial,
  previewPickOf,
  type PreviewPick,
  type PublicCreatorLook,
} from "@/entities/creator/model/link-images";
import { creatorProfileTabHref } from "@/entities/session/model/home-path";
import { sendPreviewPick } from "@/features/creator-settings-save/api/send-creator-settings";
import panel from "@/shared/ui/settings-panel.module.css";
import { ShareCard } from "./customize-preview";
import { NoticeSizes, type NoticeLinkPlace } from "./notice-sizes";
import s from "./creator-customize.module.css";

// 링크 미리보기 이미지 · 공지 이미지 다운로드 (스펙 creator-link INV-E10).
// 2026-11-14 사용자 결정 — 「꾸미기」 메뉴를 없애고 이 두 구역을 프로필 수정 「채널」 탭으로 옮겼다(DECISIONS 같은 날, UX 명세 creator-profile).
// 안쪽(라디오 둘 → 결과 줄 → 링크 공유 카드 · 세 크기 줄)과 저장 방식은 옮기기 전 그대로, 겉모양만 채널 탭의 다른 구역과 같은 공용 설정 판(settings-panel).
// - 미리보기 이미지 고르기는 누르는 즉시 저장한다. 저장하는 동안에는 다시 고를 수 없다(응답 순서가 뒤바뀌어 엉뚱한 값으로 되돌리지 않게).
//   팬마크가 없으면 고를 수 없다(DB 도 거부한다).

const LOGIN = `/login?next=${encodeURIComponent(creatorProfileTabHref("channel"))}`;

export type PreviewPickSectionProps = {
  name: string;
  photoPath: string | null;
  look: PublicCreatorLook;
  /** 공개 저장소 주소 — 사진 미리보기 주소를 만든다 */
  photoBase: string;
};

export function PreviewPickSection(p: PreviewPickSectionProps) {
  const router = useRouter();
  const [pick, setPick] = useState<PreviewPick>(p.look.previewPick);
  const [pickMsg, setPickMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickSaving, setPickSaving] = useState(false);
  // 같은 틀 안에서 두 번 눌러도 막히게 — 상태는 다음 그리기 전까지 옛 값이다
  const pickBusy = useRef(false);

  const shownPick = previewPickOf({ ...p.look, previewPick: pick });
  const symbolPath = p.look.symbolPath;
  const photoUrl = creatorPhotoUrl(p.photoBase, p.photoPath);
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
    setPickMsg({ ok: true, text: next === "symbol" ? "링크 미리보기 이미지가 팬마크로 설정되었습니다." : "링크 미리보기 이미지가 프로필 사진으로 설정되었습니다." });
  };

  return (
    <section id="preview-image" className={`${panel.panel} ${s.root}`} aria-labelledby="h-og">
      <h2 className={panel.title} id="h-og">
        링크 미리보기 이미지
      </h2>
      <div className={panel.sec}>
        <p className={panel.hint} id="cz-og-h">
          메신저·SNS에 선물 링크를 공유할 때 표시되는 이미지입니다.
        </p>
        <div className={s.picks} role="radiogroup" aria-labelledby="h-og" aria-describedby="cz-og-h cz-pick-msg" aria-busy={pickSaving}>
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
              팬마크
              {symbolPath === null ? (
                <small className={s.pickHint} id="cz-pick-hint">
                  <a href="#fandom">팬마크 등록</a> 후 선택 가능
                </small>
              ) : null}
            </span>
          </label>
        </div>
        <p className={`${panel.msg} ${pickMsg && !pickMsg.ok ? panel.bad : panel.ok}`} role="status" id="cz-pick-msg">
          {pickMsg?.text}
        </p>
        <ShareCard v={{ name: p.name.trim(), initial, photoUrl, symbolUrl, pick: shownPick }} />
      </div>
    </section>
  );
}

export type NoticeSectionProps = {
  creatorId: string;
  verified: boolean;
  handle: string | null;
  /** 사이트 주소 — 공지 이미지 링크 복사에 붙인다 */
  siteOrigin: string;
  /** 못 받을 때 안내가 가리킬 곳 — 선물 링크 판이 그려졌으면 「link」, 빠졌으면(링크용 아이디 없음) 「verify」 */
  linkPlace: NoticeLinkPlace;
};

export function NoticeSection(p: NoticeSectionProps) {
  return (
    <section id="notice" className={`${panel.panel} ${s.root}`} aria-labelledby="h-notice">
      <h2 className={panel.title} id="h-notice">
        공지 이미지 다운로드
      </h2>
      <div className={panel.sec}>
        <p className={panel.hint}>
          내 채널에 선물 링크를 알릴 때 사용하는 이미지입니다.
          <br />
          배경 사진·프로필 사진·이름·소개·‘팬꾹으로 선물 보내기’ 문구·링크 주소가 포함됩니다.
          <br />
          스토리에서는 이미지 속 주소를 누를 수 없으니 링크 스티커를 추가해 주세요.
        </p>
        <NoticeSizes creatorId={p.creatorId} ready={canDownloadNotice({ handle: p.handle, verified: p.verified })} siteOrigin={p.siteOrigin} linkPlace={p.linkPlace} />
      </div>
    </section>
  );
}
