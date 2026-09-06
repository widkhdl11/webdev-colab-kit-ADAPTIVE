"use client";

import { useActionState, useState } from "react";
import type { PostableStudy } from "@/entities/study";
import { Button, ButtonLink } from "@/shared/ui/button/Button";
import { FormCard } from "@/shared/ui/form-page";
import {
  Field,
  FormActions,
  FormError,
  Select,
  TextArea,
  TextInput,
} from "@/shared/ui/field/Field";
import type { ActionResult } from "@/shared/lib/action-result";
import { createPostAction } from "../api/create-post";
import { CONTENT_MAX, SUMMARY_MAX, TITLE_MAX } from "@/entities/post/model/limits";
import styles from "./create-post.module.css";

export function CreatePostForm({
  studies,
  defaultStudyId,
}: {
  studies: readonly PostableStudy[];
  defaultStudyId?: string;
}) {
  const [result, submit, pending] = useActionState<ActionResult<string> | null, FormData>(
    createPostAction,
    null,
  );

  // **입력칸을 React 가 들고 있어야 실패해도 적은 것이 남는다.** `<form action={…}>` 은
  // 액션이 끝나면 제어되지 않는 입력칸을 초기화하고, 액션이 실패를 **반환**하면(던지지
  // 않는다) React 는 그것을 정상 종료로 본다. 수정 폼은 `defaultValue` 가 있어 옛 값으로
  // 되돌아가는 데 그치지만 **작성 폼은 빈칸이 된다** — 본문 4000자가 통째로 사라진다
  // (2026-09-06 브라우저 실측 · code-reviewer).
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");

  // 고를 스터디가 하나도 없으면 폼을 그리지 않는다. 빈 목록을 띄워 두면 다 적은 뒤에
  // 「고를 수 없음」으로 막힌다 — 막을 거면 적기 전에 막는 것이 맞다.
  //
  // 목록이 비는 이유는 둘이다 — 만든 스터디가 아예 없거나, 있는데 전부 모집 중이 아니거나
  // (INV-Z14). 화면은 그 둘을 구분할 근거가 없으므로 둘 다 맞는 문장으로 적는다.
  if (studies.length === 0) {
    return (
      <FormCard>
        <p className={styles.empty}>
          모집글은 <strong>내가 만든 모집 중인 스터디</strong>에만 붙일 수 있습니다. 지금
          고를 수 있는 스터디가 없습니다 — 새로 만들거나, 마감한 스터디라면 모집을 다시 열어
          주세요.
        </p>
        <div className={styles.emptyActions}>
          <ButtonLink href="/studies/create" tone="ink" size="lg" block>
            스터디 만들러 가기
          </ButtonLink>
        </div>
      </FormCard>
    );
  }

  const preselected = studies.some((s) => s.id === defaultStudyId) ? defaultStudyId : "";
  // 스터디 상세의 「모집글 쓰기」로 왔는데 그 사이 스터디가 지워졌으면, 사용자는 자기가 온
  // 맥락이 사라진 것을 모른 채 빈 선택칸을 본다. 조용히 실패하지 않게 힌트를 바꾼다.
  const lostPreselect = defaultStudyId !== undefined && preselected === "";

  return (
    <FormCard>
      <form action={submit}>
        {result && !result.ok ? <FormError message={result.message} /> : null}

        <Field
          id="studyId"
          label="모집글을 붙일 스터디"
          required
          hint={
            lostPreselect
              ? "고르려던 스터디를 지금은 고를 수 없습니다 — 마감했거나 정원이 찼습니다."
              : "내가 만든 스터디 중 모집 중인 것만 나옵니다."
          }
        >
          <Select id="studyId" name="studyId" required defaultValue={preselected}>
            <option value="" disabled>
              고르기
            </option>
            {studies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="title" label="제목" required>
          <TextInput
            id="title"
            name="title"
            required
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 토익 900 목표, 새벽 6시에 같이 하실 분"
          />
        </Field>

        <Field id="summary" label="한 줄 소개" hint="목록 카드에 이 문장이 나옵니다.">
          <TextInput
            id="summary"
            name="summary"
            maxLength={SUMMARY_MAX}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="어떤 사람과 무엇을 하고 싶은지 한 문장으로"
          />
        </Field>

        <Field
          id="content"
          label="내용"
          required
          hint="모이는 시간·진도·준비물처럼 신청 전에 알아야 할 것을 적어 주세요."
        >
          <TextArea
            id="content"
            name="content"
            required
            maxLength={CONTENT_MAX}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>

        <FormActions>
          <Button tone="ink" size="lg" block type="submit" disabled={pending}>
            {pending ? "올리는 중…" : "모집글 올리기"}
          </Button>
        </FormActions>
      </form>
    </FormCard>
  );
}
