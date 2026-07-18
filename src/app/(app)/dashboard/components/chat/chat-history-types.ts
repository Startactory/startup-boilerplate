import type { UIMessage } from 'ai';
import type { MessageCursor } from '@/application/conversation/ports/message-store.port';

export const HISTORY_PAGE_SIZE = 10;

export type ActionResult<T> = { ok: true; data: T } | { ok: false };

export type SwitchedConversation = {
  conversationId: string;
  messages: UIMessage[];
  hasMore: boolean;
  oldestCursor: MessageCursor | null;
};

export type OlderMessagesResult = {
  messages: UIMessage[];
  hasMore: boolean;
  oldestCursor: MessageCursor | null;
};
