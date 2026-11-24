import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { extractSheetId, hasErrors, IMPORT_SHEETS, type ImportResult } from '@uniitalia/shared';
import { supabase } from '../../lib/supabase';
import { useStaff } from '../../lib/staff';
import { useCatalog } from '../../lib/catalog';
import { applyPlan, logRun, readFiles, readGoogleSheet, validateWorkbook } from '../../lib/importer';
import { confirmAction, notify } from '../../lib/links';
import { StaffGuard } from '../../components/admin/EditScreen';
import { FormSection } from '../../components/admin/form';
import { Button, Notice, ScreenHeader, ui } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';

type Source = { kind: 'google_sheets' | 'xlsx' | 'csv'; name: string; sourceId?: string | null };
type Run = { id: string; source_kind: string; file_name: string | null; status: string; summary: Record<string, { rows: number }>; created_at: string };

const STATUS_RU: Record<string, string> = { validated: 'Проверено, не загружено', applied: 'Загружено', failed: 'Ошибка' };
const KIND_RU: Record<string, string> = { google_sheets: 'Google Таблица', xlsx: 'Excel', csv: 'CSV' };

type SavedSource = {
  id: string;
  google_sheet_id: string;
  last_synced_at: string | null;
  auto_sync: boolean;
  last_auto_at: string | null;
  last_auto_status: 'ok' | 'unchanged' | 'failed' | null;
  last_auto_message: string | null;
};

const AUTO_STATUS: Record<string, string> = { ok: 'изменения загружены', unchanged: 'таблица не менялась', failed: 'ошибка' };

/** Переключатель ежедневной автосинхронизации (только администратор). */
function AutoSync({ source, canEdit, onChanged }: { source: SavedSource; canEdit: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async (on: boolean) => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from('import_sources').update({ auto_sync: on }).eq('id', source.id);
    setBusy(false);
    if (error) notify('Не удалось сохранить', 'Включать автосинхронизацию может только администратор.');
    onChanged();
  };
  return (
    <View style={[styles.auto, { gap: spacing.sm }]}>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={[ui.body, { flex: 1, fontWeight: '600' }]}>Автосинхронизация каждый день</Text>
        <Switch value={source.auto_sync} onValueChange={toggle} disabled={!canEdit || busy} trackColor={{ true: colors.secondary, false: colors.border }} testID="import-auto-sync" />
      </View>
      <Text style={ui.muted}>
        Каждое утро (около 8:35 по Москве) сервер сам проверяет таблицу. Если есть изменения и нет ошибок — загружает их; пустые ячейки не стирают правки, сделанные в приложении. Если в таблице ошибки — ничего не меняет и присылает администраторам уведомление.
      </Text>
      {source.last_auto_at ? (
        <Text style={[ui.muted, source.last_auto_status === 'failed' && { color: colors.danger }]}>
          Последний запуск: {new Date(source.last_auto_at).toLocaleString('ru-RU')} — {AUTO_STATUS[source.last_auto_status ?? ''] ?? '—'}
          {source.last_auto_status === 'failed' && source.last_auto_message ? `: ${source.last_auto_message}` : ''}
        </Text>
      ) : source.auto_sync ? (
        <Text style={ui.muted}>Первый запуск — завтра утром.</Text>
      ) : null}
      {!canEdit ? <Text style={ui.muted}>Включить или выключить может администратор.</Text> : null}
    </View>
  );
}

function ImportScreen() {
  const { isAdmin } = useStaff();
  const catalog = useCatalog();
  const [link, setLink] = useState('');
  const [savedSource, setSavedSource] = useState<SavedSource | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  const loadMeta = useCallback(async () => {
    if (!supabase) return;
    const [s, r] = await Promise.all([
      supabase.from('import_sources').select('id, google_sheet_id, last_synced_at, auto_sync, last_auto_at, last_auto_status, last_auto_message').order('created_at').limit(1).maybeSingle(),
      supabase.from('import_runs').select('id, source_kind, file_name, status, summary, created_at').order('created_at', { ascending: false }).limit(10),
    ]);
    if (s.data) {
      setSavedSource(s.data as SavedSource);
      setLink((l) => l || `https://docs.google.com/spreadsheets/d/${s.data!.google_sheet_id}/edit`);
    }
    setRuns((r.data ?? []) as Run[]);
  }, []);
  useFocusEffect(
    useCallback(() => {
      loadMeta();
    }, [loadMeta]),
  );

  const reset = () => {
    setError(null);
    setDone(null);
    setResult(null);
  };

  const checkGoogle = async () => {
    reset();
    const id = extractSheetId(link);
    if (!id) return setError('Вставьте ссылку на Google Таблицу вида https://docs.google.com/spreadsheets/d/…');
    setBusy('Читаю Google Таблицу…');
    try {
      const { wb, issues } = await readGoogleSheet(id);
      setBusy('Проверяю данные…');
      const r = await validateWorkbook(wb, issues);
      // Администратор сохраняет таблицу как основную для кнопки «Синхронизировать».
      let sourceId = savedSource?.google_sheet_id === id ? savedSource.id : null;
      if (isAdmin && supabase && !sourceId) {
        const { data } = await supabase.from('import_sources').upsert({ google_sheet_id: id }, { onConflict: 'google_sheet_id' }).select('id').single();
        sourceId = data?.id ?? null;
      }
      setSource({ kind: 'google_sheets', name: 'Google Таблица', sourceId });
      setResult(r);
      await logRun({ source_kind: 'google_sheets', file_name: id, source_id: sourceId, status: hasErrors(r) ? 'failed' : 'validated', summary: r.summary, errors: r.issues });
      loadMeta();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pickFile = async () => {
    reset();
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const files = res.assets.map((a) => ({ uri: a.uri, name: a.name }));
    const kind = files.some((f) => /\.xlsx$/i.test(f.name)) ? 'xlsx' : 'csv';
    setBusy('Читаю файл…');
    try {
      const wb = await readFiles(files);
      setBusy('Проверяю данные…');
      const r = await validateWorkbook(wb);
      const name = files.map((f) => f.name).join(', ');
      setSource({ kind, name });
      setResult(r);
      await logRun({ source_kind: kind, file_name: name, status: hasErrors(r) ? 'failed' : 'validated', summary: r.summary, errors: r.issues });
      loadMeta();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!result || !source || hasErrors(result)) return;
    const total = Object.values(result.summary).reduce((a, s) => a + s.rows, 0);
    const ok = await confirmAction('Загрузить данные?', `Строк в таблице: ${total}. Новые записи будут созданы, существующие обновлены. Пустые ячейки не стирают данные, введённые в приложении.`, 'Загрузить');
    if (!ok) return;
    setError(null);
    try {
      await applyPlan(result.plan, (t) => setBusy(`Загружаю: ${t}`));
      if (source.kind === 'google_sheets' && source.sourceId && isAdmin && supabase) {
        await supabase.from('import_sources').update({ last_synced_at: new Date().toISOString() }).eq('id', source.sourceId);
      }
      await logRun({ source_kind: source.kind, file_name: source.name, source_id: source.sourceId, status: 'applied', summary: result.summary, errors: result.issues });
      catalog.reload();
      setDone('Данные загружены. Каталог в приложении обновлён.');
      setResult(null);
      loadMeta();
    } catch (e) {
      const msg = (e as Error).message;
      setError(`Загрузка остановлена: ${msg}. Уже загруженные шаги сохранены; исправьте ошибку и загрузите снова — повторная загрузка не создаёт дубликатов.`);
      await logRun({ source_kind: source.kind, file_name: source.name, source_id: source.sourceId, status: 'failed', summary: result.summary, errors: [{ sheet: '', row: 0, column: '', message: msg, level: 'error' }] });
    } finally {
      setBusy(null);
    }
  };

  const errors = result?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = result?.issues.filter((i) => i.level === 'warning') ?? [];

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Импорт данных" back />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Notice text="Загрузите вузы, программы, стоимость, требования, стипендии и дедлайны из шаблона UniItalia. Сначала приложение проверяет данные и показывает ошибки; в базу ничего не записывается, пока вы не нажмёте «Загрузить». Повторная загрузка обновляет записи и не создаёт дубликатов." />

        <FormSection title="Google Таблица">
          <Text style={styles.label}>Ссылка на таблицу</Text>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            testID="import-link"
          />
          <Text style={[ui.muted, { marginVertical: spacing.sm }]}>
            Таблица должна быть открыта по ссылке: «Настройки доступа» → «Все, у кого есть ссылка» → «Читатель».
          </Text>
          {savedSource ? (
            <Text style={[ui.muted, { marginBottom: spacing.sm }]}>
              Основная таблица сохранена. Последняя синхронизация: {savedSource.last_synced_at ? new Date(savedSource.last_synced_at).toLocaleString('ru-RU') : 'ещё не было'}.
            </Text>
          ) : null}
          <Button title={savedSource ? 'Синхронизировать' : 'Проверить таблицу'} icon="sync-outline" onPress={checkGoogle} disabled={!!busy} testID="import-google" />
          {savedSource ? <AutoSync source={savedSource} canEdit={isAdmin} onChanged={loadMeta} /> : null}
        </FormSection>

        <FormSection title="Файл Excel или CSV">
          <Text style={[ui.muted, { marginBottom: spacing.md }]}>
            .xlsx — весь шаблон целиком. .csv — по одному листу (можно выбрать несколько файлов сразу): лист определяется по заголовкам колонок.
          </Text>
          <Button title="Выбрать файл" variant="outline" icon="document-attach-outline" onPress={pickFile} disabled={!!busy} testID="import-file" />
        </FormSection>

        {busy ? (
          <View style={{ marginTop: spacing.xl }}>
            <Notice text={busy} icon="hourglass-outline" />
          </View>
        ) : null}
        {error ? (
          <View style={[styles.box, styles.boxError]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {done ? (
          <View style={[styles.box, styles.boxOk]} testID="import-done">
            <Text style={styles.okText}>{done}</Text>
          </View>
        ) : null}

        {result ? (
          <FormSection title={`Результат проверки: ${source?.name ?? ''}`}>
            <View style={{ gap: spacing.xs }}>
              {IMPORT_SHEETS.map((sh) => {
                const s = result.summary[sh.key];
                const found = result.foundSheets.includes(sh.key);
                const detail =
                  sh.key === 'fees' || sh.key === 'requirements'
                    ? `${s.create} записей`
                    : `новых ${s.create}, обновится ${s.update}`;
                return (
                  <Text key={sh.key} style={ui.body} testID={`import-summary-${sh.key}`}>
                    {sh.title}: {found ? `строк ${s.rows} (${detail})` : 'лист не найден'}
                  </Text>
                );
              })}
            </View>

            {errors.length ? (
              <View style={{ marginTop: spacing.lg, gap: spacing.sm }} testID="import-errors">
                <Text style={[styles.errorText, { fontWeight: '800' }]}>Ошибок: {errors.length}. Исправьте их в таблице и проверьте снова.</Text>
                {errors.slice(0, 100).map((i, n) => (
                  <View key={n} style={styles.issue}>
                    <Text style={styles.issueWhere}>
                      {i.sheet}
                      {i.row ? `, строка ${i.row}` : ''}
                      {i.column ? `, «${i.column}»` : ''}
                    </Text>
                    <Text style={ui.body}>{i.message}</Text>
                  </View>
                ))}
                {errors.length > 100 ? <Text style={ui.muted}>…и ещё {errors.length - 100}</Text> : null}
              </View>
            ) : (
              <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                <Text style={styles.okText}>Ошибок нет. Можно загружать.</Text>
                <Button title="Загрузить в приложение" variant="secondary" icon="cloud-upload-outline" onPress={apply} disabled={!!busy} testID="import-apply" />
              </View>
            )}

            {warnings.length ? (
              <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                <Text style={[ui.body, { fontWeight: '700' }]}>Предупреждения ({warnings.length})</Text>
                {warnings.slice(0, 30).map((i, n) => (
                  <Text key={n} style={ui.muted}>
                    {i.sheet}
                    {i.column ? `, «${i.column}»` : ''}: {i.message}
                  </Text>
                ))}
              </View>
            ) : null}
          </FormSection>
        ) : null}

        <FormSection title="История импорта">
          {runs.length === 0 ? <Text style={ui.muted}>Импортов ещё не было.</Text> : null}
          {runs.map((r) => (
            <View key={r.id} style={styles.run}>
              <Text style={ui.body}>
                {new Date(r.created_at).toLocaleString('ru-RU')} · {KIND_RU[r.source_kind] ?? r.source_kind}
              </Text>
              <Text style={[ui.muted, r.status === 'failed' && { color: colors.danger }]}>
                {STATUS_RU[r.status] ?? r.status}
                {r.file_name && r.source_kind !== 'google_sheets' ? ` · ${r.file_name}` : ''}
              </Text>
            </View>
          ))}
        </FormSection>
      </ScrollView>
    </View>
  );
}

export default function ImportRoute() {
  return (
    <StaffGuard title="Импорт данных">
      <ImportScreen />
    </StaffGuard>
  );
}

const styles = StyleSheet.create({
  auto: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  label: { ...font.small, fontWeight: '700', color: colors.text, marginBottom: 6 },
  input: {
    ...font.body,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    backgroundColor: colors.background,
  },
  box: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.md },
  boxError: { backgroundColor: colors.dangerSoft },
  boxOk: { backgroundColor: colors.successSoft },
  errorText: { ...font.body, color: colors.danger },
  okText: { ...font.bodyBold, color: '#00805F' },
  issue: { borderLeftWidth: 3, borderLeftColor: colors.danger, paddingLeft: spacing.md, gap: 2 },
  issueWhere: { ...font.small, fontWeight: '700', color: colors.textMuted },
  run: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
