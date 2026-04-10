'use client';

import { use } from 'react';
import { ChatThread } from '@/components/chat/chat-thread';

export default function UserChatThreadPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  return <ChatThread roomId={roomId} backHref="/app/chat" />;
}
