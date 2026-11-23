import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { staffChats } from '../../../lib/chat';
import { supabase } from '../../../lib/supabase';
import { StaffGuard } from '../../../components/admin/EditScreen';
import { ChatView } from '../../../components/ChatView';
import { ScreenHeader, ui } from '../../../components/ui';
import { colors } from '../../../theme';

function StaffChat({ studentId }: { studentId: string }) {
  const [name, setName] = useState('Студент');

  useEffect(() => {
    staffChats()
      .then((rows) => {
        const r = rows.find((x) => x.student_id === studentId);
        if (r) setName(r.full_name || r.email);
        else if (supabase)
          supabase
            .from('student_profiles')
            .select('full_name')
            .eq('user_id', studentId)
            .maybeSingle()
            .then(({ data }) => data?.full_name && setName(data.full_name));
      })
      .catch(() => {});
  }, [studentId]);

  return (
    <View style={ui.screen}>
      <ScreenHeader
        title={name}
        back
        right={
          <Pressable
            onPress={() => router.push({ pathname: '/documents', params: { student: studentId } })}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Документы студента"
            testID="staff-chat-documents"
          >
            <Ionicons name="folder-open-outline" size={24} color={colors.secondary} />
          </Pressable>
        }
      />
      <ChatView studentId={studentId} staffMode />
    </View>
  );
}

export default function StaffChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <StaffGuard title="Чат">
      <StaffChat studentId={String(id)} />
    </StaffGuard>
  );
}
