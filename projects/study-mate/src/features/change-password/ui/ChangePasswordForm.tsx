"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/shared/lib/action-result";
import { Button, ButtonLink } from "@/shared/ui/button/Button";
import { Card } from "@/shared/ui/card/Card";
import { Field, FormActions, FormError, FormNotice, TextInput } from "@/shared/ui/field/Field";
import { changePasswordAction } from "../api/change-password-action";
import type { PasswordChanged } from "../api/change-password";
import styles from "./change-password.module.css";

export function ChangePasswordForm() {
  const [result, submit, pending] = useActionState<ActionResult<PasswordChanged> | null, FormData>(
    changePasswordAction,
    null,
  );

  return (
    <Card className={styles.card}>
      <form action={submit}>
        {result && !result.ok ? <FormError message={result.message} /> : null}
        {/* **끊었다고 단언하지 않는다.** 끊기가 실패했는데 성공 문구가 그대로 나가면,
            비밀번호를 바꾼 이유(남이 들어온 것 같다)가 무효인 채로 사용자만 안심한다.
            비밀번호는 이미 바뀌었으므로 실패로 뒤집지도 않는다 */}
        {result?.ok ? (
          <FormNotice>
            {result.value.othersSignedOut ? (
              <>
                비밀번호를 바꿨습니다. <strong>다른 기기의 로그인은 끊었습니다</strong> — 이
                기기는 그대로 쓸 수 있습니다.
              </>
            ) : (
              <>
                비밀번호는 바뀌었습니다. 다만 <strong>다른 기기의 로그인은 끊지 못했습니다</strong>
                {" "}— 잠시 뒤 다시 시도해 주세요.
              </>
            )}
          </FormNotice>
        ) : null}

        <Field
          id="current"
          label="지금 비밀번호"
          required
          hint="이 창을 쓰는 사람이 계정 주인인지 확인합니다."
        >
          <TextInput
            id="current"
            name="current"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>

        <Field
          id="next"
          label="새 비밀번호"
          required
          hint="바꾸면 다른 기기에서는 다시 로그인해야 합니다."
        >
          <TextInput id="next" name="next" type="password" required autoComplete="new-password" />
        </Field>

        <FormActions>
          <Button tone="ink" size="lg" block type="submit" disabled={pending}>
            {pending ? "바꾸는 중…" : "비밀번호 바꾸기"}
          </Button>
          <ButtonLink href="/profile" size="lg" block>
            프로필로 돌아가기
          </ButtonLink>
        </FormActions>
      </form>
    </Card>
  );
}
