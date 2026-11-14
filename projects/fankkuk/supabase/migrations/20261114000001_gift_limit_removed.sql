-- 2026-11-14 팬 1명당 월 선물 한도 없앰 (사용자 「팬 한명당 선물 한도는 필요 없고」, DECISIONS 2026-11-14).
-- 설정 화면에서 한도 칸을 뺐다 — 이미 켜 둔 한도가 남아 있으면 끌 화면이 없는데도 팬 등록이 막힌다.
-- 그래서 모든 크리에이터의 한도를 끄고(null), 다시 켜지지 않게 칸을 null 로만 묶는다.
-- 등록 함수의 한도 검사와 한도 판정 함수(my_gift_limit_reached)는 한도가 null 이면 아무것도 하지 않으므로 그대로 둔다.
-- 칸·함수를 지우는 것은 별개 정리(BACKLOG).

update public.creators set monthly_fan_limit = null where monthly_fan_limit is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creators_monthly_fan_limit_off' and conrelid = 'public.creators'::regclass) then
    alter table public.creators add constraint creators_monthly_fan_limit_off check (monthly_fan_limit is null);
  end if;
end $$;
