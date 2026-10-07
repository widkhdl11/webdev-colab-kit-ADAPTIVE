"use client";

import { countTagSelection, TAG_CUSTOM_MAX, TAG_TOTAL_MAX, type TagOption } from "@/entities/creator/model/creator-tags";
import { hasTagIcon, TagChipBody, tagStyle } from "@/entities/creator/ui/creator-tag";
import { charCount } from "@/shared/lib/validation/char-count";
import s from "./tag-picker.module.css";

// 크리에이터 태그 고르기 (creator-tags INV-T3) — 가입 화면과 크리에이터 설정이 같이 쓴다.
// 선택지는 누를 때마다 켜고 끈다(여러 개). 목록에 없는 곳은 「직접 입력」 칸에 하나. 합쳐 1~5개.
// 칩 모양은 design-rules 5절 태그 아이콘·플랫폼 색(시안 tags-b 1절) — 아이콘 + 고르면 플랫폼 색 테두리·옅은 면·체크.
// 다 고르면(5개) 남은 칩은 더 켜지지 않는다. 판정은 서버·DB 가 다시 한다 — 화면은 미리 막을 뿐이다.
// 값은 부르는 쪽이 들고 있다(controlled). 직접 입력은 글자 수를 코드 포인트로 센다(DB 와 같은 셈).

type Props = {
  /** 칸 id 앞부분 — 한 화면에 하나만 있으므로 부르는 쪽이 정한다 */
  idBase: string;
  options: readonly TagOption[];
  picked: readonly string[];
  custom: string;
  onPickedChange: (next: string[]) => void;
  onCustomChange: (next: string) => void;
  /** 틀린 칸 표시 — 부르는 쪽의 오류 줄 id 를 넘기면 그 줄을 읽어 준다 */
  invalid?: { describedBy: string } | null;
};

export function TagPicker({ idBase, options, picked, custom, onPickedChange, onCustomChange, invalid = null }: Props) {
  const count = countTagSelection(options, picked, custom);
  const full = count >= TAG_TOTAL_MAX;
  const hintId = `${idBase}-hint`;

  const toggle = (id: string) => {
    if (picked.includes(id)) onPickedChange(picked.filter((x) => x !== id));
    else if (!full) onPickedChange([...picked, id]);
  };

  return (
    <div className="field" role="group" aria-labelledby={`${idBase}-label`} aria-describedby={hintId}>
      <p className="label" id={`${idBase}-label`}>
        태그
      </p>
      <div className={s.chips}>
        {options.map((o) => {
          const on = picked.includes(o.id);
          return (
            <button
              key={o.id}
              className="chip"
              type="button"
              aria-pressed={on}
              aria-disabled={!on && full}
              data-icon={hasTagIcon(o.name)}
              style={tagStyle(o.name)}
              onClick={() => toggle(o.id)}
            >
              <TagChipBody name={o.name} pressed={on} />
            </button>
          );
        })}
      </div>
      <div className={s.custom}>
        <label htmlFor={`${idBase}-custom`}>직접 입력 (목록에 없을 때 한 개)</label>
        <input
          className="input"
          id={`${idBase}-custom`}
          type="text"
          autoComplete="off"
          placeholder="예: 팝콘TV"
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          aria-describedby={invalid ? `${hintId} ${invalid.describedBy}` : hintId}
          aria-invalid={invalid ? true : undefined}
        />
      </div>
      <p className="hint" id={hintId}>
        활동하는 곳과 방송 종류를 골라 주세요. 고른 것과 직접 입력을 합쳐 1~{TAG_TOTAL_MAX}개(지금 {count}개), 직접 입력은 {TAG_CUSTOM_MAX}자까지예요
        {charCount(custom.trim()) > 0 ? `(${charCount(custom.trim())}자)` : ""}. 직접 입력한 태그는 운영팀이 확인한 뒤에 공개돼요.
      </p>
    </div>
  );
}
