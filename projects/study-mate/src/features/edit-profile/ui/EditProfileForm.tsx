"use client";

import { useActionState } from "react";
import type { Category } from "@/entities/category";
import type { ProfileCard } from "@/entities/profile";
import type { Region } from "@/entities/region";
import type { ActionResult } from "@/shared/lib/action-result";
import { Button, ButtonLink } from "@/shared/ui/button/Button";
import { Card } from "@/shared/ui/card/Card";
import {
  Field,
  FormActions,
  FormError,
  FormNotice,
  Select,
  TextArea,
  TextInput,
} from "@/shared/ui/field/Field";
import { saveProfileAction } from "../api/edit-profile-action";
import { AVATAR_MAX_LABEL, AVATAR_TYPES, USERNAME_MAX } from "../model/limits";
import styles from "./edit-profile.module.css";

export function EditProfileForm({
  profile,
  regions,
  categories,
}: {
  profile: ProfileCard;
  regions: readonly Region[];
  categories: readonly Category[];
}) {
  const [result, submit, pending] = useActionState<ActionResult<null> | null, FormData>(
    saveProfileAction,
    null,
  );

  return (
    <Card className={styles.card}>
      <form action={submit}>
        {result && !result.ok ? <FormError message={result.message} /> : null}
        {result?.ok ? <FormNotice>저장했습니다.</FormNotice> : null}

        <Field id="username" label="이름" required>
          <TextInput
            id="username"
            name="username"
            required
            maxLength={USERNAME_MAX}
            defaultValue={profile.username}
          />
        </Field>

        <Field
          id="bio"
          label="소개"
          hint="어떤 공부를 하고 있는지, 어떤 사람과 하고 싶은지 적어 주세요."
        >
          <TextArea id="bio" name="bio" defaultValue={profile.bio ?? ""} />
        </Field>

        <Field id="region" label="지역" hint="모집글을 지역으로 찾을 때 쓰는 값과 같은 목록입니다.">
          <Select id="region" name="region" defaultValue={profile.regionCode ?? ""}>
            <option value="">고르지 않음</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="interest" label="관심 분야">
          <Select id="interest" name="interest" defaultValue={profile.interestCategoryId ?? ""}>
            <option value="">고르지 않음</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="avatar"
          label="프로필 사진"
          hint={`PNG · JPG · WEBP, ${AVATAR_MAX_LABEL}까지. 고르지 않으면 지금 사진이 그대로 있습니다.`}
        >
          {/* 형식·크기의 강제 위치는 여기가 아니라 저장소다(INV-E4). 이 속성은 파일 고르는
              창을 좁혀 주는 편의고, 앱을 우회한 업로드는 같은 자리에서 막힌다 */}
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept={AVATAR_TYPES.join(",")}
            className={styles.file}
          />
        </Field>

        <FormActions>
          <Button tone="ink" size="lg" block type="submit" disabled={pending}>
            {pending ? "저장하는 중…" : "저장하기"}
          </Button>
          {/* 한 패널에 잉크 버튼은 하나다 — 돌아가기는 테두리 */}
          <ButtonLink href="/profile" size="lg" block>
            프로필로 돌아가기
          </ButtonLink>
        </FormActions>
      </form>
    </Card>
  );
}
