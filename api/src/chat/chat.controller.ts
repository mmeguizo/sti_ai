import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AuthSyncService } from '../auth/auth.service';
import {
  ChatMessage,
  ChatPersistenceService,
  ChatSession,
} from './chat.persistence.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly aiService: AiService,
    private readonly authSyncService: AuthSyncService,
    private readonly chatPersistenceService: ChatPersistenceService,
  ) {}

  @Get()
  getChatInfo(): { message: string; exampleRequest: { message: string } } {
    return {
      message: 'Use POST /chat with a JSON body containing a message field.',
      exampleRequest: { message: 'Hello' },
    };
  }

  /** Returns the list of past chat sessions for the authenticated user. */
  @Get('history')
  async getChatHistory(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<ChatSession[]> {
    const token = this.requireBearerToken(authorizationHeader);
    const auth0UserId = await this.authSyncService.getUserIdFromToken(token);
    return this.chatPersistenceService.listChats(auth0UserId);
  }

  /** Returns all messages for a specific chat session (must belong to the caller). */
  @Get('history/:chatId')
  async getChatMessages(
    @Param('chatId') chatId: string,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<ChatMessage[]> {
    const token = this.requireBearerToken(authorizationHeader);
    const auth0UserId = await this.authSyncService.getUserIdFromToken(token);
    return this.chatPersistenceService.getMessages(auth0UserId, chatId);
  }

  @Post()
  async chat(
    @Body('message') message: string,
    @Body('chatId') chatId: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<{ reply: string; chatId?: string }> {
    if (typeof message !== 'string' || !message.trim()) {
      throw new BadRequestException('message must be a non-empty string.');
    }

    const trimmedMessage = message.trim();
    const reply = await this.aiService.generateChatResponse(trimmedMessage);

    // Persist the exchange if the caller provided a valid auth token.
    // Errors here are non-fatal — the user still gets their reply.
    const token = this.extractBearerToken(authorizationHeader);
    if (token) {
      try {
        const auth0UserId =
          await this.authSyncService.getUserIdFromToken(token);
        const savedChatId = await this.chatPersistenceService.saveMessagePair(
          auth0UserId,
          chatId ?? null,
          trimmedMessage,
          reply,
          this.aiService.activeModel,
        );
        return { reply, chatId: savedChatId };
      } catch (err) {
        console.warn('Chat persistence failed (non-fatal):', err);
      }
    }

    return { reply };
  }

  /** Requires a bearer token and throws 401 if missing. */
  private requireBearerToken(authorizationHeader?: string): string {
    const token = this.extractBearerToken(authorizationHeader);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token.');
    }
    return token;
  }

  /** Returns the token string or null — used for optional auth paths. */
  private extractBearerToken(authorizationHeader?: string): string | null {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      return null;
    }
    const token = authorizationHeader.substring('Bearer '.length).trim();
    return token || null;
  }
}
