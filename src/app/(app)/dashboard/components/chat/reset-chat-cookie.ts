'use server';

import { cookies } from 'next/headers';
import { LAST_CONVERSATION_COOKIE } from '@/core/conversation/cookies';

export async function resetChatCookie(): Promise<void> {
  const store = await cookies();
  store.delete(LAST_CONVERSATION_COOKIE);
}
