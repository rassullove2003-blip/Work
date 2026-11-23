import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CHAT_MIME_TYPES, formatBytes } from '@uniitalia/shared';
import { loadMessages, markChatRead, sendMessage, subscribeMessages, type ChatMessage } from '../lib/chat';
import { openStoredFile, pickFile, type PickedFile, type PickSource } from '../lib/files';
import { notify } from '../lib/links';
import { useNotifications } from '../lib/notifications';
import { EmptyState, LoadingState, ui, type IconName } from './ui';
import { colors, font, HIT, radius, spacing } from '../theme';

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function Attachment({ m, own }: { m: ChatMessage; own: boolean }) {
  const [busy, setBusy] = useState(false);
  const isImage = m.attachment_mime?.startsWith('image/');
  const open = async () => {
    setBusy(true);
    try {
      await openStoredFile('chat-attachments', m.attachment_path!);
    } catch (e) {
      notify('Не удалось открыть', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={open} style={[styles.file, own && styles.fileOwn]} accessibilityRole="button" accessibilityLabel={`Открыть файл ${m.attachment_name}`} testID="chat-attachment">
      {busy ? <ActivityIndicator color={own ? '#fff' : colors.secondary} /> : <Ionicons name={isImage ? 'image-outline' : 'document-attach-outline'} size={22} color={own ? '#fff' : colors.secondary} />}
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.fileName, own && { color: '#fff' }]} numberOfLines={2}>
          {m.attachment_name ?? 'Файл'}
        </Text>
        <Text style={[styles.meta, own && styles.metaOwn]}>{formatBytes(m.attachment_size)} · открыть</Text>
      </View>
    </Pressable>
  );
}

function Bubble({ m, own, otherLabel }: { m: ChatMessage; own: boolean; otherLabel: string }) {
  return (
    <View style={[styles.bubbleRow, own ? { justifyContent: 'flex-end' } : null]}>
      <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
        {!own ? <Text style={styles.sender}>{otherLabel}</Text> : null}
        {m.attachment_path ? <Attachment m={m} own={own} /> : null}
        {m.body ? (
          <Text style={[ui.body, own && { color: '#fff' }]} selectable>
            {m.body}
          </Text>
        ) : null}
        <Text style={[styles.meta, own && styles.metaOwn, { alignSelf: 'flex-end' }]}>{timeLabel(m.created_at)}</Text>
      </View>
    </View>
  );
}

const SOURCES: { id: PickSource; icon: IconName; label: string }[] = [
  { id: 'camera', icon: 'camera-outline', label: 'Камера' },
  { id: 'gallery', icon: 'images-outline', label: 'Фото' },
  { id: 'file', icon: 'document-outline', label: 'Файл' },
];

/**
 * Переписка студента с кураторами. staffMode: смотрит сотрудник (свои сообщения — от сотрудников).
 */
export function ChatView({ studentId, staffMode = false, intro }: { studentId: string; staffMode?: boolean; intro?: string }) {
  const insets = useSafeAreaInsets();
  const notifications = useNotifications();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const read = useCallback(() => {
    markChatRead(staffMode ? studentId : null).then(notifications.refresh);
  }, [staffMode, studentId, notifications.refresh]);

  useEffect(() => {
    let alive = true;
    loadMessages(studentId)
      .then((m) => alive && setMessages(m))
      .catch((e: Error) => alive && setError(e.message));
    read();
    const unsubscribe = subscribeMessages(studentId, (m) => {
      setMessages((list) => (list && !list.some((x) => x.id === m.id) ? [...list, m] : list));
      if (m.from_staff !== staffMode) read();
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [studentId, staffMode, read]);

  const choose = async (source: PickSource) => {
    setShowAttach(false);
    try {
      const f = await pickFile(source, CHAT_MIME_TYPES);
      if (f) setFile(f);
    } catch (e) {
      notify('Не удалось выбрать файл', (e as Error).message);
    }
  };

  const send = async () => {
    if (!text.trim() && !file) return;
    setSending(true);
    try {
      const m = await sendMessage(studentId, text, file);
      setMessages((list) => (list && !list.some((x) => x.id === m.id) ? [...list, m] : list));
      setText('');
      setFile(null);
    } catch (e) {
      notify('Не отправлено', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (error) return <EmptyState icon="alert-circle-outline" title={error} />;
  if (!messages) return <LoadingState />;

  const otherLabel = staffMode ? 'Студент' : 'Куратор';
  const canSend = (!!text.trim() || !!file) && !sending;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 52}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={intro ? <Text style={[ui.muted, styles.intro]}>{intro}</Text> : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title={staffMode ? 'Сообщений пока нет' : 'Напишите куратору'}
            text={staffMode ? 'Напишите студенту первым.' : 'Задайте вопрос о поступлении, документах или визе. Можно прикрепить фото или PDF.'}
          />
        }
        renderItem={({ item, index }) => {
          const prev = messages[index - 1];
          const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(item.created_at);
          return (
            <View>
              {newDay ? <Text style={styles.day}>{dayLabel(item.created_at)}</Text> : null}
              <Bubble m={item} own={item.from_staff === staffMode} otherLabel={otherLabel} />
            </View>
          );
        }}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {showAttach ? (
          <View style={styles.attachRow}>
            {SOURCES.filter((s) => Platform.OS !== 'web' || s.id !== 'camera').map((s) => (
              <Pressable key={s.id} onPress={() => choose(s.id)} style={styles.attachBtn} accessibilityRole="button" testID={`attach-${s.id}`}>
                <Ionicons name={s.icon} size={22} color={colors.secondary} />
                <Text style={styles.attachLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {file ? (
          <View style={styles.pending}>
            <Ionicons name="document-attach-outline" size={18} color={colors.secondary} />
            <Text style={[ui.muted, { flex: 1 }]} numberOfLines={1}>
              {file.name} {file.size ? `· ${formatBytes(file.size)}` : ''}
            </Text>
            <Pressable onPress={() => setFile(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Убрать файл">
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}
        <View style={ui.row}>
          <Pressable onPress={() => setShowAttach((v) => !v)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Прикрепить файл" testID="chat-attach">
            <Ionicons name={showAttach ? 'close' : 'attach'} size={24} color={colors.secondary} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Сообщение"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            style={styles.input}
            accessibilityLabel="Текст сообщения"
            testID="chat-input"
          />
          <Pressable onPress={send} disabled={!canSend} style={[styles.sendBtn, !canSend && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Отправить" testID="chat-send">
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  intro: { textAlign: 'center', marginBottom: spacing.md },
  day: { ...font.caption, color: colors.textMuted, textAlign: 'center', marginVertical: spacing.sm, textTransform: 'uppercase' },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 4 },
  bubbleOwn: { backgroundColor: colors.secondary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  sender: { ...font.caption, color: colors.primaryDark },
  meta: { fontSize: 11, color: colors.textMuted },
  metaOwn: { color: 'rgba(255,255,255,0.8)' },
  file: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.secondarySoft, minHeight: HIT },
  fileOwn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  fileName: { ...font.small, fontWeight: '600', color: colors.text },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, gap: spacing.sm },
  attachRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm },
  attachBtn: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.secondarySoft, minHeight: HIT },
  attachLabel: { ...font.small, color: colors.secondary, fontWeight: '600' },
  pending: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  iconBtn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, ...font.body, color: colors.text, maxHeight: 120, minHeight: HIT, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surface },
  sendBtn: { width: HIT, height: HIT, borderRadius: HIT / 2, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
});
