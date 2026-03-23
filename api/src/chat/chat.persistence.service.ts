import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ChatSession {
  id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  senderRole: 'user' | 'assistant';
  content: string;
  model: string | null;
  createdAt: string;
}

@Injectable()
export class ChatPersistenceService {
  private readonly supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceRoleKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.',
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  /**
   * Saves a user + assistant message pair to Supabase.
   *
   * If chatId is null, a new chat record is created and its id is returned.
   * If chatId is provided, the messages are appended to that existing chat.
   *
   * Returns the chatId that was used (new or existing).
   */
  async saveMessagePair(
    auth0UserId: string,
    chatId: string | null,
    userMessage: string,
    aiReply: string,
    model: string,
  ): Promise<string> {
    let activeChatId = chatId;

    if (!activeChatId) {
      // Use the first 60 chars of the message as the chat title
      const title =
        userMessage.length > 60
          ? userMessage.slice(0, 57) + '...'
          : userMessage;

      const { data, error } = await this.supabase
        .from('chats')
        .insert({ user_id: auth0UserId, title })
        .select('id')
        .single();

      if (error || !data) {
        throw new Error(
          `Failed to create chat record: ${error?.message ?? 'Unknown error'}`,
        );
      }

      activeChatId = data.id as string;
    }

    // Insert both messages in one call
    const { error: msgError } = await this.supabase
      .from('chat_messages')
      .insert([
        {
          chat_id: activeChatId,
          sender_role: 'user',
          content: userMessage,
        },
        {
          chat_id: activeChatId,
          sender_role: 'assistant',
          content: aiReply,
          model,
        },
      ]);

    if (msgError) {
      throw new Error(`Failed to save chat messages: ${msgError.message}`);
    }

    // Keep last_message_at fresh on the parent chat row
    await this.supabase
      .from('chats')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', activeChatId);

    return activeChatId;
  }

  /** Returns all active chats for a user, newest first. */
  async listChats(auth0UserId: string): Promise<ChatSession[]> {
    const { data, error } = await this.supabase
      .from('chats')
      .select('id, title, last_message_at, created_at')
      .eq('user_id', auth0UserId)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to load chat list: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      lastMessageAt: row.last_message_at as string,
      createdAt: row.created_at as string,
    }));
  }

  /**
   * Returns all messages for a specific chat, oldest first.
   * Verifies the chat belongs to auth0UserId to prevent accessing other users' data.
   */
  async getMessages(
    auth0UserId: string,
    chatId: string,
  ): Promise<ChatMessage[]> {
    // Ownership check
    const { data: chat, error: chatError } = await this.supabase
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', auth0UserId)
      .maybeSingle();

    if (chatError) {
      throw new Error(`Failed to verify chat ownership: ${chatError.message}`);
    }
    if (!chat) {
      throw new NotFoundException('Chat not found or access denied.');
    }

    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('id, sender_role, content, model, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to load messages: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      senderRole: row.sender_role as 'user' | 'assistant',
      content: row.content as string,
      model: (row.model as string | null) ?? null,
      createdAt: row.created_at as string,
    }));
  }
}
