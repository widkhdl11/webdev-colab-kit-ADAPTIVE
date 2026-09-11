"use server";

// 초안 도우미의 서버 액션. **이 파일의 내보내기는 브라우저가 부를 수 있는 자리다** —
// 그래서 인자로 클라이언트나 판독기를 받는 것을 두지 않는다(`create-post.ts` 와 같은 이유).

import { currentUser } from "@/entities/session";
import { geminiModel } from "@/shared/api/model/gemini";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionResult } from "@/shared/lib/action-result";
import { withTimeout } from "@/shared/lib/with-timeout";
import { parseDraft, type PostDraft } from "../model/draft";
import { DRAFT_TIMEOUT_MS } from "../model/draft-limits";
import { buildDraftPrompt, type StudyForDraft } from "../model/draft-prompt";
import { hostedStudyForDraftQuery } from "./draft-query";

/** 실패는 한 문구로 묶는다 — 「그 스터디가 없다」와 「내 것이 아니다」를 가르면 그 답이
 *  남의 스터디 존재 여부를 알려 주는 창구가 된다 */
const REFUSED = "초안을 만들 수 없습니다. 내가 만든 스터디인지 확인해 주세요.";
const UNAVAILABLE = "지금은 초안을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.";

function toStudy(row: Record<string, unknown>): StudyForDraft | null {
  const embedded = (key: string): string => {
    const one: unknown = Array.isArray(row[key]) ? (row[key] as unknown[])[0] : row[key];
    const name: unknown = (one as Record<string, unknown> | null)?.name;
    return typeof name === "string" ? name : "";
  };
  const title = row.title;
  const description = row.description;
  if (typeof title !== "string") return null;

  // 모임 시간. 스펙의 INV-G8 이 근거에 「일정」을 적어 뒀는데 처음엔 안 실어 보냈다
  // (2026-09-10 security-reviewer). 없으면 모델이 시간 얘기를 아예 안 쓴다 — 지시문이
  // 「정보가 모자라면 그 얘기를 안 쓴다」고 적어 두었으니 틀린 시간이 나오지는 않지만,
  // 초안이 비어 보이는 이유가 그것이었다.
  const rawSlots: unknown = row.slots;
  const slots = (Array.isArray(rawSlots) ? rawSlots : []).flatMap((slot) => {
    const s = slot as Record<string, unknown>;
    return typeof s.weekday === "number" && typeof s.starts_at === "string"
      ? [{ weekday: s.weekday, startsAt: s.starts_at }]
      : [];
  });

  return {
    title,
    description: typeof description === "string" ? description : null,
    categoryName: embedded("category"),
    regionName: embedded("region"),
    meetingMode: typeof row.meeting_mode === "string" ? row.meeting_mode : "",
    capacity: typeof row.max_participants === "number" ? row.max_participants : 0,
    locationDetail: typeof row.location_detail === "string" ? row.location_detail : null,
    slots,
  };
}

/**
 * 고른 스터디로 모집글 초안을 만든다 (INV-G8 · G9).
 *
 * **돌려주는 것은 초안이지 저장된 값이 아니다.** 화면은 이것을 미리보기로만 그리고,
 * 사용자가 「적용」을 눌러야 폼의 값이 된다 — 사용자가 안 읽은 문장이 사용자 이름으로
 * 발행되면 안 되기 때문이다.
 */
export async function draftPostAction(studyId: string): Promise<ActionResult<PostDraft>> {
  // 로그인 판정이 먼저다. 모델을 부르기 전에 끝낸다 (INV-G4 와 같은 손짓).
  const user = await currentUser();
  if (user === null) return { ok: false, message: REFUSED };
  if (typeof studyId !== "string" || studyId === "") return { ok: false, message: REFUSED };

  // **호스트 확인.** 여기서 안 막으면 남의 스터디 설명이 프롬프트를 지나 초안으로 돌아온다.
  // 조건의 `userId` 는 화면이 보낸 값이 아니라 세션에서 나온 값이다.
  const db = await createServerSupabase();
  const { data, error } = await hostedStudyForDraftQuery(db, studyId, user.id);
  if (error !== null) {
    console.warn("[draft-post] 스터디를 못 읽었다", error);
    return { ok: false, message: UNAVAILABLE };
  }
  if (data === null) return { ok: false, message: REFUSED };

  const study = toStudy(data as Record<string, unknown>);
  if (study === null) return { ok: false, message: UNAVAILABLE };

  try {
    const prompt = buildDraftPrompt(study);
    // 상한을 부르는 쪽이 쥔다 — 제공자에 맡기면 신호를 안 보는 구현이 화면을 멈춰 세운다.
    const raw = await withTimeout(
      (signal) =>
        geminiModel.generate({
          instruction: prompt.instruction,
          data: prompt.data,
          signal,
          expectJson: true,
        }),
      DRAFT_TIMEOUT_MS,
    );
    const draft = parseDraft(raw);
    if (draft === null) return { ok: false, message: UNAVAILABLE };
    return { ok: true, value: draft };
  } catch (cause) {
    // 원문을 화면으로 안 보낸다 — 프롬프트 조각이나 키 관련 문구가 섞일 수 있다.
    console.warn("[draft-post] 모델을 못 썼다", cause);
    return { ok: false, message: UNAVAILABLE };
  }
}
