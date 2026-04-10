'use client';

import { ConversationList } from '@/components/chat/conversation-list';

export default function UserChatPage() {
  return <ConversationList basePath="/app/chat" />;
}
