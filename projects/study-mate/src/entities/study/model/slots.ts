import { formText } from "@/shared/lib/form-text";
import { SLOT_ROWS, SLOT_ROWS_MAX } from "./limits";

export type Slot = { weekday: number; starts_at: string; ends_at: string };

/** 폼의 time 입력이 보내는 모양. 자리수가 고정돼야 아래 시각 비교가 글자 순서로 성립한다 */
const TIME_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 폼이 보내는 모임 일정 줄들을 읽는다. **데이터베이스가 거부할 줄은 여기서 걸러낸다** —
 * 스터디는 이미 만들어진 뒤에 일정이 실패하므로, 거기까지 가면 되돌릴 수 없다.
 *
 * 거르는 것 넷 (supabase/migrations/0001_init.sql 의 study_sessions 제약과 짝):
 *   ① 요일이 0~6 밖이거나 정수가 아니다
 *   ② 시각이 `HH:MM` 모양이 아니다
 *   ③ 끝 시각이 시작 시각보다 앞서거나 같다 (study_sessions_time_order)
 *   ④ 같은 요일·같은 시작 시각이 두 번 (study_sessions_unique)
 *
 * **버리지 않고 이유를 돌려준다.** 조용히 버리면 사용자가 넣은 줄이 이유 없이 사라진다.
 * 세 칸이 다 빈 줄만 「안 적은 줄」로 보고 건너뛴다.
 *
 * **폼이 그리는 줄 수(`SLOT_ROWS`)가 아니라 상한(`SLOT_ROWS_MAX`)까지 읽는다.** 개설 폼은
 * 언제나 세 줄이지만 수정 폼은 이미 저장된 일정이 그보다 많으면 그만큼 그린다. 폼이 그리는
 * 수만큼만 읽으면 화면에 보이던 줄이 **제출과 동시에 사라진다** — 수정은 「보낸 줄이 곧
 * 전부」라 안 읽힌 줄은 지워진 줄이 된다. 빈 줄은 어차피 건너뛰므로 더 읽어도 값이 안 바뀐다.
 *
 * 상한이 필요한 이유는 이 수가 요청에서 오기 때문이다 — 없으면 `weekday0` 부터 아주 큰
 * 번호까지 채워 보내는 요청 하나가 서버를 그만큼 돌린다.
 */
export function readSlots(
  form: FormData,
): { ok: true; slots: Slot[] } | { ok: false; message: string } {
  const slots: Slot[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < SLOT_ROWS_MAX; i += 1) {
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
    // **모양을 먼저 본다** — 요일에 건 것과 같은 판단이다. 두 가지가 여기에 달려 있다.
    // ① 모양이 아무거나면 `"7시"` 같은 값이 Postgres 까지 가서 22007 로 거부되는데,
    //    수정 경로에서는 그때 이미 지우기가 끝나 있어 **있던 일정이 사라진 채로 실패한다.**
    // ② 아래 비교는 글자 순서 비교라 자리수가 다르면 뒤집힌다 — `"10:00" <= "9:00"` 이
    //    참이 되어 09시~10시라는 정상 값이 「끝이 시작보다 앞선다」로 거부된다.
    if (!TIME_SHAPE.test(startsAt) || !TIME_SHAPE.test(endsAt)) {
      return { ok: false, message: `${i + 1}번째 모임 일정의 시각을 24시간 형식으로 골라 주세요` };
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

/**
 * 데이터베이스의 시각("19:00:00")을 폼의 time 입력이 쓰는 모양("19:00")으로.
 *
 * **양쪽 모양이 다르면 아래 대조가 전부 「다름」으로 떨어진다** — 사용자가 아무것도 안
 * 고쳤는데 일정 세 줄이 지워지고 다시 들어간다. 지금은 결과가 같아 눈에 안 보이지만,
 * 지우는 것과 넣는 것이 한 덩어리가 아니라서 그 사이에 실패하면 있던 일정이 사라진다.
 */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

const keyOf = (s: Slot): string => `${s.weekday}|${hhmm(s.starts_at)}|${hhmm(s.ends_at)}`;

/**
 * 지금 저장된 일정과 폼이 보낸 일정을 대조해 **바뀐 줄만** 고른다.
 *
 * **안 바뀐 줄은 건드리지 않는다.** 통째로 지우고 다시 넣으면 넣기가 실패했을 때 손대지도
 * 않은 줄까지 사라진다. 지우기와 넣기를 한 요청으로 묶을 수 없으므로(PostgREST 는 요청
 * 하나에 한 표만 쓴다), 잃을 수 있는 것을 실제로 바뀐 줄로 좁히는 것이 이 함수의 일이다.
 *
 * 순서는 지우기가 먼저다 — 같은 요일·같은 시작 시각에 끝 시각만 바뀐 줄은
 * `study_sessions_unique` 때문에 옛 줄이 남아 있으면 못 들어간다.
 */
export function diffSlots<T extends Slot>(
  current: readonly T[],
  next: readonly Slot[],
): { toDelete: T[]; toInsert: Slot[] } {
  const currentKeys = new Set(current.map(keyOf));
  const nextKeys = new Set(next.map(keyOf));
  return {
    toDelete: current.filter((s) => !nextKeys.has(keyOf(s))),
    toInsert: next.filter((s) => !currentKeys.has(keyOf(s))),
  };
}

/**
 * 수정 폼이 그릴 일정 줄 수. 기본은 `SLOT_ROWS` 이고, **이미 저장된 일정이 그보다 많으면
 * 그만큼 늘린다.**
 *
 * 잘라 내면 화면에 안 보인 줄이 그대로 남는 것이 아니라 **제출과 동시에 지워진다** —
 * 수정은 「보낸 줄이 곧 전부」이기 때문이다. 지금 앱 경로로는 세 줄까지만 만들어지지만
 * 그것은 폼이 세 줄을 그린다는 사실 하나에만 기대고 있다(데이터베이스에는 줄 수 제약이 없다).
 *
 * 상한은 서버가 읽어 주는 수와 같다 — 더 그려 봐야 그 줄은 안 읽힌다.
 */
export function slotFormRows(savedCount: number): number {
  return Math.min(SLOT_ROWS_MAX, Math.max(SLOT_ROWS, savedCount));
}
