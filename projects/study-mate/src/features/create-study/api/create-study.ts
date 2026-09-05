"use server";

// 스터디 개설. 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
// docs/specs/write-authorization.md (INV-Z4 · Z8) · participation-capacity.md (INV-P3)

import { redirect } from "next/navigation";
import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionResult } from "@/shared/lib/action-result";

/** 폼에서 온 값 하나를 다듬는다. 빈 문자열은 "안 적음"이라 null 이다 */
const text = (form: FormData, key: string): string | null => {
  const v = String(form.get(key) ?? "").trim();
  return v === "" ? null : v;
};

/** 폼이 보내는 모임 일정 세 줄. 요일과 시작·끝이 다 있는 줄만 쓴다 */
function readSlots(form: FormData): { weekday: number; starts_at: string; ends_at: string }[] {
  const out: { weekday: number; starts_at: string; ends_at: string }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const weekday = Number.parseInt(String(form.get(`weekday${i}`) ?? ""), 10);
    const startsAt = text(form, `startsAt${i}`);
    const endsAt = text(form, `endsAt${i}`);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    if (!startsAt || !endsAt) continue;
    out.push({ weekday, starts_at: startsAt, ends_at: endsAt });
  }
  return out;
}

async function insertStudy(
  user: { readonly id: string },
  form: FormData,
): Promise<ActionResult<string>> {
  const title = text(form, "title");
  const description = text(form, "description");
  const categoryId = text(form, "categoryId");
  const regionCode = text(form, "regionCode");
  const capacity = Number.parseInt(String(form.get("capacity") ?? ""), 10);
  const meetingMode = String(form.get("meetingMode") ?? "offline");

  if (!title) return { ok: false, message: "스터디 이름을 적어 주세요" };
  if (!description) return { ok: false, message: "어떤 스터디인지 설명을 적어 주세요" };
  if (!categoryId) return { ok: false, message: "카테고리를 골라 주세요" };
  if (!regionCode) return { ok: false, message: "지역을 골라 주세요" };
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 100) {
    return { ok: false, message: "정원은 2명에서 100명 사이로 정해 주세요" };
  }
  if (!["offline", "online", "hybrid"].includes(meetingMode)) {
    return { ok: false, message: "진행 방식을 골라 주세요" };
  }

  const startsOn = text(form, "startsOn");
  const endsOn = text(form, "endsOn");
  if (startsOn && endsOn && endsOn < startsOn) {
    return { ok: false, message: "끝나는 날이 시작하는 날보다 앞설 수 없습니다" };
  }

  const supabase = await createServerSupabase();

  // host_id 는 폼에서 오지 않는다 — 가드가 넘겨준 검증된 세션의 값이다 (INV-Z4).
  // 접근 정책도 host_id = auth.uid() 를 요구하므로 여기서 틀리면 데이터베이스가 거부한다.
  const { data, error } = await supabase
    .from("studies")
    .insert({
      host_id: user.id,
      title,
      summary: text(form, "summary"),
      description,
      category_id: categoryId,
      region_code: regionCode,
      location_detail: text(form, "locationDetail"),
      meeting_mode: meetingMode,
      max_participants: capacity,
      starts_on: startsOn,
      ends_on: endsOn,
      recruit_until: text(form, "recruitUntil"),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: `스터디를 만들지 못했습니다: ${error?.message ?? "알 수 없음"}` };
  }

  const slots = readSlots(form);
  if (slots.length > 0) {
    const { error: slotError } = await supabase
      .from("study_sessions")
      .insert(slots.map((s) => ({ ...s, study_id: data.id })));

    // 스터디는 이미 만들어졌다. 일정만 실패했다고 없던 일로 되돌릴 수는 없으므로
    // (되돌리기도 쓰기라서 또 실패할 수 있다) 무엇이 빠졌는지 말하고 수정 화면으로 보낸다.
    if (slotError) {
      return {
        ok: false,
        message: `스터디는 만들어졌지만 모임 일정을 저장하지 못했습니다: ${slotError.message}. 스터디 수정에서 다시 넣어 주세요.`,
      };
    }
  }

  return { ok: true, value: data.id as string };
}

const guarded = requireSession(currentUser, insertStudy);

export async function createStudyAction(
  _previous: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const result = await guarded(form);
  if (!result.ok) return result;
  redirect(`/studies/${result.value}`);
}
