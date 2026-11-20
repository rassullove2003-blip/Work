# Архитектура UniItalia

## Компоненты

```
┌──────────────┐     anon key + JWT      ┌──────────────────────────────┐
│ Мобильное    │ ──────────────────────▶ │ Supabase                      │
│ приложение   │                         │  PostgreSQL + RLS             │
│ (Expo)       │                         │  Auth (email/пароль)          │
└──────────────┘                         │  Storage: student-documents   │
┌──────────────┐     anon key + JWT      │  (приватный, 10 МБ, PDF/JPG)  │
│ Админ-панель │ ──────────────────────▶ │                              │
│ (Next.js)    │                         └──────────────────────────────┘
└──────────────┘
      ▲  оба используют packages/shared: типы, справочники, поиск/фильтры, демо-данные
```

* Ключ `service_role` нигде в клиентах не используется. Права определяются только политиками RLS.
* Роль сотрудника — строка в `admin_users`; её может добавить только администратор.
* Без переменных Supabase мобильное приложение работает в **демо-режиме** на встроенных данных
  (избранное хранится на устройстве, вход недоступен — об этом прямо написано в интерфейсе).

## Данные

| Группа | Таблицы |
|---|---|
| Пользователи и роли | `student_profiles`, `admin_users` (+ `auth.users`) |
| Каталог | `universities`, `university_images`, `faculties`, `degree_programs`, `program_curricula` |
| Версии по учебным годам | `program_editions` (стоимость, места), `admission_requirements`, `admission_deadlines`, `scholarship_eligibility` |
| Справочники | `entrance_exams`, `scholarships`, `university_scholarships`, `verified_sources` |
| Личное | `saved_universities`, `saved_programs`, `university_comparisons`, `student_applications`, `application_tasks`, `student_documents`, `notifications` |
| Сервис | `consultation_requests`, `audit_logs` |

Каждый редактируемый факт имеет `academic_year`, `source_url`, `verified_at`, `verification_status`,
`last_edited_by`, `status` (draft/published/archived). Триггеры:
* `touch_editable_row` — проставляет `updated_at` и `last_edited_by`, запрещает статус «verified» без источника и даты;
* `write_audit_log` — пишет старое и новое значение в `audit_logs`;
* `handle_new_user` — создаёт профиль при регистрации.

Представление `program_catalog` (security_invoker) отдаёт программу со стоимостью последнего опубликованного года.

## Политики RLS (проверены `npm run test:db`)

* Каталог: читают все, но только `published`; персонал видит черновики; писать — admin/editor; удалять — admin.
* Личные таблицы: только `user_id = auth.uid()`.
* Журнал: читает только admin; писать может только триггер.
* Заявки на консультацию: создать может любой (с согласием), читает персонал и автор.
* Storage: файл доступен, только если путь начинается с `auth.uid()`.

## Мобильное приложение

* `src/lib/catalog.tsx` — загрузка каталога (Supabase или демо-данные), индексы по slug.
* `src/lib/filters.tsx` — состояние поиска, сохраняется в AsyncStorage.
* `src/lib/favorites.tsx` — избранное: сервер / устройство / «нужен вход».
* `src/lib/auth.tsx` — Supabase Auth, профиль, экспорт и удаление аккаунта, ошибки на русском.
* Поиск и фильтрация выполняются на клиенте общей функцией `filterPrograms` из `packages/shared`
  (для сотен записей этого достаточно; при росте каталога — перенести в SQL/полнотекстовый индекс).
