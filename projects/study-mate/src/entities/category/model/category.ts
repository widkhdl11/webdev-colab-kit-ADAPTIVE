export type Category = {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
};

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
  };
}
