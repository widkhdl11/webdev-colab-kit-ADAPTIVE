"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { clearDraft, draftableValues, loadDraft, purgeDrafts, saveDraft, type DraftField, type DraftStorage } from "./draft-store";

// 폼 임시 저장 훅 — 쓰는 곳: 운영자 폼(fankkuk session-login INV-L20). 어느 폼에나 붙는다.
// 칸을 이름(없으면 id)으로 모아 입력할 때마다(잠깐 멈춘 뒤) 저장하고, 화면이 열릴 때 같은 계정의 저장이 있으면 칸에 되돌린다.
// 되돌릴 때는 칸 값을 바꾼 뒤 input·change 사건을 보낸다 — React 가 관리하는 칸도 그 값을 받아 상태가 맞는다.
// 계정·남겨 두는 시간은 위의 DraftScope 가 준다. 그 밖(로그인 안 됨 등)에서는 아무것도 하지 않는다.

type Scope = { userId: string; maxAgeMs: number } | null;
const DraftScopeContext = createContext<Scope>(null);

/** 계정 범위. 열릴 때 한 번 다른 계정·만료된 임시 저장을 지운다(폼이 없는 화면이어도). 값은 계정·시간이 같으면 같은 객체(코드 리뷰 3) */
export function DraftScope({ userId, maxAgeMs, children }: { userId: string | null; maxAgeMs: number; children: ReactNode }) {
  const value = useMemo(() => (userId ? { userId, maxAgeMs } : null), [userId, maxAgeMs]);
  useDraftPurge(userId, maxAgeMs);
  return <DraftScopeContext.Provider value={value}>{children}</DraftScopeContext.Provider>;
}

/**
 * 사이트 어느 화면에서든 한 번 — 만료된 임시 저장을 지우고, 로그인한 사람(userId)이 있으면 다른 계정의 것도 지운다(공용 PC 에 남지 않게).
 * 로그인 안 한 화면이면 만료된 것만.
 */
export function useDraftPurge(userId: string | null, maxAgeMs: number): void {
  useEffect(() => {
    const st = storage();
    if (st) purgeDrafts(st, Date.now(), maxAgeMs, userId);
  }, [userId, maxAgeMs]);
}

/** 화면에 그리는 것 없이 정리만 — 사이트 공통 틀·상단 바가 놓는다 */
export function DraftPurge({ userId, maxAgeMs }: { userId: string | null; maxAgeMs: number }) {
  useDraftPurge(userId, maxAgeMs);
  return null;
}

function storage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isField = (el: Element): el is Field => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

function fieldsOf(form: HTMLFormElement): Field[] {
  return [...form.elements].filter(isField);
}

function readFields(form: HTMLFormElement): DraftField[] {
  return fieldsOf(form).map((el) => ({
    type: el instanceof HTMLTextAreaElement ? "textarea" : el instanceof HTMLSelectElement ? "select" : el.type,
    name: el.name,
    id: el.id,
    value: el.value,
    checked: el instanceof HTMLInputElement ? el.checked : undefined,
  }));
}

/** React 가 지켜보는 칸의 값을 바꾸고 알린다 */
function setFieldValue(el: Field, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function restore(form: HTMLFormElement, values: Record<string, string>): void {
  for (const el of fieldsOf(form)) {
    if (el.type === "password" || el.type === "hidden" || el.type === "file") continue;
    const base = el.name || el.id;
    if (!base) continue;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      const want = el.type === "radio" ? values[`${base}=${el.value}`] === "true" : values[base] === "true";
      if (el.type === "radio" && !want) continue;
      if ((el.type === "checkbox" ? base in values : true) && el.checked !== want) el.click();
      continue;
    }
    if (base in values && el.value !== values[base]) setFieldValue(el, values[base]!);
  }
}

const SAVE_DELAY_MS = 400;

/**
 * 그 폼의 임시 저장을 켠다. 제출이 성공하거나 [닫기]·[취소]로 버리면 돌려준 clear 를 부른다.
 * baseline: 서버 값을 고치는 폼이면 그 폼을 열 때의 서버 값(문자열). 다시 열 때 서버 값이 다르면 복원하지 않고 지운다(옛 값으로 덮지 않게).
 */
export function useFormDraft(formRef: RefObject<HTMLFormElement | null>, formKey: string, opts: { baseline?: string } = {}): { clear(): void } {
  const scope = useContext(DraftScopeContext);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 의존성은 원시 값만 — 부모가 다시 그려져도 되돌리기를 다시 하지 않는다(코드 리뷰 3)
  const userId = scope?.userId ?? null;
  const maxAgeMs = scope?.maxAgeMs ?? 0;
  const baseline = opts.baseline;

  useEffect(() => {
    const form = formRef.current;
    const st = storage();
    if (!userId || !form || !st) return;
    const saved = loadDraft(st, userId, formKey, Date.now(), maxAgeMs, baseline);
    if (saved) restore(form, saved);
    const onInput = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => saveDraft(st, userId, formKey, draftableValues(readFields(form)), Date.now(), baseline), SAVE_DELAY_MS);
    };
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [formRef, formKey, userId, maxAgeMs, baseline]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const st = storage();
    if (userId && st) clearDraft(st, userId, formKey);
  }, [userId, formKey]);

  return { clear };
}
