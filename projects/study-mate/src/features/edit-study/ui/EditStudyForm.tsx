"use client";

import { useActionState, useState } from "react";
import type { Category } from "@/entities/category";
import type { Region } from "@/entities/region";
import type { EditableStudy } from "@/entities/study";
import {
  CAPACITY_MAX,
  CAPACITY_MIN,
  capacityFloor,
  DESCRIPTION_MAX,
  LOCATION_MAX,
  MEETING_MODES,
  MEETING_MODE_LABEL,
  SUMMARY_MAX,
  TITLE_MAX,
} from "@/entities/study/model/limits";
import { slotFormRows } from "@/entities/study/model/slots";
import { Button, ButtonLink } from "@/shared/ui/button/Button";
import { FormCard } from "@/shared/ui/form-page";
import {
  Field,
  FieldRow,
  FormActions,
  FormError,
  FormSection,
  Select,
  TextArea,
  TextInput,
} from "@/shared/ui/field/Field";
import { WEEKDAY_NAMES } from "@/shared/lib/schedule";
import type { ActionResult } from "@/shared/lib/action-result";
import { updateStudyAction } from "../api/edit-study";
import type { UpdatedStudy } from "../api/update-study";

type SlotRow = { weekday: string; startsAt: string; endsAt: string };
const EMPTY_SLOT: SlotRow = { weekday: "", startsAt: "", endsAt: "" };

/**
 * 저장된 일정을 폼의 줄로 편다. 남는 줄은 빈 줄이다.
 *
 * 줄 수를 여기서 정하지 않고 `slotFormRows` 에 묻는 이유는, 그 판단이 **잘라 내면 데이터가
 * 사라진다**는 규칙이라 화면 안에 두면 아무 검사도 못 붙들기 때문이다.
 */
function toRows(slots: EditableStudy["slots"]): SlotRow[] {
  return Array.from({ length: slotFormRows(slots.length) }, (_, i) => {
    const s = slots[i];
    return s
      ? { weekday: String(s.weekday), startsAt: s.startsAt, endsAt: s.endsAt }
      : { ...EMPTY_SLOT };
  });
}

/**
 * 고칠 수 있는 것은 개설 폼과 같은 열한 칸 + 모임 일정이다.
 *
 * **여기 없는 칸이 못 고치는 것이다** — 호스트는 갱신으로 바뀌지 않고(INV-Z15), 모집을 닫는
 * 것과 스터디를 지우는 것은 이 화면의 일이 아니다(화면 목록이 이 화면에 「수정」만 배정했다).
 * 모집글 수정 화면처럼 「못 바꾼다」를 글로 적지는 않는다 — 개설 폼에도 그 칸들이 없어서
 * 사용자가 「있었는데 사라진 칸」으로 읽을 자리가 아니기 때문이다.
 */
export function EditStudyForm({
  study,
  categories,
  regions,
}: {
  study: EditableStudy;
  categories: readonly Category[];
  regions: readonly Region[];
}) {
  const [result, submit, pending] = useActionState<ActionResult<UpdatedStudy> | null, FormData>(
    updateStudyAction,
    null,
  );

  // **입력칸을 React 가 들고 있어야 실패해도 적은 것이 남는다.** `<form action={…}>` 은
  // 액션이 끝나면 제어되지 않는 입력칸을 초기화한다. 액션이 실패를 **반환**하면(던지지
  // 않는다) React 는 정상 종료로 보므로, `defaultValue` 만 쓰면 오류 문구와 함께 칸이
  // 저장된 옛 값으로 되돌아간다 — 방금 고쳐 쓴 것이 통째로 사라진다.
  // 2026-09-06 에 모집글 수정에서 브라우저로 실측한 자리다.
  const [form, setForm] = useState({
    title: study.title,
    summary: study.summary ?? "",
    description: study.description,
    categoryId: study.categoryId,
    regionCode: study.regionCode,
    locationDetail: study.locationDetail ?? "",
    meetingMode: study.meetingMode as string,
    capacity: String(study.capacity),
    startsOn: study.startsOn ?? "",
    endsOn: study.endsOn ?? "",
    recruitUntil: study.recruitUntil ?? "",
  });
  const [slots, setSlots] = useState<SlotRow[]>(() => toRows(study.slots));

  const set = <K extends keyof typeof form>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setSlot = (i: number, key: keyof SlotRow, value: string) =>
    setSlots((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  // 정원의 하한 판단은 엔티티가 갖는다 (INV-P3) — 화면은 그 값을 입력칸에 옮기기만 한다.
  const floor = capacityFloor(study.filled);

  return (
    <FormCard>
      <form action={submit}>
        {result && !result.ok ? <FormError message={result.message} /> : null}
        {/* 본문은 저장됐고 일정만 못 바꾼 갈래. 액션이 이 경우에만 화면에 남긴다.
            **`slotsWiped` 로 문장을 가른다** — 지우기까지 끝난 뒤 넣기가 실패했으면 바꾸려던
            줄이 지금 없는 상태라, 「안 바뀌었다」고 말하면 거짓이고 할 일도 다르다 */}
        {result?.ok && result.value.slotError ? (
          <FormError
            message={
              result.value.slotsWiped
                ? `고친 내용은 저장했습니다. ${result.value.slotError} 바꾸려던 모임 일정은 지금 지워진 상태이니 저장을 한 번 더 눌러 주세요.`
                : `고친 내용은 저장했습니다. ${result.value.slotError} 모임 일정은 그대로입니다.`
            }
          />
        ) : null}

        {/* 어느 스터디를 고치는지. 서버는 이 값과 **세션의 호스트**를 함께 보고 좁힌다 —
            여기에 남의 스터디 id 를 넣어도 그 스터디는 안 걸린다 (INV-Z15) */}
        <input type="hidden" name="studyId" value={study.id} />

        <Field id="title" label="스터디 이름" required>
          <TextInput
            id="title"
            name="title"
            required
            maxLength={TITLE_MAX}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>

        <Field id="summary" label="한 줄 소개" hint="목록 카드에 이 문장이 나옵니다.">
          <TextInput
            id="summary"
            name="summary"
            maxLength={SUMMARY_MAX}
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="무엇을 어떻게 하는 스터디인지 한 문장으로"
          />
        </Field>

        <Field id="description" label="설명" required hint="누구와 무엇을 어떻게 할지 적어 주세요.">
          <TextArea
            id="description"
            name="description"
            maxLength={DESCRIPTION_MAX}
            required
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <FormSection title="분류와 장소">
          <FieldRow>
            <Field id="categoryId" label="카테고리" required>
              <Select
                id="categoryId"
                name="categoryId"
                required
                value={form.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="regionCode" label="지역" required>
              <Select
                id="regionCode"
                name="regionCode"
                required
                value={form.regionCode}
                onChange={(e) => set("regionCode", e.target.value)}
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>

          <FieldRow>
            <Field id="meetingMode" label="진행 방식" required>
              <Select
                id="meetingMode"
                name="meetingMode"
                value={form.meetingMode}
                onChange={(e) => set("meetingMode", e.target.value)}
              >
                {MEETING_MODES.map((m) => (
                  <option key={m} value={m}>
                    {MEETING_MODE_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              id="locationDetail"
              label="상세 위치"
              hint="상세 화면에만 나옵니다. 지역 필터는 이 값을 안 봅니다."
            >
              <TextInput
                id="locationDetail"
                name="locationDetail"
                maxLength={LOCATION_MAX}
                value={form.locationDetail}
                onChange={(e) => set("locationDetail", e.target.value)}
                placeholder="예: 강남 역삼역 스터디카페"
              />
            </Field>
          </FieldRow>
        </FormSection>

        <FormSection title="인원과 기간">
          <FieldRow columns={3}>
            <Field
              id="capacity"
              label="정원"
              required
              hint={
                study.filled > CAPACITY_MIN
                  ? `호스트를 포함한 수입니다. 지금 ${study.filled}명이 참여 중이라 그보다 적게 줄일 수 없습니다.`
                  : "호스트를 포함한 수입니다."
              }
            >
              <TextInput
                id="capacity"
                name="capacity"
                type="number"
                min={floor}
                max={CAPACITY_MAX}
                required
                value={form.capacity}
                onChange={(e) => set("capacity", e.target.value)}
              />
            </Field>

            <Field id="startsOn" label="시작하는 날">
              <TextInput
                id="startsOn"
                name="startsOn"
                type="date"
                value={form.startsOn}
                onChange={(e) => set("startsOn", e.target.value)}
              />
            </Field>

            <Field id="endsOn" label="끝나는 날">
              <TextInput
                id="endsOn"
                name="endsOn"
                type="date"
                value={form.endsOn}
                onChange={(e) => set("endsOn", e.target.value)}
              />
            </Field>
          </FieldRow>

          <Field
            id="recruitUntil"
            label="모집 마감일"
            hint="목록의 「마감 임박순」이 이 날짜를 봅니다. 비워 두면 기한 없음입니다."
          >
            <TextInput
              id="recruitUntil"
              name="recruitUntil"
              type="date"
              value={form.recruitUntil}
              onChange={(e) => set("recruitUntil", e.target.value)}
            />
          </Field>
        </FormSection>

        <FormSection
          title="모임 일정"
          hint="요일과 시간이 홈의 주간 플래너에 그대로 그려집니다. 줄을 비우면 그 일정이 지워집니다."
        >
          {slots.map((row, i) => (
            <FieldRow key={i} columns={3}>
              <Field id={`weekday${i}`} label={`${i + 1}번째 요일`}>
                <Select
                  id={`weekday${i}`}
                  name={`weekday${i}`}
                  value={row.weekday}
                  onChange={(e) => setSlot(i, "weekday", e.target.value)}
                >
                  <option value="">없음</option>
                  {WEEKDAY_NAMES.map((name, w) => (
                    <option key={w} value={w}>
                      {name}요일
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id={`startsAt${i}`} label={`${i + 1}번째 시작`}>
                <TextInput
                  id={`startsAt${i}`}
                  name={`startsAt${i}`}
                  type="time"
                  value={row.startsAt}
                  onChange={(e) => setSlot(i, "startsAt", e.target.value)}
                />
              </Field>
              <Field id={`endsAt${i}`} label={`${i + 1}번째 끝`}>
                <TextInput
                  id={`endsAt${i}`}
                  name={`endsAt${i}`}
                  type="time"
                  value={row.endsAt}
                  onChange={(e) => setSlot(i, "endsAt", e.target.value)}
                />
              </Field>
            </FieldRow>
          ))}
        </FormSection>

        <FormActions>
          <Button tone="ink" size="lg" block type="submit" disabled={pending}>
            {pending ? "저장하는 중…" : "저장하기"}
          </Button>
          {/* 한 패널에 잉크 버튼은 하나다 — 돌아가기는 테두리 */}
          <ButtonLink href={`/studies/${study.id}`} size="lg" block>
            고치지 않고 돌아가기
          </ButtonLink>
        </FormActions>
      </form>
    </FormCard>
  );
}
