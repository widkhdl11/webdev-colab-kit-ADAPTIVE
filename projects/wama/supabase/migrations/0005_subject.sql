-- 0005: subject 엔티티 — 학원이 관리하는 과목 목록 (첫 실제 CRUD 엔티티)
-- 격리는 0001 패턴 그대로: academy_id 스코프 + RLS(INV-A1/A2/A3). schedule/evaluation 의 subject 컬럼은
-- 여전히 자유 문자열(FK 없음) — 과목 삭제는 이 목록에서만 제거되고, 기존 시간표·평가 기록의 문자열은 유지된다.

create table subject (
  id         uuid primary key default gen_random_uuid(),
  -- academy_id 는 서버가 강제한다: 기본값 current_academy_id() 로 요청자 학원을 채우고(클라이언트가 안 보냄),
  -- WITH CHECK 로 위조 값을 거부한다 (INV-A3). 0004 의 search_path 하드닝이 current_academy_id() 에 이미 적용됨.
  academy_id uuid not null default current_academy_id() references academy(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (academy_id, name)                                  -- 학원 내 과목명 중복 금지
);
create index subject_academy_idx on subject(academy_id);

alter table subject enable row level security;

-- student/schedule/evaluation 과 동일한 학원격리 CRUD 정책 (INV-A1: authenticated / A2: USING / A3: WITH CHECK)
create policy subject_all on subject for all to authenticated
  using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

-- 기존 학원의 현행 기본 과목 목록을 시드 → 마이그레이션 후에도 드롭다운이 비지 않는다.
-- 신규 학원은 빈 상태로 시작해 각자 큐레이션한다(과목은 학원별 설정). 중복은 무시.
insert into subject (academy_id, name)
select a.id, s.name
from academy a
cross join (values
  ('초등 수학'), ('수학(공통)'), ('미적분'), ('확률과 통계'), ('기하'), ('심화 문제풀이')
) as s(name)
-- risk-surface-exempt: concurrency 초기 과목 시드. on conflict 는 마이그레이션 재실행 안전용이며 경합하는 쓰기 경로가 아니다
on conflict (academy_id, name) do nothing;
