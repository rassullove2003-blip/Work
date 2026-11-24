#!/usr/bin/env bash
# Собирает Edge Function sheets-sync в один файл (общий код импорта + шаблон таблицы).
# Результат: supabase/functions/sheets-sync/dist/index.js — его и разворачиваем в Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/node_modules/.bin/esbuild" "$ROOT/supabase/functions/sheets-sync/handler.ts" \
  --bundle --format=iife --global-name=SheetsSync --platform=neutral --target=es2022 --main-fields=module,main \
  --external:'npm:*' --loader:.json=json --legal-comments=none --minify \
  --outfile="$ROOT/supabase/functions/sheets-sync/dist/index.js"
