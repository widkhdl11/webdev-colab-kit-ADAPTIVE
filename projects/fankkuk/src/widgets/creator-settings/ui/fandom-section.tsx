"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { contrastRatio, parseColorField, TEXT_DARK, textOnColor, type CreatorColors } from "@/entities/creator/model/creator-color";
import { creatorSymbolUrl } from "@/entities/creator/model/link-images";
import { FandomBadge } from "@/entities/creator/ui/fandom-badge";
import { CreatorHead } from "@/entities/creator/ui/creator-head";
import { deleteCreatorImage, sendCreatorImage } from "@/features/creator-photo/api/send-creator-image";
import { ImageField } from "@/features/creator-photo/ui/image-field";
import { sendCreatorProfile } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars, FAN_NAME_MAX, oneLine } from "@/features/creator-settings-save/model/creator-settings-input";
import { charCount } from "@/shared/lib/validation/char-count";
import s from "./fandom-section.module.css";

// 상세 설정 · 팬덤 (design-rules 12절, 시안 docs/design/mockups/site/v21-addendum3/cre-detail-settings.html). 단계 순서로 위에서 아래:
// 팬덤 이름 → 팬마크 → 팬컬러 → 퍼스널 컬러 → 미리보기(바로 아래) → 되돌리기·저장.
// - 팬덤 이름·두 색은 「저장」으로 한 번에 보낸다(/api/creator/profile — my-account INV-A9 경로, 크리에이터 ID 는 보내지 않는다). 보내는 칸은 이 셋뿐이다.
//   색은 빈 칸이면 기본 모양으로 되돌리고, 꼴이 틀리면 보내지 않는다(서버·DB 가 다시 본다 — creator-link INV-E13).
// - 팬마크 = 팬덤 심볼(INV-E9·E12). 권리 확인 체크를 해야 고를 수 있고 체크는 요청에도 실린다 — 시안에는 체크가 없지만 스펙(INV-E12)대로 둔다.
// - 미리보기 글자색은 저장하지 않고 그때 계산한다 — 실제 페이지와 같은 계산 하나(textOnColor, INV-E14).

const FAN_SWATCHES = ["#C4B5FD", "#FFF59D", "#89CFF0", "#F9A8D4", "#86EFAC", "#FDBA74", "#1E3A8A", "#9D174D"] as const;
const PERSONAL_SWATCHES = ["#F9A8D4", "#FDBA74", "#FDE047", "#86EFAC", "#7DD3FC", "#C4B5FD", "#334155", "#9F1239"] as const;
/** 글자색 예시(시안 「뱃지 글자는 팬컬러에 맞춰 저절로 바뀌어요」) */
const AUTO_EXAMPLES = ["#FFF59D", "#1E3A8A"] as const;

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
};

function textName(bg: string): string {
  return textOnColor(bg) === TEXT_DARK ? "검정 글자" : "흰색 글자";
}

/** 대비는 소수 첫째 자리에서 버린다 — 반올림하면 4.46 이 4.5 로 보여 기준을 넘은 것처럼 읽힌다 */
function ratioText(bg: string): string {
  return `대비 ${(Math.floor(contrastRatio(bg, textOnColor(bg)) * 10) / 10).toFixed(1)}:1`;
}

/** 안내 상자 아이콘(시안 #i-info) */
function InfoIcon() {
  return (
    <svg className={s.noteIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function ColorStep({
  step,
  id,
  title,
  hint,
  value,
  onChange,
  swatches,
  showAuto,
  invalid,
  errorId,
  inputRef,
  children,
}: {
  step: number;
  id: string;
  title: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  swatches: readonly string[];
  showAuto: boolean;
  invalid: boolean;
  /** 틀렸을 때 이어 읽을 오류 문구 id */
  errorId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  children?: ReactNode;
}) {
  const parsed = parseColorField(value);
  const color = parsed.ok ? parsed.value : null;
  return (
    <div className={s.card}>
      <div className={s.step}>
        <i aria-hidden="true">{step}</i>
        <span className={s.label} id={`${id}-l`}>
          {title}
        </span>
      </div>
      <p className={s.hint} id={`${id}-h`}>
        {hint}
      </p>
      <div className={s.fieldRow}>
        <input
          className={s.picker}
          type="color"
          value={(color ?? "#FFFFFF").toLowerCase()}
          aria-label={`${title} 색상 고르기`}
          onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
        />
        <label className="sr-only" htmlFor={`${id}-hex`}>
          {title} 직접 입력 #RRGGBB
        </label>
        <input
          className={`field ${s.hex}`}
          id={`${id}-hex`}
          ref={inputRef}
          type="text"
          value={value}
          maxLength={7}
          placeholder="#RRGGBB"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? `${id}-h ${errorId}` : `${id}-h`}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
        {showAuto && color ? (
          <span className="t-meta" aria-live="polite">
            {textName(color)} · {ratioText(color)}
          </span>
        ) : null}
      </div>
      <div className={s.swatches} role="group" aria-label={`${title} 추천 색`}>
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            style={{ "--sw": c } as CSSProperties}
            aria-label={`${title} ${c}`}
            aria-pressed={color === c}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      {children}
    </div>
  );
}

export function FandomSection(p: FandomSectionProps) {
  const router = useRouter();
  const [saved, setSaved] = useState({ fanName: p.fanName, fan: p.colors.fan ?? "", personal: p.colors.personal ?? "" });
  const [fanName, setFanName] = useState(saved.fanName);
  const [fan, setFan] = useState(saved.fan);
  const [personal, setPersonal] = useState(saved.personal);
  const [symbolUrl, setSymbolUrl] = useState(p.symbolUrl);
  const [rights, setRights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bad, setBad] = useState<{ fan: boolean; personal: boolean }>({ fan: false, personal: false });
  const fanRef = useRef<HTMLInputElement>(null);
  const personalRef = useRef<HTMLInputElement>(null);

  const fanParsed = parseColorField(fan);
  const personalParsed = parseColorField(personal);
  const colors: CreatorColors = { fan: fanParsed.ok ? fanParsed.value : null, personal: personalParsed.ok ? personalParsed.value : null };
  const name = fanName.trim();

  const save = async () => {
    if (saving) return;
    setMsg(null);
    const nextBad = { fan: !fanParsed.ok, personal: !personalParsed.ok };
    setBad(nextBad);
    if (nextBad.fan || nextBad.personal) {
      setMsg({ ok: false, text: "색은 #RRGGBB 꼴(예: #1E3A8A)로 적어 주세요." });
      // 화면 위에서 먼저 나오는 틀린 칸으로 — 팬컬러(3단계)가 퍼스널 컬러(4단계)보다 위
      (nextBad.fan ? fanRef : personalRef).current?.focus();
      return;
    }
    setSaving(true);
    const r = await sendCreatorProfile({ fanName: name, fanColor: colors.fan ?? "", personalColor: colors.personal ?? "" });
    setSaving(false);
    if (r.kind === "login") return router.push(LOGIN);
    if (r.kind === "failed") return setMsg({ ok: false, text: r.message });
    const next = { fanName: name, fan: colors.fan ?? "", personal: colors.personal ?? "" };
    setSaved(next);
    setFanName(next.fanName);
    setFan(next.fan);
    setPersonal(next.personal);
    setMsg({ ok: true, text: "저장했어요." });
    router.refresh();
  };

  const revert = () => {
    setFanName(saved.fanName);
    setFan(saved.fan);
    setPersonal(saved.personal);
    setBad({ fan: false, personal: false });
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

      <ColorStep
        step={3}
        id="fd-fan"
        title="팬컬러"
        hint="팬덤 뱃지의 바탕색이에요."
        value={fan}
        onChange={(v) => {
          setFan(v);
          setBad((b) => ({ ...b, fan: false }));
        }}
        swatches={FAN_SWATCHES}
        showAuto
        invalid={bad.fan}
        errorId="fd-msg"
        inputRef={fanRef}
      />

      <ColorStep
        step={4}
        id="fd-per"
        title="퍼스널 컬러"
        hint="내 페이지 맨 위 띠와 프로필 사진 테두리에 쓰여요."
        value={personal}
        onChange={(v) => {
          setPersonal(v);
          setBad((b) => ({ ...b, personal: false }));
        }}
        swatches={PERSONAL_SWATCHES}
        showAuto={false}
        invalid={bad.personal}
        errorId="fd-msg"
        inputRef={personalRef}
      >
        <div className={s.note} role="note">
          <InfoIcon />
          <div className={s.noteBody}>
            <p>
              <b>팬컬러와 퍼스널 컬러는 달라도 돼요.</b>
            </p>
            <p className="t-meta">팬컬러는 팬덤 뱃지에만, 퍼스널 컬러는 내 페이지의 띠와 사진 테두리에만 쓰여요. 사이트의 버튼과 글자는 그대로예요.</p>
          </div>
        </div>
      </ColorStep>

      <div className={`${s.card} ${s.pv}`} aria-labelledby="pv-t" role="group">
        <h3 className={s.pvT} id="pv-t">
          미리보기
        </h3>
        {name ? (
          <div className={s.pvBox}>
            <p className={s.pvCap}>팬덤 뱃지</p>
            <div className={s.pvBadges}>
              <FandomBadge name={name} symbolUrl={symbolUrl} fanColor={colors.fan} large />
              <FandomBadge name={name} symbolUrl={symbolUrl} fanColor={colors.fan} />
            </div>
          </div>
        ) : null}
        <div className={s.pvBox}>
          <p className={s.pvCap}>크리에이터 페이지 머리 (배경 띠 · 사진 테두리)</p>
          <CreatorHead
            compact
            label="크리에이터 페이지 머리 미리보기"
            name={p.publicName}
            photoUrl={p.photoUrl}
            initial={p.initial}
            backgroundUrl={p.backgroundUrl}
            colors={colors}
            fanName={name}
            symbolUrl={symbolUrl}
          />
        </div>
        {name ? (
          <div className={s.pvBox}>
            <p className={s.pvCap}>뱃지 글자는 팬컬러에 맞춰 저절로 바뀌어요</p>
            <ul className={s.autoEx}>
              {AUTO_EXAMPLES.map((c) => (
                <li key={c}>
                  <FandomBadge name={name} symbolUrl={symbolUrl} fanColor={c} />
                  <span className="t-meta">
                    {c} {textOnColor(c) === TEXT_DARK ? "밝은 색" : "어두운 색"} → {textName(c)} · {ratioText(c)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
