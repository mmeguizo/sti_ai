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
import { NlSqlService } from './nl-sql.service.js';
import { AuthSyncService } from '../auth/auth.service.js';
import {
  ChatMessage,
  ChatPersistenceService,
  ChatSession,
} from '../chat/chat.persistence.service.js';

@Controller('nl-sql')
export class NlSqlController {
  constructor(
    private readonly nlSqlService: NlSqlService,
    private readonly authSyncService: AuthSyncService,
    private readonly chatPersistenceService: ChatPersistenceService,
  ) {}

  /** Returns the list of past ticket-chat sessions for the authenticated user. */
  @Get('history')
  async getTicketChatHistory(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<ChatSession[]> {
    const token = this.requireBearerToken(authorizationHeader);
    const auth0UserId = await this.authSyncService.getUserIdFromToken(token);
    return this.chatPersistenceService.listChats(auth0UserId, 'ticket');
  }

  /** Returns all messages for a specific ticket-chat session. */
  @Get('history/:chatId')
  async getTicketChatMessages(
    @Param('chatId') chatId: string,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<ChatMessage[]> {
    const token = this.requireBearerToken(authorizationHeader);
    const auth0UserId = await this.authSyncService.getUserIdFromToken(token);
    return this.chatPersistenceService.getMessages(auth0UserId, chatId);
  }

  @Post()
  async query(
    @Body('question') question: string,
    @Body('chatId') chatId: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<{ answer: string; sql: string; chatId?: string }> {
    if (typeof question !== 'string' || !question.trim()) {
      throw new BadRequestException('question must be a non-empty string.');
    }

    const trimmedQuestion = question.trim();
    console.log(
      '[nl-sql-controller] Incoming POST /nl-sql — question:',
      trimmedQuestion,
    );

    try {
      const result = await this.nlSqlService.askDatabase(trimmedQuestion);
      console.log('[nl-sql-controller] Returning answer to client ✓');

      // Persist the exchange if the caller provided a valid auth token.
      const token = this.extractBearerToken(authorizationHeader);
      if (token) {
        try {
          const auth0UserId =
            await this.authSyncService.getUserIdFromToken(token);
          const savedChatId = await this.chatPersistenceService.saveMessagePair(
            auth0UserId,
            chatId ?? null,
            trimmedQuestion,
            result.answer,
            'nl-sql-pipeline',
            'ticket',
          );
          return { ...result, chatId: savedChatId };
        } catch (err) {
          console.warn(
            '[nl-sql-controller] Ticket chat persistence failed (non-fatal):',
            err,
          );
        }
      }

      return result;
    } catch (err) {
      console.error(
        '[nl-sql-controller] ❌ Pipeline error:',
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  }

  private requireBearerToken(authorizationHeader?: string): string {
    const token = this.extractBearerToken(authorizationHeader);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token.');
    }
    return token;
  }

  private extractBearerToken(authorizationHeader?: string): string | null {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      return null;
    }
    const token = authorizationHeader.substring('Bearer '.length).trim();
    return token || null;
  }
}
