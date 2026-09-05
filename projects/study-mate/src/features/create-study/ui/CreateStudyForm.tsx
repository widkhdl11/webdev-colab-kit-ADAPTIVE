"use client";

import { useActionState } from "react";
import type { Category } from "@/entities/category";
import type { Region } from "@/entities/region";
import { Button } from "@/shared/ui/button/Button";
import { Card } from "@/shared/ui/card/Card";
import {
  Field,
  FieldRow,
  FormError,
  FormSection,
  Select,
  TextArea,
  TextInput,
} from "@/shared/ui/field/Field";
import { WEEKDAY_NAMES } from "@/shared/lib/schedule";
import type { ActionResult } from "@/shared/lib/action-result";
import { createStudyAction } from "../api/create-study";
import styles from "./create-study.module.css";

const MODES = [
  { value: "offline", label: "오프라인" },
  { value: "online", label: "온라인" },
  { value: "hybrid", label: "온라인 병행" },
] as const;

/** 모임 일정 세 줄. 더 필요하면 만든 뒤 수정 화면에서 늘린다 */
const SLOT_ROWS = [0, 1, 2];

export function CreateStudyForm({
  categories,
  regions,
}: {
  categories: readonly Category[];
  regions: readonly Region[];
}) {
  const [result, submit, pending] = useActionState<ActionResult<string> | null, FormData>(
    createStudyAction,
    null,
  );

  return (
    <Card className={styles.card}>
      <form action={submit}>
        {result && !result.ok ? <FormError message={result.message} /> : null}

        <Field id="title" label="스터디 이름" required>
          <TextInput id="title" name="title" required maxLength={60} placeholder="예: 토익 900 목표 새벽반" />
        </Field>

        <Field id="summary" label="한 줄 소개" hint="목록 카드에 이 문장이 나옵니다.">
          <TextInput
            id="summary"
            name="summary"
            maxLength={80}
            placeholder="무엇을 어떻게 하는 스터디인지 한 문장으로"
          />
        </Field>

        <Field id="description" label="설명" required hint="누구와 무엇을 어떻게 할지 적어 주세요.">
          <TextArea id="description" name="description" required placeholder="" />
        </Field>

        <FormSection title="분류와 장소">
          <FieldRow>
            <Field id="categoryId" label="카테고리" required>
              <Select id="categoryId" name="categoryId" required defaultValue="">
                <option value="" disabled>
                  고르기
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="regionCode" label="지역" required>
              <Select id="regionCode" name="regionCode" required defaultValue="">
                <option value="" disabled>
                  고르기
                </option>
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
              <Select id="meetingMode" name="meetingMode" defaultValue="offline">
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
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
                maxLength={60}
                placeholder="예: 강남 역삼역 스터디카페"
              />
            </Field>
          </FieldRow>
        </FormSection>

        <FormSection title="인원과 기간">
          <FieldRow columns={3}>
            <Field id="capacity" label="정원" required hint="호스트를 포함한 수입니다.">
              <TextInput
                id="capacity"
                name="capacity"
                type="number"
                min={2}
                max={100}
                defaultValue={5}
                required
              />
            </Field>

            <Field id="startsOn" label="시작하는 날">
              <TextInput id="startsOn" name="startsOn" type="date" />
            </Field>

            <Field id="endsOn" label="끝나는 날">
              <TextInput id="endsOn" name="endsOn" type="date" />
            </Field>
          </FieldRow>

          <Field
            id="recruitUntil"
            label="모집 마감일"
            hint="목록의 「마감 임박순」이 이 날짜를 봅니다. 비워 두면 기한 없음입니다."
          >
            <TextInput id="recruitUntil" name="recruitUntil" type="date" />
          </Field>
        </FormSection>

        <FormSection
          title="모임 일정"
          hint="요일과 시간이 홈의 주간 플래너에 그대로 그려집니다. 나중에 수정에서 늘릴 수 있습니다."
        >
          {SLOT_ROWS.map((i) => (
            <FieldRow key={i} columns={3}>
              <Field id={`weekday${i}`} label={`${i + 1}번째 요일`}>
                <Select id={`weekday${i}`} name={`weekday${i}`} defaultValue="">
                  <option value="">없음</option>
                  {WEEKDAY_NAMES.map((name, w) => (
                    <option key={w} value={w}>
                      {name}요일
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id={`startsAt${i}`} label="시작">
                <TextInput id={`startsAt${i}`} name={`startsAt${i}`} type="time" />
              </Field>
              <Field id={`endsAt${i}`} label="끝">
                <TextInput id={`endsAt${i}`} name={`endsAt${i}`} type="time" />
              </Field>
            </FieldRow>
          ))}
        </FormSection>

        <div className={styles.actions}>
          <Button tone="ink" size="lg" block type="submit" disabled={pending}>
            {pending ? "만드는 중…" : "스터디 만들기"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
