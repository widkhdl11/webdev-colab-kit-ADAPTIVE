import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { throwDbError } from "@/shared/lib/db-error";
import type { MyNotification } from "../model/notification";

/**
 * 한 번에 가져오는 줄 수. 알림에는 별도 페이지가 없어서(`docs/IA.md`) 더 보기를 두지
 * 않는다 — 이 수만큼 주고 그 아래는 패널 안에서 스크롤한다.
 *
 * **100 인 이유는 INV-N8 이다.** 종 옆 숫자는 패널이 안 읽음으로 그리는 줄에서 나오는데,
 * 여기서 자른 만큼 둘이 어긋난다. 종 옆 숫자는 99 를 넘으면 「99+」로 적으므로, **안 읽은
 * 것을 100 개까지 담으면** 사용자가 볼 수 있는 모든 경우에 둘이 맞는다.
 *
 * **그래서 자르는 기준이 「최근」이 아니라 「안 읽은 것 먼저」다** — 아래 정렬을 볼 것.
 *
 * **이 수를 올릴 때 같이 커지는 것이 있다**: `visibleStudyIds` 의 `.in()` 은 질의 문자열로
 * 나가고 uuid 하나가 38자 남짓이라, 500 이면 19KB 가 되어 서버·프록시의 헤더 길이 제한에
 * 걸린다. 그때 증상은 「알림 링크가 전부 사라짐」이라 원인과 안 이어진다.
 */
export const NOTIFICATION_PAGE_SIZE = 100;

type Row = {
  id: unknown;
  type: unknown;
  title: unknown;
  reference_type: unknown;
  reference_id: unknown;
  read_at: unknown;
  created_at: unknown;
};

/**
 * 내 알림 목록. **누구 것인지는 조건에 안 적는다** — 그 판정의 주인은 접근 정책
 * (`notifications_read_own`)이고, 앱이 같은 조건을 한 벌 더 들고 있으면 진짜 방벽이
 * 어디인지 흐려진다(안 읽은 수를 세는 판독기와 같은 판단이다).
 *
 * **링크는 여기서 정한다**(INV-N7). 알림 행은 참조 대상에 외래 키가 없어서, 가리키는
 * 스터디가 지워졌어도 알림은 그대로 남는다. 그 줄에 링크를 그리면 누르지 않아도 Next 의
 * 미리 가져오기가 404 를 만든다 — 2026-09-07 에 `/about` 이 없어서 났던 것과 같은 모양이다.
 * 그래서 **가리키는 스터디가 지금 그 사람에게 보이는지 한 번 물어보고**, 안 보이면 주소를
 * 안 준다. 판정은 여기서 하지 않는다: `studies` 조회 정책이 「안 지워졌거나 내가 호스트」를
 * 이미 알고 있으므로, 물어서 돌아온 id 가 곧 보이는 것들이다.
 *
 * **그 질의는 `id` 만 가져온다.** 제목을 같이 읽어 문장에 쓰면 INV-N6 이 깨진다 —
 * 스터디 이름이 바뀔 때 지난 알림의 문장까지 바뀐다.
 *
 * **자르는 기준이 「안 읽은 것 먼저」인 이유**(INV-N8): 「최근 100줄」로 자르면, 알림이
 * 300건이고 최근 100건이 전부 읽음인 사람에게 **종 옆 숫자가 50인데 패널의 안 읽음 줄이
 * 0** 인 상태가 만들어진다. 그 상태에서는 화면이 숫자를 0 으로 바꿔 버리고 「전체 읽음」도
 * 비활성이 되어 **그 50건을 지울 손잡이가 화면에서 사라진다**(2026-09-08 code-reviewer).
 * 그래서 안 읽은 것부터 담고, 화면에 줄 때 다시 시간순으로 세운다 — 보이는 순서는 그대로다.
 */
export async function readMyNotifications(
  createSupabase: typeof createServerSupabase = createServerSupabase,
  limit: number = NOTIFICATION_PAGE_SIZE,
): Promise<readonly MyNotification[]> {
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, reference_type, reference_id, read_at, created_at")
    // 안 읽은 것 먼저(위 주석), 그 안에서 최근 것 먼저.
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    // 같은 시각에 만들어진 두 줄의 순서가 요청마다 뒤바뀌지 않게 마지막 기준을 둔다
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throwDbError("알림 목록", error);

  // **모양을 먼저 거른다.** 버려질 줄의 참조 id 가 아래 가시성 질의에 실릴 이유가 없다.
  const rows = ((data ?? []) as unknown as Row[]).filter(hasShape);
  const studyIds = [
    ...new Set(
      rows
        .filter((r) => r.reference_type === "study" && typeof r.reference_id === "string")
        .map((r) => r.reference_id as string),
    ),
  ];

  const lookup = await visibleStudyIds(supabase, studyIds);

  return rows.map((row) => {
    const 스터디를가리킨다 =
      row.reference_type === "study" && typeof row.reference_id === "string";
    const 보인다 = 스터디를가리킨다 && lookup.ok && lookup.visible.has(row.reference_id as string);
    return {
      id: row.id as string,
      type: row.type as string,
      title: row.title as string,
      createdAt: row.created_at as string,
      readAt: typeof row.read_at === "string" ? row.read_at : null,
      href: 보인다 ? `/studies/${row.reference_id as string}` : null,
      // **못 물어본 것을 「사라졌다」로 적지 않는다.** 링크는 어느 쪽이든 안 걸지만,
      // 화면이 이유를 말하는 것은 확인했을 때뿐이다.
      gone: 스터디를가리킨다 && lookup.ok && !lookup.visible.has(row.reference_id as string),
    };
  })
    // **화면에 주는 순서는 시간순이다.** 위에서 안 읽음을 먼저 담은 것은 자르는 기준일
    // 뿐이고, 목록이 읽음 여부로 두 덩이로 갈려 보이면 사용자가 순서를 못 읽는다.
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/**
 * **모양이 어긋난 줄은 던지지 않고 뺀다.** 다른 판독기들은 던지는데(화면이 그 값 하나로
 * 이루어져 있어서 빈칸이 곧 거짓말이다) 알림은 목록이고, 한 줄이 이상하다고 종 아이콘
 * 아래가 통째로 비면 나머지 열아홉 줄을 못 본다. 안 읽은 수를 세는 판독기가 실패를 0 으로
 * 접은 것과 같은 방향이다.
 */
function hasShape(row: Row): boolean {
  return (
    typeof row.id === "string" &&
    typeof row.type === "string" &&
    typeof row.title === "string" &&
    typeof row.created_at === "string"
  );
}

/**
 * 물어본 결과. **「못 물어봤다」를 「없다」와 같은 값으로 접지 않는다** — 접으면 조회가
 * 한 번 실패했을 때 살아 있는 스터디 전부가 「지워졌다」로 화면에 나간다.
 */
type StudyLookup = { readonly ok: true; readonly visible: ReadonlySet<string> } | { readonly ok: false };

async function visibleStudyIds(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  ids: readonly string[],
): Promise<StudyLookup> {
  if (ids.length === 0) return { ok: true, visible: new Set() };

  const { data, error } = await supabase.from("studies").select("id").in("id", ids);
  // **여기서 실패하면 링크를 안 준다.** 알림 문장은 그대로 보이고 누를 수만 없어진다 —
  // 반대로 접으면(전부 링크로) 지워진 스터디로 가는 죽은 링크가 화면에 들어간다.
  if (error) {
    console.error("[db] 알림 링크 판정 실패 — 링크 없이 그린다:", error.message);
    return { ok: false };
  }
  return {
    ok: true,
    visible: new Set(
      ((data ?? []) as { id?: unknown }[])
        .map((r) => r.id)
        .filter((id): id is string => typeof id === "string"),
    ),
  };
}
