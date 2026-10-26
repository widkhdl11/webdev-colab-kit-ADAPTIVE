"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HARD_ACTION_LABEL,
  HARD_ACTIONS,
  HARD_PERIOD_LABEL,
  HARD_PERIODS,
  HARD_REASON_OPTION_LABEL,
  HARD_REASONS,
  hardItemsNotice,
  hardItemsPreview,
  hardItemsRemaining,
  type HardAction,
  type HardPeriod,
  type HardReason,
  type MyHardItems,
} from "@/entities/gift-item/model/hard-items";
import { ITEM_CATEGORIES, ITEM_CATEGORY_LABEL, sortCategories, type ItemCategory } from "@/entities/gift-item/model/item-category";
import type { CalendarDate } from "@/entities/creator/model/receiving";
import { sendCreatorHardItems } from "@/features/creator-settings-save/api/send-creator-settings";
import { SaveMessage, type SaveMsg } from "./receiving-section";
import s from "./creator-settings.module.css";

// 크리에이터 — 받기 어려운 품목 (hard-items INV-H3~H6). 품목·이유·기간·동작을 고르기만 한다 — 문장을 쓰는 칸은 없다(추가분 불변식 21).
// 저장은 로그인 세션으로만(크리에이터 ID 를 보내지 않는다). 남은 기간은 이 본인 화면에만 보인다(INV-H6).
// 품목을 모두 빼고 저장하거나 「해제」를 누르면 설정이 지워진다.

export function HardItemsSection({ initial, today }: { initial: MyHardItems | null; today: CalendarDate }) {
  const router = useRouter();
  const [categories, setCategories] = useState<ItemCategory[]>([...(initial?.categories ?? [])]);
  const [reason, setReason] = useState<HardReason>(initial?.reason ?? "many");
  const [period, setPeriod] = useState<HardPeriod>(initial?.period ?? "week1");
  const [action, setAction] = useState<HardAction>(initial?.action ?? "notice");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<SaveMsg>(null);

  const preview = hardItemsPreview({ categories, reason });
  const toggle = (c: ItemCategory, on: boolean) => setCategories((list) => sortCategories(on ? [...list, c] : list.filter((x) => x !== c)));

  const save = async (clear: boolean) => {
    if (saving) return;
    setMsg(null);
    // 저장된 설정이 없는데 아무것도 고르지 않고 저장하면 지울 것도 없다 — 「해제했어요」 대신 고르라고 안내한다
    if (!clear && !initial && categories.length === 0) {
      setMsg({ ok: false, text: "받기 어려운 선물을 하나 이상 선택해 주세요." });
      return;
    }
    setSaving(true);
    const r = await sendCreatorHardItems({
      categories: clear ? [] : categories,
      reason,
      period,
      action,
    });
    setSaving(false);
    if (r.kind === "login") {
      router.push("/login?next=/creator/settings");
      return;
    }
    if (r.kind === "failed") {
      setMsg({ ok: false, text: r.message });
      return;
    }
    if (clear) setCategories([]);
    setMsg({
      ok: true,
      text: clear || categories.length === 0 ? "받기 어려운 선물 설정이 해제되었습니다." : "받기 어려운 선물이 설정되었습니다.",
    });
    router.refresh();
  };

  return (
    <section id="hard" className={`card ${s.set}`} aria-labelledby="hard-h">
      <div className={s["set-head"]}>
        <h3 className="t-card" id="hard-h">
          받기 어려운 선물
        </h3>
      </div>
      <p>선택한 선물 종류와 이유가 크리에이터 페이지에 안내 문구로 표시됩니다. 문구는 직접 입력할 수 없습니다.</p>
      {initial ? (
        <div className={`card card--soft ${s.inner}`}>
          <p className="t-meta">현재 안내 문구</p>
          <p className="t-strong">{hardItemsNotice(initial)}</p>
          <p className={`t-meta ${s["body-gap"]}`}>
            {HARD_ACTION_LABEL[initial.action]} · {hardItemsRemaining(initial.endsOn, today)} · 남은 기간은 나에게만 표시됩니다.
          </p>
        </div>
      ) : null}

      <fieldset className="fs">
        <legend className="label">선물 종류 (복수 선택)</legend>
        <div className="grid cols-4">
          {ITEM_CATEGORIES.map((c) => (
            <label key={c} className="opt">
              <input type="checkbox" checked={categories.includes(c)} onChange={(e) => toggle(c, e.currentTarget.checked)} />
              <span>{ITEM_CATEGORY_LABEL[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="fs">
        <legend className="label">이유</legend>
        <div className="grid cols-4">
          {HARD_REASONS.map((r) => (
            <label key={r} className="opt">
              <input type="radio" name="hard-reason" checked={reason === r} onChange={() => setReason(r)} />
              <span>{HARD_REASON_OPTION_LABEL[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="fs" aria-describedby="hard-period-hint">
        <legend className="label">기간</legend>
        <div className="grid cols-4">
          {HARD_PERIODS.map((p) => (
            <label key={p} className="opt">
              <input type="radio" name="hard-period" checked={period === p} onChange={() => setPeriod(p)} />
              <span>{HARD_PERIOD_LABEL[p]}</span>
            </label>
          ))}
        </div>
        <p className="t-meta hint" id="hard-period-hint">
          저장일부터 적용됩니다. 다시 저장하면 기간이 새로 시작되며, 종료 시 안내 문구가 자동으로 사라집니다.
        </p>
      </fieldset>

      <fieldset className="fs" aria-describedby="hard-action-hint">
        <legend className="label">해당 선물 선택 시</legend>
        <div className="grid cols-2">
          {HARD_ACTIONS.map((a) => (
            <label key={a} className="opt">
              <input type="radio" name="hard-action" checked={action === a} onChange={() => setAction(a)} />
              <span>{HARD_ACTION_LABEL[a]}</span>
            </label>
          ))}
        </div>
        <p className="t-meta hint" id="hard-action-hint">
          안내만 표시: 결제 전 안내 후 선물 등록 가능
          <br />
          선물 등록 제한: 해당 종류의 선물 등록 불가
          <br />
          두 설정 모두 크리에이터가 승인한 선물만 배송됩니다.
        </p>
      </fieldset>

      <div className={`card ${s.inner}`}>
        <p className="t-meta">미리보기</p>
        {/* 고를 때마다 바뀌는 미리보기라 알림(role=status)으로 읽히게 하지 않는다 — 알리는 것은 저장 결과 줄뿐이다 */}
        {preview ? (
          <p>
            {preview.items}
            {preview.reason ? (
              <>
                <br />
                {preview.reason}
              </>
            ) : null}
          </p>
        ) : (
          <p>선물 종류를 선택하면 안내 문구가 표시됩니다.</p>
        )}
      </div>

      <div>
        <div className="btn-stack">
          <button className="btn" type="button" aria-disabled={saving} onClick={() => void save(false)}>
            {saving ? "저장 중…" : "받기 어려운 선물 저장"}
          </button>
          {initial ? (
            <button className="btn btn--line" type="button" aria-disabled={saving} onClick={() => void save(true)}>
              해제
            </button>
          ) : null}
        </div>
        <SaveMessage id="hard-msg" msg={msg} />
      </div>
    </section>
  );
}
