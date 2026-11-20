-- Исправления по Supabase Security Advisor:
-- явный search_path у функций и запрет вызова служебных триггерных функций через API.
alter function public.touch_editable_row() set search_path = public;
alter function public.touch_row() set search_path = public;
alter function public.is_staff() set search_path = public;
alter function public.is_admin() set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.write_audit_log() from public, anon, authenticated;
