# UniItalia: пошаговая инструкция со ссылками

Для человека без опыта программирования. Делайте шаги по порядку. Код лежит в ветке
[`claude/whatuni-app-review-f0fg0t`](https://github.com/rassullove2003-blip/Work/tree/claude/whatuni-app-review-f0fg0t).

> На iPad запустить проект нельзя: нужен компьютер (Mac или Windows). Если компьютера нет, используйте облачную
> среду [GitHub Codespaces](https://github.com/codespaces) (см. шаг 2, вариант Б).

---

## Шаг 0. Аккаунты

| Сервис | Ссылка | Цена |
|---|---|---|
| GitHub (код) | [github.com/signup](https://github.com/signup) | бесплатно |
| Supabase (база, вход) | [supabase.com/dashboard/sign-up](https://supabase.com/dashboard/sign-up) | бесплатно, [тарифы](https://supabase.com/pricing) |
| Expo (сборки) | [expo.dev/signup](https://expo.dev/signup) | бесплатно, [тарифы](https://expo.dev/pricing) |
| Vercel (админ-панель) | [vercel.com/signup](https://vercel.com/signup) | бесплатно (Hobby), [тарифы](https://vercel.com/pricing) |
| Apple Developer (App Store) | [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) | 99 $ в год |
| Google Play Console | [play.google.com/console/signup](https://play.google.com/console/signup) | 25 $ один раз |

Apple и Google нужны только для публикации в магазинах. Для разработки хватит первых четырёх.
Лимиты бесплатных тарифов меняются, сверяйтесь со страницами тарифов.

## Шаг 1. Установить программы на компьютер

1. **Node.js** версии 20 или новее (кнопка LTS): [nodejs.org](https://nodejs.org/).
2. **Git**: [git-scm.com/downloads](https://git-scm.com/downloads).
3. Редактор **Visual Studio Code**: [code.visualstudio.com](https://code.visualstudio.com/).
4. Удобнее без командной строки: **GitHub Desktop** [desktop.github.com](https://desktop.github.com/).
5. На телефон приложение **Expo Go**:
   [App Store](https://apps.apple.com/app/expo-go/id982107779) ·
   [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent).

Проверка: откройте Терминал (Mac) или PowerShell (Windows) и введите `node -v`. Должно показать `v20…` или выше.

## Шаг 2. Скачать проект

**Вариант А — на своём компьютере.** В терминале:

```bash
git clone -b claude/whatuni-app-review-f0fg0t https://github.com/rassullove2003-blip/Work.git
cd Work
npm install
```

Если репозиторий приватный, Git попросит войти в GitHub. Проще всего — GitHub Desktop: File → Clone repository →
`rassullove2003-blip/Work`, затем в списке веток выберите `claude/whatuni-app-review-f0fg0t`.

**Вариант Б — в облаке без компьютера.** Откройте
[страницу ветки](https://github.com/rassullove2003-blip/Work/tree/claude/whatuni-app-review-f0fg0t) →
зелёная кнопка **Code** → вкладка **Codespaces** → **Create codespace**. В открывшемся терминале введите `npm install`.
Бесплатные часы Codespaces ограничены: [условия](https://github.com/features/codespaces).

## Шаг 3. Первый запуск (на демо-данных, без сервера)

```bash
npm run mobile
```

В терминале появится QR-код. iPhone: отсканируйте камерой; Android: откройте Expo Go → Scan QR code.
Телефон и компьютер должны быть в одной сети Wi-Fi. Если QR не открывается или вы в Codespaces:

```bash
cd apps/mobile
npx expo start --tunnel
```

Посмотреть в браузере: нажмите `w` в терминале. Документация: [Expo Go](https://docs.expo.dev/get-started/expo-go/).

## Шаг 4. Создать базу Supabase

1. Войдите и создайте проект: [supabase.com/dashboard/new](https://supabase.com/dashboard/new).
   Регион — ближе к пользователям (например, Frankfurt). Сохраните пароль базы в надёжном месте.
2. Откройте **SQL Editor** (в меню слева проекта) → **New query**.
3. По очереди скопируйте, вставьте и выполните (**Run**) содержимое файлов — строго в этом порядке:
   1. [`supabase/migrations/20261120000001_core_schema.sql`](https://github.com/rassullove2003-blip/Work/blob/claude/whatuni-app-review-f0fg0t/supabase/migrations/20261120000001_core_schema.sql)
   2. [`supabase/migrations/20261120000002_rls.sql`](https://github.com/rassullove2003-blip/Work/blob/claude/whatuni-app-review-f0fg0t/supabase/migrations/20261120000002_rls.sql)
   3. [`supabase/migrations/20261120000003_storage_and_account.sql`](https://github.com/rassullove2003-blip/Work/blob/claude/whatuni-app-review-f0fg0t/supabase/migrations/20261120000003_storage_and_account.sql)
   4. [`supabase/seed.sql`](https://github.com/rassullove2003-blip/Work/blob/claude/whatuni-app-review-f0fg0t/supabase/seed.sql) — демо-данные
4. Проверка: **Table Editor** → таблица `universities` → 40 строк.

Для опытных вместо шага 3 — [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):
`npx supabase link --project-ref <ref>`, затем `npx supabase db push`.

## Шаг 5. Настроить вход по email

1. **Authentication → Sign In / Providers → Email** — включено, «Confirm email» оставьте включённым.
   Документация: [Email auth](https://supabase.com/docs/guides/auth/passwords).
2. **Authentication → URL Configuration** — в **Site URL** позже вставьте адрес админ-панели из шага 9.
   Документация: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
3. Встроенная почта Supabase отправляет мало писем в час — для реальных пользователей подключите свой SMTP:
   [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Шаг 6. Ключи — безопасно

1. **Project Settings → API Keys** (или кнопка **Connect** вверху проекта). Нужны два значения:
   **Project URL** и **anon / publishable key**. Документация: [API keys](https://supabase.com/docs/guides/api/api-keys).
2. **Никогда** не используйте `service_role` / `secret` key в приложении и не присылайте ключи в чат.
3. В папке проекта создайте файлы (в VS Code: правый клик по папке → New File):

`apps/mobile/.env`
```
EXPO_PUBLIC_SUPABASE_URL=https://ВАШ-ПРОЕКТ.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=ваш_anon_key
```

`apps/admin/.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=https://ВАШ-ПРОЕКТ.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_anon_key
```

Эти файлы уже исключены из Git и не попадут на GitHub. Перезапустите `npm run mobile` — приложение
начнёт брать данные из вашей базы, во вкладке «Профиль» появятся вход и регистрация.

## Шаг 7. Стать администратором

1. Зарегистрируйтесь в приложении (Профиль → Зарегистрироваться) и подтвердите email.
   Либо: **Authentication → Users → Add user**.
2. **SQL Editor** → выполните, подставив свой email:

```sql
insert into public.admin_users (user_id, role)
select id, 'admin' from auth.users where email = 'ваш@email.com';
```

Редактор (может править, но не удалять) — то же самое с `'editor'`.

## Шаг 8. Админ-панель на компьютере

```bash
npm run admin
```

Откройте [http://localhost:3001](http://localhost:3001), войдите email и паролем администратора.
Добавление вуза: **Университеты → + Добавить**. Чтобы запись стала «Проверено», укажите ссылку на официальную
страницу, дату проверки и учебный год, затем **Публикация → Опубликовано**.

## Шаг 9. Админ-панель в интернете (Vercel)

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → выберите `Work`.
2. **Root Directory**: `apps/admin` ([как это работает для монорепозиториев](https://vercel.com/docs/monorepos)).
3. **Environment Variables**: добавьте `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   ([документация](https://vercel.com/docs/environment-variables)).
4. В **Settings → Git → Production Branch** укажите `claude/whatuni-app-review-f0fg0t`
   (или сначала слейте ветку в `main` через Pull Request на GitHub).
5. **Deploy**. Полученный адрес `https://….vercel.app` вставьте в Supabase → Site URL (шаг 5).

## Шаг 10. Когда Expo Go уже не хватит

Сейчас все модули проекта работают в Expo Go. Своя сборка (development build) понадобится, когда добавятся
push-уведомления, вход через Apple/Google, некоторые карты. Что это такое:
[Development builds](https://docs.expo.dev/develop/development-builds/introduction/).

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --profile development --platform ios
```

## Шаг 11. Тестовая сборка и публикация

1. Настройка EAS Build: [docs.expo.dev/build/setup](https://docs.expo.dev/build/setup/).
2. Переменные окружения для облачных сборок (те же два значения):
   [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).
3. Сборки:
   ```bash
   npx eas-cli@latest build --platform ios
   npx eas-cli@latest build --platform android
   ```
4. Отправка в магазины: [EAS Submit](https://docs.expo.dev/submit/introduction/).
   - iPhone: [App Store Connect](https://appstoreconnect.apple.com/) → TestFlight для тестирования;
     [гайд Expo для iOS](https://docs.expo.dev/submit/ios/).
   - Android: [Google Play Console](https://play.google.com/console/) → Внутреннее тестирование;
     [гайд Expo для Android](https://docs.expo.dev/submit/android/).
5. Для карточки в магазине: иконка 1024×1024, скриншоты, описание на русском, ссылка на политику конфиденциальности.

## Шаг 12. Проверить перед релизом

- [ ] Права на все фото и логотипы вузов.
- [ ] Политика конфиденциальности опубликована по ссылке; согласие на обработку данных ([GDPR](https://gdpr.eu/)).
- [ ] Удаление аккаунта внутри приложения — уже есть ([требование Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/)).
- [ ] Каждая опубликованная запись имеет источник, учебный год и дату проверки; демо-записи сняты с публикации.
- [ ] Ключ `service_role` нигде не в коде и не на GitHub.
- [ ] Приложение проверено на настоящем iPhone и Android.
- [ ] Свой SMTP для писем подтверждения (шаг 5).

## Если что-то не работает

| Проблема | Что сделать |
|---|---|
| `npm: command not found` | Переустановите Node.js (шаг 1) и откройте терминал заново |
| QR-код не открывает приложение | `npx expo start --tunnel` в папке `apps/mobile` |
| «Сервер не подключён» в профиле | Проверьте файл `apps/mobile/.env` и перезапустите `npm run mobile` |
| Админка: «Нет доступа» | Выполните SQL из шага 7 для своего email |
| Ошибка в SQL Editor | Выполняйте миграции строго по порядку; если уже выполняли — создайте новый проект или удалите таблицы |
| Письмо подтверждения не приходит | Проверьте «Спам»; лимит встроенной почты — подключите SMTP (шаг 5) |
