'use server';

import { cookies } from 'next/headers';
import * as v from 'valibot';
import { deleteConversation } from '@/application/conversation/delete-conversation';
import {
  type ConversationPage,
  type ConversationSummary,
  listConversations,
} from '@/application/conversation/list-conversations';
import { loadConversation } from '@/application/conversation/load-conversation';
import { loadOlderMessages } from '@/application/conversation/load-older-messages';
import { renameConversation } from '@/application/conversation/rename-conversation';
import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import {
  LAST_CONVERSATION_COOKIE,
  LAST_CONVERSATION_COOKIE_MAX_AGE,
} from '@/core/conversation/cookies';
import { parseInput } from '@/core/errors';
import {
  type ActionResult,
  HISTORY_PAGE_SIZE,
  type OlderMessagesResult,
  type SwitchedConversation,
} from './chat-history-types';

export async function listConversationsAction(args: {
  page: number;
}): Promise<ConversationPage> {
  const result = await listConversations({
    page: args.page,
    perPage: HISTORY_PAGE_SIZE,
  });
  if (result.isOk()) return result.value;
  return { items: [], hasMore: false, page: args.page };
}

export async function switchConversationAction(
  threadId: string,
): Promise<ActionResult<SwitchedConversation>> {
  const result = await loadConversation(threadId);
  if (result.isErr()) return { ok: false };

  const store = await cookies();
  store.set(LAST_CONVERSATION_COOKIE, threadId, {
    path: '/',
    maxAge: LAST_CONVERSATION_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
  });

  return { ok: true, data: result.value };
}

export async function renameConversationAction(args: {
  threadId: string;
  title: string;
}): Promise<ActionResult<ConversationSummary>> {
  const result = await renameConversation(args);
  if (result.isErr()) return { ok: false };
  return { ok: true, data: result.value };
}

const LoadOlderInputSchema = v.object({
  threadId: v.pipe(v.string(), v.minLength(1)),
  before: v.object({
    createdAt: v.pipe(v.string(), v.isoTimestamp()),
    id: v.pipe(v.string(), v.minLength(1)),
  }),
});

export async function loadOlderMessagesAction(
  input: unknown,
): Promise<ActionResult<OlderMessagesResult>> {
  const me = await getCurrentUser();
  if (me.isErr()) return { ok: false };

  const rate = await applyRateLimit({
    identifier: `conversation:load_older:${me.value.id}`,
    limit: 'default',
  });
  if (!rate.success) return { ok: false };

  const parsed = parseInput(
    LoadOlderInputSchema,
    input,
    'Invalid load-older input',
  );
  if (parsed.isErr()) return { ok: false };

  const result = await loadOlderMessages(parsed.value);
  if (result.isErr()) return { ok: false };
  return { ok: true, data: result.value };
}

export async function deleteConversationAction(
  threadId: string,
): Promise<ActionResult<void>> {
  const result = await deleteConversation(threadId);
  if (result.isErr()) return { ok: false };

  const store = await cookies();
  const active = store.get(LAST_CONVERSATION_COOKIE)?.value;
  if (active === threadId) store.delete(LAST_CONVERSATION_COOKIE);

  return { ok: true, data: undefined };
}
