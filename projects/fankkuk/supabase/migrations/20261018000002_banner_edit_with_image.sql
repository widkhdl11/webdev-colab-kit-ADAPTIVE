-- 광고 배너 — 고칠 때 글과 그림을 한 처리로 바꾼다 (docs/specs/banners.md INV-Y1·Y4·Y10, 2026-10-18 리뷰).
-- 전에는 서버가 글 저장 → 그림 올리기 → 그림 바꾸기 를 따로 불러, 그림 쪽이 실패하면 글만 바뀐 채 남았다.
-- 이제 서버는 그림을 먼저 올린 뒤 이 함수 하나를 부른다. 글·그림 둘 다 바뀌거나 둘 다 그대로다(기록 두 줄도 같은 처리 안에서).
-- 운영자 판정·검사·기록은 두 함수(admin_save_banner·admin_set_banner_image)가 그대로 한다. 돌려주는 값은 옛 그림 경로.

create function public.admin_edit_banner_with_image(
  p_id uuid, p_title text, p_description text, p_link text, p_is_ad boolean,
  p_starts_on date, p_ends_on date, p_image_path text
)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception '운영자만 배너를 바꾼다' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception '고칠 배너가 없다' using errcode = '22023';
  end if;
  perform public.admin_save_banner(p_id, p_title, p_description, p_link, p_is_ad, p_starts_on, p_ends_on, null);
  return public.admin_set_banner_image(p_id, p_image_path);
end $$;

revoke all on function public.admin_edit_banner_with_image(uuid, text, text, text, boolean, date, date, text) from public, anon;
grant execute on function public.admin_edit_banner_with_image(uuid, text, text, text, boolean, date, date, text) to authenticated;

notify pgrst, 'reload schema';
