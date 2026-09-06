"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { EditablePost } from "@/entities/post";
import { CONTENT_MAX, SUMMARY_MAX, TITLE_MAX } from "@/entities/post/model/limits";
import { Button, ButtonLink } from "@/shared/ui/button/Button";
import { FormCard } from "@/shared/ui/form-page";
import { Field, FormActions, FormError, TextArea, TextInput } from "@/shared/ui/field/Field";
import type { ActionResult } from "@/shared/lib/action-result";
import { updatePostAction } from "../api/edit-post";
import styles from "./edit-post.module.css";

/**
 * 고칠 수 있는 것은 세 칸이다 — 제목 · 한 줄 소개 · 내용.
 *
 * **어느 스터디의 글인지는 칸이 아니라 글로 적는다.** 작성 화면에는 스터디를 고르는
 * 선택칸이 있어서, 수정 화면에서 그 칸이 그냥 사라지면 사용자는 「옮길 수 있는데 여기
 * 없는 건가」로 읽는다. 못 옮긴다는 것이 계약이므로(INV-Z8) 그 사실을 화면이 말한다.
 */
export function EditPostForm({ post }: { post: EditablePost }) {
  const [result, submit, pending] = useActionState<ActionResult<string> | null, FormData>(
    updatePostAction,
    null,
  );

  // **입력칸을 React 가 들고 있어야 실패해도 적은 것이 남는다.** `<form action={…}>` 은
  // 액션이 끝나면 제어되지 않는 입력칸을 초기화한다. 액션이 실패를 **반환**하면(던지지
  // 않는다) React 는 정상 종료로 보므로, `defaultValue` 만 쓰면 오류 문구와 함께 **칸이
  // 저장된 옛 값으로 되돌아간다** — 방금 고쳐 쓴 것이 통째로 사라진다.
  //
  // 2026-09-06 에 브라우저에서 실측했다: 제목을 비우고 제출하니 오류는 떴는데 본문에
  // 새로 적은 문장이 사라지고 저장돼 있던 문장이 다시 들어와 있었다. 사용자가 실제로
  // 만나는 실패는 세션 만료와 데이터베이스 거부인데, **하필 그 둘은 다시 적을 이유가
  // 없는 실패다.**
  const [title, setTitle] = useState(post.title);
  const [summary, setSummary] = useState(post.summary ?? "");
  const [content, setContent] = useState(post.content);

  return (
    <FormCard>
      <form action={submit}>
        {result && !result.ok ? <FormError message={result.message} /> : null}

        {/* 어느 글을 고치는지. 서버는 이 값과 **세션의 작성자**를 함께 보고 좁힌다 —
            여기에 남의 글 id 를 넣어도 그 글은 안 걸린다 (INV-Z3) */}
        <input type="hidden" name="postId" value={post.id} />

        <div className={styles.fixed}>
          <span className={styles.fixedLabel}>이 모집글이 붙은 스터디</span>
          {/* 눌러서 확인하러 갈 수 있게 한다 — 「이 글이 어디 붙어 있는지」를 이 화면을
              떠나지 않고는 알 수 없던 자리다 (2026-09-06 code-reviewer) */}
          <p className={styles.fixedValue}>
            <Link href={`/studies/${post.studyId}`}>{post.studyTitle}</Link>
          </p>
          <p className={styles.fixedHint}>
            모집글은 다른 스터디로 옮길 수 없습니다. 다른 스터디의 모집글이 필요하면 새로
            써 주세요.
          </p>
        </div>

        <Field id="title" label="제목" required>
          <TextInput
            id="title"
            name="title"
            required
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
            {pending ? "저장하는 중…" : "저장하기"}
          </Button>
          {/* 한 패널에 잉크 버튼은 하나다 — 돌아가기는 테두리 */}
          <ButtonLink href={`/posts/${post.id}`} size="lg" block>
            고치지 않고 돌아가기
          </ButtonLink>
        </FormActions>
      </form>
    </FormCard>
  );
}
