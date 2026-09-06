import { formText } from "@/shared/lib/form-text";
import { SLOT_ROWS } from "./limits";

export type Slot = { weekday: number; starts_at: string; ends_at: string };

/**
 * 폼이 보내는 모임 일정 줄들을 읽는다. **데이터베이스가 거부할 줄은 여기서 걸러낸다** —
 * 스터디는 이미 만들어진 뒤에 일정이 실패하므로, 거기까지 가면 되돌릴 수 없다.
 *
 * 거르는 것 셋 (supabase/migrations/0001_init.sql 의 study_sessions 제약과 짝):
 *   ① 요일이 0~6 밖이거나 정수가 아니다
 *   ② 끝 시각이 시작 시각보다 앞서거나 같다 (study_sessions_time_order)
 *   ③ 같은 요일·같은 시작 시각이 두 번 (study_sessions_unique)
 *
 * **버리지 않고 이유를 돌려준다.** 조용히 버리면 사용자가 넣은 줄이 이유 없이 사라진다.
 * 세 칸이 다 빈 줄만 「안 적은 줄」로 보고 건너뛴다.
 */
export function readSlots(
  form: FormData,
): { ok: true; slots: Slot[] } | { ok: false; message: string } {
  const slots: Slot[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < SLOT_ROWS; i += 1) {
    const rawWeekday = String(form.get(`weekday${i}`) ?? "").trim();
    const startsAt = formText(form, `startsAt${i}`);
    const endsAt = formText(form, `endsAt${i}`);

    if (!rawWeekday && !startsAt && !endsAt) continue;

    // **`parseInt` 만으로는 부족하다.** "1.5" 도 "1x" 도 1 이 되어 통과한다 —
    // 폼의 select 가 보내는 값은 한 자리 숫자이므로 모양부터 본다.
    const weekday = /^[0-9]+$/.test(rawWeekday) ? Number.parseInt(rawWeekday, 10) : Number.NaN;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { ok: false, message: `${i + 1}번째 모임 일정의 요일을 골라 주세요` };
    }
    if (!startsAt || !endsAt) {
      return { ok: false, message: `${i + 1}번째 모임 일정의 시작·끝 시각을 모두 적어 주세요` };
    }
    if (endsAt <= startsAt) {
      return { ok: false, message: `${i + 1}번째 모임 일정의 끝 시각이 시작 시각보다 뒤여야 합니다` };
    }
    const key = `${weekday}|${startsAt}`;
    if (seen.has(key)) {
      return {
        ok: false,
        message: "같은 요일에 같은 시각으로 시작하는 일정을 두 번 넣을 수 없습니다",
      };
    }
    seen.add(key);
    slots.push({ weekday, starts_at: startsAt, ends_at: endsAt });
  }
  return { ok: true, slots };
}
