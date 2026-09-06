import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { revalidateEntityPath } from "@/shared/lib/revalidate-entity";

/**
 * 서버 액션의 조립 함수가 받는 것들. **한 자리에만 둔다.**
 *
 * 전에는 구조가 똑같은 타입이 `ApplyDeps`·`ManageDeps`·`ChatDeps` 세 이름으로 세 번
 * 선언돼 있었다. TypeScript 는 구조로 판정하므로 이름 셋이 아무것도 가르지 못하면서,
 * 의존이 하나 늘 때 고칠 자리만 셋으로 늘렸다 (2026-09-06 code-reviewer).
 *
 * **위치 인자가 아니라 객체인 이유**는 앞으로 늘어날 자리가 있어서다(시계·id 생성기).
 * 위치 인자는 셋째부터 호출부에서 무엇인지 안 읽힌다.
 */
export type ActionDeps = {
  readonly createSupabase: typeof createServerSupabase;
  readonly revalidate: typeof revalidateEntityPath;
};

/** 데이터베이스를 안 건드리는 조립이 받는 절반 */
export type ReadDeps = Pick<ActionDeps, "createSupabase">;

/**
 * id 가 없는 고정 경로를 다시 받게 하는 조립이 받는 것. `revalidateEntityPath` 는 id 를
 * 요구해서 「/profile」 같은 자리에 안 맞는다.
 */
export type PathDeps = {
  readonly createSupabase: ActionDeps["createSupabase"];
  readonly revalidatePaths: (...paths: string[]) => void;
};
