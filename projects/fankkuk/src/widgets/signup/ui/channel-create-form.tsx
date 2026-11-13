"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { resolveTagSelection, type TagOption } from "@/entities/creator/model/creator-tags";
import { FAN_NAME_MAX } from "@/entities/creator/model/fan-name";
import { NICKNAME_MAX, nicknameSchema } from "@/entities/session/model/nickname-rule";
import { sendChannelCreate } from "@/features/creator-channel-create/api/send-channel-create";
import { checkChannelCreate, type ChannelCreateField } from "@/features/creator-channel-create/model/channel-create-input";
import { TagPicker } from "@/features/creator-tags-edit/ui/tag-picker";
import { availabilityBlock, availabilityLine, type AvailabilityTone } from "@/features/signup/model/name-availability";
import { useNameAvailability } from "@/features/signup/model/use-name-availability";
import { Sentences } from "@/shared/ui/sentences";
import s from "./signup.module.css";

// 크리에이터 가입 4단계 「채널 만들기」 — 채널이 없을 때(UX 명세 signup.md 「2026-11-11 크리에이터 4단계 채널 만들기」 channel_new, 시안 creator-channel-create-20261111 A).
// 닉네임(미리 확인 INV-U14)·팬덤 이름(선택)·태그를 받아 한 번에 만든다(signup INV-U21). 칸·문구는 가입 2단계에서 옮긴 그대로다.
// 판정은 서버가 한다 — 여기서는 같은 스키마로 먼저 보고, 서버가 준 칸·문구를 그 칸 아래에 보인다. 성공하면 다시 읽어 channel_made 로 바뀐다.

type FieldError = { field: ChannelCreateField; message: string };
type Line = { tone: AvailabilityTone; message: string };

function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChannelCreateForm({ tagOptions }: { tagOptions: readonly TagOption[] }) {
  const router = useRouter();
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const [nickname, setNickname] = useState("");
  const [nickTouched, setNickTouched] = useState(false);
  const [fanName, setFanName] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [error, setError] = useState<FieldError | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = nickname.trim();
  const nickFormat = nicknameSchema.safeParse(nickname);
  // INV-U14: 형식이 맞는 닉네임만 미리 묻는다
  const nickCheck = useNameAvailability("nickname", nickTouched && nickFormat.success ? trimmed : null);

  const nickLine = (): Line | null => {
    if (error?.field === "nickname") return { tone: "bad", message: error.message };
    if (!nickTouched) return null;
    if (!nickFormat.success) return { tone: "bad", message: nickFormat.error.issues[0]?.message ?? "닉네임을 확인해 주세요." };
    return availabilityLine(nickCheck.state, trimmed);
  };
  const line = nickLine();
  const errorOf = (field: ChannelCreateField) => (error?.field === field ? error.message : null);
  const clear = (field: ChannelCreateField) => setError((e) => (e?.field === field ? null : e));

  const focusField = (field: ChannelCreateField) => {
    const target = field === "nickname" ? f("nick") : field === "fanName" ? f("fan") : null;
    if (target) requestAnimationFrame(() => document.getElementById(target)?.focus());
  };
  const reject = (e: FieldError) => {
    setError(e);
    if (e.field === "nickname") setNickTouched(true);
    focusField(e.field);
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    // 태그는 화면에서 먼저 합친다(creator-tags INV-T3) — 직접 입력이 선택지 이름과 같으면 그 선택지로 센다
    const t = resolveTagSelection(tagOptions, tagIds, customTag);
    const body = { nickname, fanName, ...(t.ok ? { tagIds: t.tagIds, customTag: t.customTag ?? "" } : { tagIds, customTag }) };
    const problem = checkChannelCreate(body) ?? (t.ok ? null : { field: "tags" as const, message: t.message });
    if (problem) return reject(problem);
    setBusy(true);
    setError(null);
    // INV-U14: 미리 확인의 답이 올 때까지 기다렸다가 「이미 씀」이면 그 칸에서 막는다(최종 판정은 서버)
    const nickState = await nickCheck.settle(trimmed);
    const block = availabilityBlock({ loginId: null, nickname: nickState }, { loginId: "", nickname: trimmed }, ["nickname"]);
    if (block) {
      setBusy(false);
      return reject({ field: "nickname", message: block.message });
    }
    const r = await sendChannelCreate(body);
    if (r.kind === "ok") {
      router.refresh();
      return;
    }
    setBusy(false);
    if (r.kind === "login") {
      router.push("/login?next=/signup/creator");
      return;
    }
    reject({ field: r.field, message: r.message });
  };

  const formError = errorOf("form");
  const tagError = errorOf("tags");
  const fanError = errorOf("fanName");

  return (
    <form className={`${s.step} ${s["chan-form"]}`} noValidate onSubmit={(e) => void submit(e)}>
      <h2 className="t-card">채널 만들기</h2>
      <div className="form">
        <div>
          <label className="label" htmlFor={f("nick")}>
            닉네임
          </label>
          <p className={`hint ${s["hint-top"]}`} id={f("nick-t")}>
            {"팬에게 보이는 이름입니다."}
            <br />
            {"가입 후 ‘프로필 수정’에서 변경할 수 있습니다."}
          </p>
          <input
            className="field"
            id={f("nick")}
            type="text"
            autoComplete="nickname"
            spellCheck={false}
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setNickTouched(true);
              clear("nickname");
            }}
            onBlur={() => setNickTouched(true)}
            aria-describedby={[f("nick-t"), f("nick-h"), line ? f("nick-m") : null].filter(Boolean).join(" ")}
            aria-invalid={line?.tone === "bad" ? true : undefined}
          />
          {line ? (
            <p className={`${s.live} ${s[`live-${line.tone}`]}`} id={f("nick-m")} role={error?.field === "nickname" ? "alert" : undefined}>
              {line.tone === "ok" ? <CheckIcon /> : null}
              <span>
                <Sentences text={line.message} />
              </span>
            </p>
          ) : null}
          <p className="hint" id={f("nick-h")}>
            {`최대 ${NICKNAME_MAX}자 · 중복 사용 불가`}
          </p>
        </div>
        <div>
          <label className="label" htmlFor={f("fan")}>
            팬덤 이름 <span className={`t-meta ${s.opt}`}>(선택)</span>
          </label>
          <p className={`hint ${s["hint-top"]}`} id={f("fan-t")}>
            {"팬을 부르는 이름입니다. 가입 후 ‘프로필 수정 > 채널’에서 변경할 수 있습니다."}
          </p>
          <input
            className="field"
            id={f("fan")}
            type="text"
            autoComplete="off"
            placeholder="예: 꿀벌단"
            maxLength={FAN_NAME_MAX}
            value={fanName}
            onChange={(e) => {
              setFanName(e.target.value);
              clear("fanName");
            }}
            aria-describedby={[f("fan-t"), f("fan-h"), fanError ? f("fan-m") : null].filter(Boolean).join(" ")}
            aria-invalid={fanError ? true : undefined}
          />
          {fanError ? (
            <p className={`${s.live} ${s["live-bad"]}`} id={f("fan-m")} role="alert">
              <span>
                <Sentences text={fanError} />
              </span>
            </p>
          ) : null}
          <p className="hint" id={f("fan-h")}>
            {`최대 ${FAN_NAME_MAX}자 · 선택 입력`}
          </p>
        </div>
        <div>
          <TagPicker
            idBase={f("tags")}
            options={tagOptions}
            picked={tagIds}
            custom={customTag}
            onPickedChange={(next) => {
              setTagIds(next);
              clear("tags");
            }}
            onCustomChange={(next) => {
              setCustomTag(next);
              clear("tags");
            }}
            invalid={tagError ? { describedBy: f("tags-m") } : null}
          />
          {tagError ? (
            <p className={`${s.live} ${s["live-bad"]}`} id={f("tags-m")} role="alert">
              <span>
                <Sentences text={tagError} />
              </span>
            </p>
          ) : null}
        </div>
        {formError ? (
          <p className="err" role="alert">
            <Sentences text={formError} />
          </p>
        ) : null}
        <div>
          <button className={`btn ${s["make-btn"]}`} type="submit" aria-disabled={busy ? true : undefined}>
            {busy ? "만드는 중…" : "채널 만들기"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** 채널을 만든 뒤 요약 한 줄(channel_made) — 닉네임 · 팬덤 이름. 고치기 버튼은 두지 않는다(바꾸기는 프로필 수정·상세 설정) */
export function ChannelMadeSummary({ nickname, fanName }: { nickname: string; fanName: string | null }) {
  return (
    <div>
      <h2 className={`t-card ${s["chan-head"]}`}>채널 만들기</h2>
      <div className={s.made} role="status">
        <CheckIcon />
        <div>
          <p className={s["made-t"]}>채널을 만들었습니다</p>
          <p className={s["made-n"]}>{fanName ? `${nickname} · ${fanName}` : nickname}</p>
        </div>
      </div>
    </div>
  );
}
