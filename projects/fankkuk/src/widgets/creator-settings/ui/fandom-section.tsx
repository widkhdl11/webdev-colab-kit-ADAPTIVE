"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { THEME_COLORS, type CreatorColors, type ThemeColor } from "@/entities/creator/model/creator-color";
import { creatorSymbolUrl } from "@/entities/creator/model/link-images";
import { CardButtonLabel, CreatorCardActions, CreatorCardFoot, CreatorCardHead, CreatorCardLine, creatorCardClass } from "@/entities/creator/ui/creator-card-head";
import { deleteCreatorImage, sendCreatorImage } from "@/features/creator-photo/api/send-creator-image";
import { ImageField } from "@/features/creator-photo/ui/image-field";
import { sendCreatorProfile } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars, FAN_NAME_MAX, oneLine } from "@/features/creator-settings-save/model/creator-settings-input";
import { creatorProfileTabHref } from "@/entities/session/model/home-path";
import { charCount } from "@/shared/lib/validation/char-count";
import panel from "@/shared/ui/settings-panel.module.css";
import s from "./fandom-section.module.css";

// 프로필 수정 「채널」 탭 · 팬덤 — 2026-11-13 상세 설정에서 옮김. 원래: 상세 설정 · 팬덤 (design-rules 12절 · 17절 · 27절, 시안 pilot-2026-10-22/settings.html).
// 채널 탭은 왼쪽 한 기둥에 같은 판 모양의 구역을 쌓고 미리보기는 오른쪽 열에 하나만 둔다 — 그래서 이 구역을 둘로 나눴다:
// FandomForm(입력 한 판 — 팬덤 이름 · 팬마크 · 테마 색 소제목, 끝에 저장 결과 안내 · 되돌리기 · 저장)과 FandomPreview(카드 미리보기).
// 둘은 FandomDraftProvider 의 입력 중 값(팬덤 이름 · 테마 색 · 팬마크)을 같이 본다 — 입력하는 대로 카드가 바뀌는 동작은 옮기기 전과 같다.
// 판 겉모양은 공용 settings-panel(채널 탭의 다른 구역과 같은 판). 입력 칸·저장 방식·문구는 그대로다.
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

// 로그인이 끊기면 이 구역이 놓인 프로필 수정 「채널」 탭으로 돌아온다(2026-11-13 상세 설정에서 옮김)
const LOGIN = `/login?next=${encodeURIComponent(creatorProfileTabHref("channel"))}`;

/** 입력 중 값 — 입력 판과 카드 미리보기가 같이 본다 */
type FandomDraft = {
  fanName: string;
  setFanName: (v: string) => void;
  theme: ThemeColor | null;
  setTheme: (v: ThemeColor | null) => void;
  symbolUrl: string | null;
  setSymbolUrl: (v: string | null) => void;
};

const FandomDraftContext = createContext<FandomDraft | null>(null);

function useFandomDraft(): FandomDraft {
  const d = useContext(FandomDraftContext);
  if (!d) throw new Error("FandomDraftProvider 밖에서 팬덤 구역을 그렸다");
  return d;
}

/** 저장된 값으로 입력 중 값을 연다. 입력 판(FandomForm)과 카드 미리보기(FandomPreview)를 이 안에 둔다 — 어느 열에 놓이든 같은 값을 본다 */
export function FandomDraftProvider({ fanName: savedName, colors, symbolUrl: savedSymbol, children }: { fanName: string; colors: CreatorColors; symbolUrl: string | null; children: ReactNode }) {
  const [fanName, setFanName] = useState(savedName);
  const [theme, setTheme] = useState<ThemeColor | null>(colors.personal);
  const [symbolUrl, setSymbolUrl] = useState(savedSymbol);
  return <FandomDraftContext.Provider value={{ fanName, setFanName, theme, setTheme, symbolUrl, setSymbolUrl }}>{children}</FandomDraftContext.Provider>;
}

export type FandomFormProps = {
  /** 저장된 팬덤 이름 · 테마 색 — 「되돌리기」가 돌아갈 값 */
  fanName: string;
  colors: CreatorColors;
  /** 공개 저장소 주소 — 올린 뒤 새 심볼 경로로 주소를 만든다 */
  photoBase: string;
};

export type FandomPreviewProps = {
  publicName: string;
  photoUrl: string | null;
  backgroundUrl: string | null;
  /** 카드 미리보기 값 — 찾기 화면 카드와 같다 */
  card: { creatorId: string; channelTitle: string; intro: string; tags: readonly string[]; approvalMinutes: number | null; faceTone: string };
};

/** 테마 색 고르기 — 원형 견본 8개 + 「선택 안 함」(시안 pilot-2026-10-22 settings.html .st-sw). 한 무리의 라디오라 화살표로 옮겨 다닌다. */
function ThemeField({ value, onChange }: { value: ThemeColor | null; onChange: (v: ThemeColor | null) => void }) {
  return (
    <div className={s.sub}>
      <h3 className={s.subT}>
        <span id="fd-theme-l">테마 색</span>
      </h3>
      <p className={s.hint} id="fd-theme-h">
        배경 사진이 없을 때 카드 배경과 팬덤 배지에 적용됩니다. 사이트 버튼과 글자에는 적용되지 않습니다.
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

export function FandomForm(p: FandomFormProps) {
  const router = useRouter();
  const { fanName, setFanName, theme, setTheme, setSymbolUrl, symbolUrl } = useFandomDraft();
  const [saved, setSaved] = useState<{ fanName: string; theme: ThemeColor | null }>({ fanName: p.fanName, theme: p.colors.personal });
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
    setMsg({ ok: true, text: "저장되었습니다." });
    router.refresh();
  };

  const revert = () => {
    setFanName(saved.fanName);
    setTheme(saved.theme);
    setMsg(null);
  };

  return (
    <section id="fandom" className={`${panel.panel} ${s.form}`} aria-labelledby="fd-t">
      <h2 className={panel.title} id="fd-t">
        팬덤
      </h2>
      {/* 입력 한 판 — 소제목 셋(순서가 없는 설정이라 번호는 없다) 끝에 저장 결과 안내와 되돌리기·저장 */}
          {/* 칸 폭은 값 길이(10자)에 맞춘 240 — 글자 수 세기가 칸 오른쪽 끝에 붙게 제목 줄도 같은 폭(s.short) */}
          <div className={`${s.sub} ${s.short}`}>
            <h3 className={s.subT}>
              <label htmlFor="fd-name">팬덤 이름</label>
              <span className={s.count} aria-hidden="true">
                {charCount(name)}/{FAN_NAME_MAX}
              </span>
            </h3>
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
              팬 배지에 표시되는 이름 · 최대 {FAN_NAME_MAX}자
              <br />
              사용할 수 없는 표현은 저장되지 않습니다.
            </p>
          </div>

          <div className={s.sub}>
            <h3 className={s.subT} id="fd-sym-h">
              <span>팬마크</span>
            </h3>
            <ImageField
              id="fd-sym"
              labelledBy="fd-sym-h"
              view={
                <span className={s.markBox} aria-hidden="true">
                  {symbolUrl ? <img src={symbolUrl} alt="" width={512} height={512} /> : null}
                </span>
              }
              hasImage={symbolUrl !== null}
              pickLabel="팬마크 업로드"
              removeLabel="삭제"
              hint={
                <>
                  JPG·PNG · 정사각형 이미지 권장
                  <br />
                  팬 배지에는 축소해서 표시됩니다.
                </>
              }
              blocked={rights ? null : "fd-sym-right"}
              upload={(f) => sendCreatorImage("symbol", f, { rightsChecked: rights })}
              remove={() => deleteCreatorImage("symbol")}
              onSaved={(path) => setSymbolUrl(creatorSymbolUrl(p.photoBase, path))}
              onLogin={() => router.push(LOGIN)}
              savedText="팬마크가 등록되었습니다."
              removedText="팬마크가 삭제되었습니다."
            />
            <label className={s.chk} htmlFor="fd-rights">
              <input type="checkbox" id="fd-rights" checked={rights} onChange={(e) => setRights(e.currentTarget.checked)} />
              <span id="fd-sym-right">직접 제작했거나 사용 권한이 있는 이미지입니다</span>
            </label>
          </div>

          <ThemeField value={theme} onChange={setTheme} />

          {/* 판 끝 — 결과 상자(완료 ✓ · 오류 !)는 비면 높이 0 이라 저장 줄 위 간격이 16(41절), 결과가 뜨면 그 높이만큼 버튼이 내려간다. 휴대폰에서는 화면 아래에 붙는다 */}
          <div className={s.end}>
            <p className={`${s.msg} ${msg && !msg.ok ? "err" : "okmsg"}`} role="status" id="fd-msg">
              {msg?.text}
            </p>
            <div className={s.btns}>
              <button className="btn btn--line" type="button" onClick={revert}>
                되돌리기
              </button>
              <button className="btn" type="button" aria-disabled={saving} aria-describedby="fd-msg" onClick={() => void save()}>
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
    </section>
  );
}

/** 카드 미리보기 — 찾기 화면 카드 하나(팬덤 뱃지는 카드 안). 입력 판의 입력 중 값(팬덤 이름 · 테마 색 · 팬마크)을 그대로 그린다. 배경 사진·태그는 넘겨받은 저장된 값이다 */
export function FandomPreview(p: FandomPreviewProps) {
  const { fanName, theme, symbolUrl } = useFandomDraft();
  const name = fanName.trim();
  return (
    <aside className={s.pv} aria-labelledby="pv-t" data-fandom-preview="">
      <h2 className={s.pvT} id="pv-t">
        미리보기
      </h2>
      <div className={creatorCardClass} role="group" aria-label="크리에이터 카드 미리보기" data-card-preview="">
        <CreatorCardHead
          name={p.publicName}
          href={null}
          look={{ photoUrl: p.photoUrl, backgroundUrl: p.backgroundUrl, symbolUrl, fanName: name || null }}
          colors={{ personal: theme }}
          faceTone={p.card.faceTone}
        />
        <CreatorCardLine intro={p.card.intro} />
        <CreatorCardFoot tags={p.card.tags} />
        {/* 처음 보는 팬에게 보이는 모양 — 「팔로우」 하나(누를 수 없는 모양) */}
        <CreatorCardActions>
          <span className="btn btn--sm btn--line" aria-hidden="true" data-card-btn="main">
            <CardButtonLabel icon="heart-plus">팔로우</CardButtonLabel>
          </span>
        </CreatorCardActions>
      </div>
    </aside>
  );
}
