import React, { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { defaultIntakeYear, type ProgramWithUniversity } from '@uniitalia/shared';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { createApplication } from '../lib/applications';
import { useReminders } from '../lib/reminders';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/links';
import { Button } from './ui';

/** Кнопка на странице программы: добавить в «Мои поступления» или открыть уже добавленную. */
export function AddToApplications({ program }: { program: ProgramWithUniversity }) {
  const auth = useAuth();
  const catalog = useCatalog();
  const reminders = useReminders();
  const [existingId, setExistingId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !auth.userId) return;
      supabase
        .from('student_applications')
        .select('id')
        .eq('user_id', auth.userId)
        .eq('program_id', program.id)
        .limit(1)
        .then(({ data }) => setExistingId(data?.[0]?.id ?? null));
    }, [auth.userId, program.id]),
  );

  if (!auth.enabled) return null;
  if (!auth.userId) {
    return <Button title="Войти, чтобы добавить в поступления" variant="outline" icon="log-in-outline" onPress={() => router.push('/auth')} />;
  }
  if (existingId) {
    return (
      <Button
        title="Открыть в моих поступлениях"
        variant="secondary"
        icon="school"
        onPress={() => router.push({ pathname: '/application/[id]', params: { id: existingId } } as never)}
        testID="open-application"
      />
    );
  }

  const add = async () => {
    setBusy(true);
    try {
      const deadlines = catalog.deadlinesOfProgram(program.id);
      const id = await createApplication(auth.userId!, program.id, defaultIntakeYear(), deadlines);
      // сроки программы сразу попадают в напоминания
      await reminders.subscribeMany(deadlines.filter((d) => new Date(d.ends_at) >= new Date()).map((d) => d.id));
      setExistingId(id);
      router.push({ pathname: '/application/[id]', params: { id } } as never);
    } catch (e) {
      notify('Не удалось добавить', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <Button title="Добавить в мои поступления" icon="add-circle-outline" variant="secondary" onPress={add} loading={busy || existingId === undefined} testID="add-application" />;
}
