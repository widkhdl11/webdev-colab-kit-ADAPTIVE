"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HARD_ACTION_LABEL,
  HARD_ACTIONS,
  HARD_PERIOD_LABEL,
  HARD_PERIODS,
  HARD_REASON_LABEL,
  HARD_REASONS,
  hardItemsNotice,
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

  const preview = hardItemsNotice({ categories, reason });
  const toggle = (c: ItemCategory, on: boolean) => setCategories((list) => sortCategories(on ? [...list, c] : list.filter((x) => x !== c)));

  const save = async (clear: boolean) => {
    if (saving) return;
    setMsg(null);
    // 저장된 설정이 없는데 아무것도 고르지 않고 저장하면 지울 것도 없다 — 「해제했어요」 대신 고르라고 안내한다
    if (!clear && !initial && categories.length === 0) {
      setMsg({ ok: false, text: "받기 어려운 품목을 하나 이상 골라 주세요." });
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
      text: clear || categories.length === 0 ? "받기 어려운 품목을 해제했어요." : "받기 어려운 품목을 저장했어요.",
    });
    router.refresh();
  };

  return (
    <section id="hard" className={`card ${s.set}`} aria-labelledby="hard-h">
      <div className={s["set-head"]}>
        <h2 className="t-card" id="hard-h">
          받기 어려운 품목
        </h2>
      </div>
      <p>고르면 크리에이터 페이지에 정해진 문장으로 한 줄 보여요. 문장은 직접 쓰지 않아요.</p>
      {initial ? (
        <div className={`card card--soft ${s.inner}`}>
          <p className="t-meta">지금 보이는 문구</p>
          <p className="t-strong">{hardItemsNotice(initial)}</p>
          <p className={`t-meta ${s["body-gap"]}`}>
            {HARD_ACTION_LABEL[initial.action]} · {hardItemsRemaining(initial.endsOn, today)} · 남은 기간은 나에게만 보여요.
          </p>
        </div>
      ) : null}

      <fieldset className="fs">
        <legend className="label">품목 (여러 개 고를 수 있어요)</legend>
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
              <span>{HARD_REASON_LABEL[r]}</span>
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
          저장한 날부터 계산해요. 다시 저장하면 그날부터 다시 계산하고, 기간이 끝나면 문구가 저절로 사라져요.
        </p>
      </fieldset>

      <fieldset className="fs" aria-describedby="hard-action-hint">
        <legend className="label">팬이 이 품목을 고르면</legend>
        <div className="grid cols-2">
          {HARD_ACTIONS.map((a) => (
            <label key={a} className="opt">
              <input type="radio" name="hard-action" checked={action === a} onChange={() => setAction(a)} />
              <span>{HARD_ACTION_LABEL[a]}</span>
            </label>
          ))}
        </div>
        <p className="t-meta hint" id="hard-action-hint">
          「안내만」을 고르면 팬이 결제 전에 안내를 보고 그대로 보낼 수도 있어요. 「등록 막기」를 고르면 그 품목으로는 선물을 보낼 수 없어요. 어느 쪽이든 승인한 선물만 배송합니다.
        </p>
      </fieldset>

      <div className={`card ${s.inner}`}>
        <p className="t-meta">미리보기</p>
        {/* 고를 때마다 바뀌는 미리보기라 알림(role=status)으로 읽히게 하지 않는다 — 알리는 것은 저장 결과 줄뿐이다 */}
        <p>{preview ?? "품목을 고르면 여기에 문구가 보여요."}</p>
      </div>

      <div>
        <div className="btn-stack">
          <button className="btn" type="button" aria-disabled={saving} onClick={() => void save(false)}>
            {saving ? "저장하는 중…" : "받기 어려운 품목 저장"}
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
