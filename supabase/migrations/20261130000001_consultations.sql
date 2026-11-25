-- Заявки «Получить помощь с поступлением»: заметка сотрудника, кто взял в работу,
-- уведомление сотрудникам о новой заявке, защита от повторных отправок.
alter table public.consultation_requests add column if not exists staff_note text check (char_length(staff_note) <= 2000);
alter table public.consultation_requests add column if not exists handled_by uuid references auth.users (id) on delete set null;
alter table public.consultation_requests add column if not exists updated_at timestamptz not null default now();
alter table public.consultation_requests add column if not exists source text check (char_length(source) <= 200);
create index if not exists consultation_requests_created_idx on public.consultation_requests (created_at desc);

create or replace function public.consultation_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- не больше 3 заявок с одного контакта за сутки
    if (select count(*) from public.consultation_requests
        where lower(contact) = lower(new.contact) and created_at > now() - interval '1 day') >= 3 then
      raise exception 'too many requests';
    end if;
    new.status := 'new'; new.staff_note := null; new.handled_by := null;
  else
    if new.status is distinct from old.status and new.status = 'in_progress' and new.handled_by is null then
      new.handled_by := auth.uid();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger consultation_requests_before before insert or update on public.consultation_requests
  for each row execute function public.consultation_before();

create or replace function public.notify_new_consultation() returns trigger
language plpgsql security definer set search_path = public as $$
declare staff record;
begin
  for staff in select user_id from public.admin_users loop
    perform public.notify_user(staff.user_id, 'task', 'Новая заявка на консультацию: ' || left(new.name, 80),
      left(concat_ws(' · ', new.country, new.education_level, new.field), 300), '/admin/consultations');
  end loop;
  return new;
end;
$$;
revoke execute on function public.notify_new_consultation() from public, anon, authenticated;
create trigger consultation_requests_notify after insert on public.consultation_requests
  for each row execute function public.notify_new_consultation();
