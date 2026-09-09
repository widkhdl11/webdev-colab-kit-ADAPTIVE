// 스터디 폼이 보낸 값을 읽어 다듬고 규칙을 본다. **개설과 수정이 같은 함수를 부른다.**
//
// **엔티티에 있는 이유**는 모집글의 `validatePostText` 와 같다 — 이 규칙은 「스터디라는 것이
// 어떤 값을 갖는가」이지 「개설 기능이 무엇을 허용하는가」가 아니다. 기능끼리는 import 할 수
// 없으므로(features → features 금지) 개설 기능 안에 두면 수정 기능이 열한 칸의 검사를 손으로
// 복사하게 되고, 그러면 한쪽만 고쳐지는 날 **개설은 되는데 수정은 거부되는 스터디**가 생긴다.
//
// 여기서 돌려주는 키 이름은 데이터베이스 열 이름 그대로다. 부르는 쪽이 다시 매핑하면
// 그 매핑이 두 벌이 되고, 열이 하나 늘 때 한쪽만 고쳐진다.

import { formText } from "@/shared/lib/form-text";
import {
  CAPACITY_MAX,
  CAPACITY_MIN,
  DESCRIPTION_MAX,
  LOCATION_MAX,
  MEETING_MODES,
  SUMMARY_MAX,
  TITLE_MAX,
} from "./limits";
import type { MeetingMode } from "./study";

/** 폼의 date 입력이 보내는 모양. 자리수가 고정돼야 날짜 비교가 글자 순서로 성립한다 */
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** 스터디 행에 그대로 실리는 칸들. 호스트는 여기 없다 — 폼에서 오지 않는다 (INV-Z4·Z15) */
export type StudyFields = {
  readonly title: string;
  readonly summary: string | null;
  readonly description: string;
  readonly category_id: string;
  readonly region_code: string;
  readonly location_detail: string | null;
  readonly meeting_mode: MeetingMode;
  readonly max_participants: number;
  readonly starts_on: string | null;
  readonly ends_on: string | null;
  readonly recruit_until: string | null;
};

/**
 * 폼의 열한 칸을 읽는다. 어기면 **사용자에게 보여 줄 문장**을 돌려준다.
 *
 * **문구에 숫자를 직접 적지 않고 상수를 끼운다** — 문구와 상한이 갈리면 사용자가 읽는
 * 숫자와 실제로 막히는 숫자가 달라진다. 대신 검사 쪽이 숫자를 직접 박아 상한을 고정한다.
 */
export function readStudyFields(
  form: FormData,
): { readonly ok: true; readonly fields: StudyFields } | { readonly ok: false; readonly message: string } {
  const title = formText(form, "title");
  const description = formText(form, "description");
  const categoryId = formText(form, "categoryId");
  const regionCode = formText(form, "regionCode");
  const summary = formText(form, "summary");
  const locationDetail = formText(form, "locationDetail");
  const capacity = Number.parseInt(String(form.get("capacity") ?? ""), 10);
  const meetingMode = String(form.get("meetingMode") ?? "offline");

  if (!title) return { ok: false, message: "스터디 이름을 적어 주세요" };
  // **글자 수를 코드포인트로 센다.** `String.length` 는 UTF-16 단위라 이모지 하나를 둘로
  // 세고, 그러면 데이터베이스(`char_length`)와 다른 숫자가 된다 — 「60자까지」라고 말해
  // 놓고 30자에서 막힌다 (2026-09-09 code-reviewer).
  if ([...title].length > TITLE_MAX) {
    return { ok: false, message: `스터디 이름은 ${TITLE_MAX}자까지 적을 수 있습니다` };
  }
  if (summary && summary.length > SUMMARY_MAX) {
    return { ok: false, message: `한 줄 소개는 ${SUMMARY_MAX}자까지 적을 수 있습니다` };
  }
  if (!description) return { ok: false, message: "어떤 스터디인지 설명을 적어 주세요" };
  if (description.length > DESCRIPTION_MAX) {
    return { ok: false, message: `설명은 ${DESCRIPTION_MAX}자까지 적을 수 있습니다` };
  }
  if (locationDetail && locationDetail.length > LOCATION_MAX) {
    return { ok: false, message: `장소는 ${LOCATION_MAX}자까지 적을 수 있습니다` };
  }
  if (!categoryId) return { ok: false, message: "카테고리를 골라 주세요" };
  if (!regionCode) return { ok: false, message: "지역을 골라 주세요" };
  if (!Number.isInteger(capacity) || capacity < CAPACITY_MIN || capacity > CAPACITY_MAX) {
    return {
      ok: false,
      message: `정원은 ${CAPACITY_MIN}명에서 ${CAPACITY_MAX}명 사이로 정해 주세요`,
    };
  }
  if (!(MEETING_MODES as readonly string[]).includes(meetingMode)) {
    return { ok: false, message: "진행 방식을 골라 주세요" };
  }

  const startsOn = formText(form, "startsOn");
  const endsOn = formText(form, "endsOn");
  const recruitUntil = formText(form, "recruitUntil");
  // **날짜 셋도 모양을 본다.** 안 보면 적힌 그대로 Postgres 에 가서 22007 로 거부되는데,
  // 그 오류 문장은 보낸 값을 그대로 되비치고 `dbErrorMessage` 가 그것을 로그에 찍는다 —
  // 값 안의 줄바꿈이 살아 있으므로 로그 한 줄을 통째로 지어낼 수 있다. 아래 날짜 비교가
  // 글자 순서 비교인 것도 자리수가 고정돼야 성립한다.
  for (const [label, value] of [
    ["시작하는 날", startsOn],
    ["끝나는 날", endsOn],
    ["모집 마감일", recruitUntil],
  ] as const) {
    if (value && !DATE_SHAPE.test(value)) {
      return { ok: false, message: `${label}을 달력에서 골라 주세요` };
    }
  }
  // 데이터베이스 제약은 ends_on >= starts_on 이다 — 하루짜리 스터디는 정상이다.
  if (startsOn && endsOn && endsOn < startsOn) {
    return { ok: false, message: "끝나는 날이 시작하는 날보다 앞설 수 없습니다" };
  }

  return {
    ok: true,
    fields: {
      title,
      summary,
      description,
      category_id: categoryId,
      region_code: regionCode,
      location_detail: locationDetail,
      meeting_mode: meetingMode as MeetingMode,
      max_participants: capacity,
      starts_on: startsOn,
      ends_on: endsOn,
      recruit_until: recruitUntil,
    },
  };
}
