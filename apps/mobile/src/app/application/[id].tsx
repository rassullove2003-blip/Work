import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUSES, applicationProgress, type ApplicationStatus } from '@uniitalia/shared';
import { useAuth } from '../../lib/auth';
import { useStaff } from '../../lib/staff';
import { useCatalog } from '../../lib/catalog';
import {
  addTask,
  deleteApplication,
  deleteTask,
  getApplication,
  setTaskDone,
  staffApplications,
  updateApplication,
  type Application,
  type ApplicationEvent,
  type ApplicationTask,
  type StaffApplicationRow,
} from '../../lib/applications';
import { confirmAction, notify } from '../../lib/links';
import { ProgressBar } from '../../components/ApplicationCard';
import { Button, EmptyState, LoadingState, Notice, ScreenHeader, Section, ui } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function ApplicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { isStaff } = useStaff();
  const catalog = useCatalog();
  const [data, setData] = useState<{ app: Application; tasks: ApplicationTask[]; events: ApplicationEvent[] } | null | undefined>(undefined);
  const [student, setStudent] = useState<StaffApplicationRow | null>(null);
  const [notes, setNotes] = useState('');
  const [comment, setComment] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getApplication(String(id));
      setData(d);
      if (d) {
        setNotes(d.app.notes ?? '');
        setComment(d.app.curator_comment ?? '');
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isOwner = data?.app.user_id === userId;
  const staffMode = isStaff && !isOwner;

  useFocusEffect(
    useCallback(() => {
      if (staffMode) staffApplications(String(id)).then((r) => setStudent(r[0] ?? null)).catch(() => {});
    }, [staffMode, id]),
  );

  if (data === undefined || catalog.status === 'loading') return <LoadingState />;
  if (!data) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title="Поступление" back />
        <EmptyState icon="alert-circle-outline" title={error ?? 'Заявка не найдена'} text="Возможно, она удалена или у вас нет доступа." />
      </View>
    );
  }

  const { app, tasks, events } = data;
  const program = catalog.programs.find((p) => p.id === app.program_id);
  const progress = applicationProgress(app.status);
  const currentIdx = APPLICATION_STATUSES.findIndex((s) => s.id === app.status);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      if (ok) notify(ok);
    } catch (e) {
      notify('Не получилось', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (s: ApplicationStatus) => {
    if (s === app.status) return;
    if (!(await confirmAction('Изменить этап?', `${APPLICATION_STATUS_LABELS[app.status]} → ${APPLICATION_STATUS_LABELS[s]}`, 'Изменить'))) return;
    run(() => updateApplication(app.id, { status: s }));
  };

  const submitTask = () => {
    const title = taskTitle.trim();
    if (!title) return notify('Введите название задачи');
    if (taskDate.trim() && (!DATE_RE.test(taskDate.trim()) || isNaN(Date.parse(taskDate.trim())))) return notify('Дата пишется так: 2027-03-31');
    run(async () => {
      await addTask(app.id, title, taskDate.trim() || null);
      setTaskTitle('');
      setTaskDate('');
    });
  };

  const remove = async () => {
    if (!(await confirmAction('Удалить поступление?', 'Заявка, задачи и заметки будут удалены.', 'Удалить'))) return;
    try {
      await deleteApplication(app.id);
      router.back();
    } catch (e) {
      notify('Не получилось', (e as Error).message);
    }
  };

  const done = tasks.filter((t) => t.done).length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={staffMode ? 'Заявка студента' : 'Моё поступление'} back />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        {staffMode && student ? (
          <View style={[ui.card, { marginBottom: spacing.lg, gap: 2 }]}>
            <Text style={styles.caption}>СТУДЕНТ</Text>
            <Text style={ui.h3}>{student.full_name || 'Без имени'}</Text>
            <Text style={ui.muted}>{student.email}</Text>
            <Text style={ui.muted}>
              {[student.country && `Страна: ${student.country}`, student.citizenship && `Гражданство: ${student.citizenship}`].filter(Boolean).join(' · ') || 'Профиль не заполнен'}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => program && router.push({ pathname: '/program/[slug]', params: { slug: program.slug } })}
          style={[ui.card, { gap: spacing.xs }]}
          accessibilityRole="link"
        >
          <Text style={ui.h2}>{program?.title_original ?? 'Программа недоступна'}</Text>
          <Text style={ui.muted}>
            {program ? program.university.name_ru ?? program.university.official_name : 'Программа снята с публикации'}
            {app.academic_year ? ` · ${app.academic_year}` : ''}
          </Text>
          <View style={[ui.row, { justifyContent: 'space-between', marginTop: spacing.sm }]}>
            <Text style={styles.status}>{APPLICATION_STATUS_LABELS[app.status]}</Text>
            <Text style={ui.body}>{progress}%</Text>
          </View>
          <ProgressBar value={progress} />
        </Pressable>

        {app.curator_comment && !staffMode ? (
          <View style={styles.comment} testID="curator-comment">
            <Text style={styles.caption}>КОММЕНТАРИЙ КУРАТОРА</Text>
            <Text style={ui.body}>{app.curator_comment}</Text>
            {app.curator_comment_at ? <Text style={ui.muted}>{new Date(app.curator_comment_at).toLocaleString('ru-RU')}</Text> : null}
          </View>
        ) : null}

        {staffMode ? (
          <Section title="Комментарий для студента">
            <TextInput
              value={comment}
              onChangeText={setComment}
              multiline
              placeholder="Что сделать студенту дальше"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.multi]}
              testID="curator-comment-input"
            />
            <Button title="Отправить комментарий" onPress={() => run(() => updateApplication(app.id, { curator_comment: comment.trim() || null }), 'Комментарий сохранён')} loading={busy} style={{ marginTop: spacing.sm }} testID="curator-comment-save" />
          </Section>
        ) : null}

        <Section title="Этапы">
          <View style={ui.card}>
            {APPLICATION_STATUSES.map((s, i) => {
              const passed = i < currentIdx;
              const current = i === currentIdx;
              return (
                <Pressable key={s.id} onPress={() => setStatus(s.id)} disabled={busy} style={styles.step} accessibilityRole="button" accessibilityState={{ selected: current }} testID={`status-${s.id}`}>
                  <Ionicons
                    name={passed ? 'checkmark-circle' : current ? 'radio-button-on' : 'ellipse-outline'}
                    size={22}
                    color={passed ? colors.success : current ? colors.secondary : colors.border}
                  />
                  <Text style={[ui.body, current && { fontWeight: '800', color: colors.secondary }, passed && { color: colors.textMuted }]}>{s.ru}</Text>
                </Pressable>
              );
            })}
            <Text style={[ui.muted, { marginTop: spacing.sm }]}>Нажмите на этап, чтобы отметить, где вы сейчас.</Text>
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <Notice text="Статус ведётся вручную и не синхронизирован с университетом." />
          </View>
        </Section>

        <Section title={`Задачи (${done} из ${tasks.length})`}>
          <View style={ui.card}>
            {tasks.length === 0 ? <Text style={ui.muted}>Задач пока нет.</Text> : null}
            {tasks.map((t) => {
              const overdue = !t.done && t.due_date && t.due_date < today;
              return (
                <View key={t.id} style={styles.task}>
                  <Pressable onPress={() => run(() => setTaskDone(t.id, !t.done))} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: t.done }} style={styles.check} testID={`task-${t.id}`}>
                    <Ionicons name={t.done ? 'checkbox' : 'square-outline'} size={24} color={t.done ? colors.success : colors.textMuted} />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={[ui.body, t.done && { textDecorationLine: 'line-through', color: colors.textMuted }]}>{t.title}</Text>
                    {t.due_date ? (
                      <Text style={[ui.muted, overdue ? { color: colors.danger } : null]}>
                        до {new Date(t.due_date).toLocaleDateString('ru-RU')}
                        {overdue ? ' · просрочено' : ''}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable onPress={async () => (await confirmAction('Удалить задачу?', t.title, 'Удалить')) && run(() => deleteTask(t.id))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Удалить задачу">
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
              );
            })}
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <TextInput value={taskTitle} onChangeText={setTaskTitle} placeholder="Новая задача" placeholderTextColor={colors.textMuted} style={styles.input} testID="task-title" />
              <TextInput value={taskDate} onChangeText={setTaskDate} placeholder="Срок (необязательно), например 2027-03-31" placeholderTextColor={colors.textMuted} style={styles.input} keyboardType="numbers-and-punctuation" testID="task-date" />
              <Button title="Добавить задачу" variant="outline" icon="add" onPress={submitTask} loading={busy} testID="task-add" />
            </View>
          </View>
        </Section>

        {!staffMode ? (
          <Section title="Мои заметки">
            <TextInput value={notes} onChangeText={setNotes} multiline placeholder="Что важно не забыть" placeholderTextColor={colors.textMuted} style={[styles.input, styles.multi]} testID="notes-input" />
            <Button title="Сохранить заметки" variant="outline" onPress={() => run(() => updateApplication(app.id, { notes: notes.trim() || null }), 'Заметки сохранены')} loading={busy} style={{ marginTop: spacing.sm }} />
          </Section>
        ) : app.notes ? (
          <Section title="Заметки студента">
            <View style={ui.card}>
              <Text style={ui.body}>{app.notes}</Text>
            </View>
          </Section>
        ) : null}

        <Section title="История">
          <View style={ui.card}>
            {events.map((e) => (
              <Text key={e.id} style={[ui.muted, { paddingVertical: 2 }]}>
                {new Date(e.created_at).toLocaleString('ru-RU')} · {APPLICATION_STATUS_LABELS[e.status]}
                {e.by_staff ? ' (куратор)' : ''}
              </Text>
            ))}
          </View>
        </Section>

        {!staffMode ? <Button title="Удалить поступление" variant="danger" icon="trash-outline" onPress={remove} style={{ marginTop: spacing.xl }} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  caption: { ...font.caption, color: colors.primaryDark },
  status: { ...font.bodyBold, color: colors.secondary },
  comment: { marginTop: spacing.lg, backgroundColor: colors.secondarySoft, borderRadius: radius.md, padding: spacing.lg, gap: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  task: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  check: { paddingTop: 2 },
  input: { ...font.body, color: colors.text, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 46, backgroundColor: colors.background },
  multi: { minHeight: 100, textAlignVertical: 'top' },
});
