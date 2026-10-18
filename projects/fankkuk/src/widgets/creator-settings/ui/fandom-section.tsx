"use client";

import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { THEME_COLORS, type CreatorColors, type ThemeColor } from "@/entities/creator/model/creator-color";
import { creatorSymbolUrl } from "@/entities/creator/model/link-images";
import { FandomBadge } from "@/entities/creator/ui/fandom-badge";
import { CardButtonLabel, CreatorCardActions, CreatorCardFoot, CreatorCardHead, CreatorCardLine, creatorCardClass } from "@/entities/creator/ui/creator-card-head";
import { deleteCreatorImage, sendCreatorImage } from "@/features/creator-photo/api/send-creator-image";
import { ImageField } from "@/features/creator-photo/ui/image-field";
import { sendCreatorProfile } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars, FAN_NAME_MAX, oneLine } from "@/features/creator-settings-save/model/creator-settings-input";
import { charCount } from "@/shared/lib/validation/char-count";
import s from "./fandom-section.module.css";

// 상세 설정 · 팬덤 (design-rules 12절 · 17절, 시안 v21-addendum3/cre-detail-settings.html · v28-card-redesign/settings.html). 단계 순서로 위에서 아래:
// 팬덤 이름 → 팬마크 → 테마 색 → 미리보기(바로 아래 — 폭 720 그대로, DECISIONS 2026-10-18) → 되돌리기·저장.
// - 팬덤 이름·테마 색은 「저장」으로 한 번에 보낸다(/api/creator/profile — my-account INV-A9 경로, 크리에이터 ID 는 보내지 않는다).
//   테마 색은 파스텔 8색 원형 견본 가운데 하나 또는 「선택 안 함」(기본 모양)뿐이다(creator-link INV-E13 — 서버·DB 가 같은 8색으로 다시 본다).
//   팬컬러는 고르지 않는다 — 보내지도 않는다(INV-E13).
// - 팬마크 = 팬덤 심볼(INV-E9·E12). 권리 확인 체크를 해야 고를 수 있고 체크는 요청에도 실린다 — 시안에는 체크가 없지만 스펙(INV-E12)대로 둔다.
// - 팬덤 뱃지는 테마 색으로 그린다: 면 = 테마 색, 테두리 = 테마 색 + #1F2937 22%, 글자 #111827 고정(INV-E14).

/** 견본 이름(화면 낭독기용) — THEME_COLORS 순서 그대로 */
const THEME_NAMES: Readonly<Record<ThemeColor, string>> = {
  "#FDE2E4": "분홍",
  "#FFE5CC": "살구",
  "#FFF1B8": "노랑",
  "#DFF5D8": "연두",
  "#D3F0EC": "민트",
  "#DCEBFF": "하늘",
  "#E6E0FF": "보라",
  "#F6DFF0": "연분홍",
};

const LOGIN = "/login?next=/creator/settings";

export type FandomSectionProps = {
  fanName: string;
  colors: CreatorColors;
  publicName: string;
  initial: string;
  photoUrl: string | null;
  backgroundUrl: string | null;
  symbolUrl: string | null;
  /** 공개 저장소 주소 — 올린 뒤 새 심볼 경로로 주소를 만든다 */
  photoBase: string;
  /** 카드 미리보기 값 — 찾기 화면 카드와 같다. creatorId 로 테마 색이 없을 때의 파스텔도 실제 카드와 같게 */
  card: { creatorId: string; channelTitle: string; intro: string; tags: readonly string[]; approvalMinutes: number | null; faceTone: string };
};

/** 테마 색 고르기 — 원형 견본 8개 + 「선택 안 함」(시안 v28 settings.html .sws). 한 무리의 라디오라 화살표로 옮겨 다닌다. */
function ThemeStep({ step, value, onChange }: { step: number; value: ThemeColor | null; onChange: (v: ThemeColor | null) => void }) {
  return (
    <div className={s.card}>
      <div className={s.step}>
        <i aria-hidden="true">{step}</i>
        <span className={s.label} id="fd-theme-l">
          테마 색
        </span>
      </div>
      <p className={s.hint} id="fd-theme-h">
        배경 사진이 없을 때 카드 바탕과 팬덤 뱃지에 쓰여요. 사이트의 버튼과 글자는 그대로예요.
      </p>
      <div className={s.sws} role="radiogroup" aria-labelledby="fd-theme-l" aria-describedby="fd-theme-h">
        {THEME_COLORS.map((c) => (
          <label key={c} className={s.sw}>
            <input type="radio" name="fd-theme" value={c} checked={value === c} onChange={() => onChange(c)} />
            <span style={{ "--sw": c } as CSSProperties} aria-hidden="true" />
            <span className="sr-only">테마 색 {THEME_NAMES[c]}</span>
          </label>
        ))}
        <label className={s.swNone}>
          <input type="radio" name="fd-theme" value="" checked={value === null} onChange={() => onChange(null)} />
          <span>선택 안 함</span>
        </label>
      </div>
    </div>
  );
}

export function FandomSection(p: FandomSectionProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<{ fanName: string; theme: ThemeColor | null }>({ fanName: p.fanName, theme: p.colors.personal });
  const [fanName, setFanName] = useState(saved.fanName);
  const [theme, setTheme] = useState(saved.theme);
  const [symbolUrl, setSymbolUrl] = useState(p.symbolUrl);
  const [rights, setRights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const name = fanName.trim();

  const save = async () => {
    if (saving) return;
    setMsg(null);
    setSaving(true);
    const r = await sendCreatorProfile({ fanName: name, personalColor: theme ?? "" });
    setSaving(false);
    if (r.kind === "login") return router.push(LOGIN);
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    const next = { fanName: name, theme };
    setSaved(next);
    setFanName(next.fanName);
    setMsg({ ok: true, text: "저장했어요." });
    router.refresh();
  };

  const revert = () => {
    setFanName(saved.fanName);
    setTheme(saved.theme);
    setMsg(null);
  };

  return (
    <section id="fandom" className={s.sec} aria-labelledby="fd-t">
      <h2 className={s.secT} id="fd-t">
        팬덤
      </h2>

      <div className={s.card}>
        <div className={s.step}>
          <i aria-hidden="true">1</i>
          <label className={s.label} htmlFor="fd-name">
            팬덤 이름
          </label>
          <span className={s.count} aria-hidden="true">
            {charCount(name)}/{FAN_NAME_MAX}
          </span>
        </div>
        <input
          className="field"
          id="fd-name"
          type="text"
          value={fanName}
          autoComplete="off"
          aria-describedby="fd-name-h"
          onChange={(e) => setFanName(clipChars(oneLine(e.currentTarget.value), FAN_NAME_MAX))}
        />
        <p className={s.hint} id="fd-name-h">
          가입할 때 정한 이름이에요. 여기서 바꿀 수 있고, 팬 뱃지에 그대로 보여요. 쓸 수 없는 말은 걸러져요.
        </p>
      </div>

      <div className={s.card}>
        <div className={s.step}>
          <i aria-hidden="true">2</i>
          <span className={s.label} aria-hidden="true">
            팬마크
          </span>
        </div>
        <ImageField
          id="fd-sym"
          label="팬마크"
          hideLabel
          view={
            <span className={s.markBox} aria-hidden="true">
              {symbolUrl ? <img src={symbolUrl} alt="" width={512} height={512} /> : null}
            </span>
          }
          hasImage={symbolUrl !== null}
          pickLabel="팬마크 올리기"
          removeLabel="지우기"
          hint="정사각 그림을 올려 주세요(JPG·PNG). 뱃지에는 작게 줄어서 들어가요."
          blocked={rights ? null : "fd-sym-right"}
          upload={(f) => sendCreatorImage("symbol", f, { rightsChecked: rights })}
          remove={() => deleteCreatorImage("symbol")}
          onSaved={(path) => setSymbolUrl(creatorSymbolUrl(p.photoBase, path))}
          onLogin={() => router.push(LOGIN)}
          savedText="팬마크를 올렸어요."
          removedText="팬마크를 지웠어요."
        />
        <label className={s.chk} htmlFor="fd-rights">
          <input type="checkbox" id="fd-rights" checked={rights} onChange={(e) => setRights(e.currentTarget.checked)} />
          <span id="fd-sym-right">내가 만들었거나 쓸 권리가 있는 이미지예요</span>
        </label>
      </div>

      <ThemeStep step={3} value={theme} onChange={setTheme} />

      <div className={`${s.card} ${s.pv}`} aria-labelledby="pv-t" role="group">
        <h3 className={s.pvT} id="pv-t">
          미리보기
        </h3>
        {name ? (
          <div className={s.pvBox}>
            <p className={s.pvCap}>팬덤 뱃지</p>
            <div className={s.pvBadges}>
              <FandomBadge name={name} symbolUrl={symbolUrl} themeColor={theme} size="large" />
              <FandomBadge name={name} symbolUrl={symbolUrl} themeColor={theme} />
            </div>
          </div>
        ) : null}
        <div className={s.pvBox}>
          <p className={s.pvCap}>카드 미리보기</p>
          <div className={creatorCardClass} role="group" aria-label="크리에이터 카드 미리보기" data-card-preview="">
            <CreatorCardHead
              creatorId={p.card.creatorId}
              name={p.publicName}
              href={null}
              look={{ photoUrl: p.photoUrl, backgroundUrl: p.backgroundUrl, symbolUrl, fanName: name || null }}
              colors={{ personal: theme }}
              faceTone={p.card.faceTone}
            />
            <CreatorCardLine channelTitle={p.card.channelTitle} intro={p.card.intro} />
            <CreatorCardFoot tags={p.card.tags} />
            {/* 처음 보는 팬에게 보이는 모양 — 「팔로우」 하나(누를 수 없는 모양) */}
            <CreatorCardActions creatorId={p.card.creatorId} colors={{ personal: theme }}>
              <span className="btn btn--sm btn--line" aria-hidden="true" data-card-btn="main">
                <CardButtonLabel icon="heart-plus">팔로우</CardButtonLabel>
              </span>
            </CreatorCardActions>
          </div>
        </div>
      </div>

      <p className={`${s.msg} ${msg && !msg.ok ? "err" : "t-meta"}`} role="status" id="fd-msg">
        {msg?.text}
      </p>
      <div className={s.btnEnd}>
        <button className="btn btn--line" type="button" onClick={revert}>
          되돌리기
        </button>
        <button className="btn" type="button" aria-disabled={saving} aria-describedby="fd-msg" onClick={() => void save()}>
          {saving ? "저장하는 중…" : "저장"}
        </button>
      </div>
    </section>
  );
}
