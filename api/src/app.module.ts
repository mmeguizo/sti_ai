import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat/chat.controller';
import { AiService } from './ai/ai.service';
import { AuthController } from './auth/auth.controller';
import { AuthSyncService } from './auth/auth.service';
import { ChatPersistenceService } from './chat/chat.persistence.service';
import { TicketChatController } from './tickets/ticket-chat.controller';
import { TicketLookupService } from './tickets/ticket-lookup.service';
import { NlSqlController } from './tickets/nl-sql.controller';
import { NlSqlService } from './tickets/nl-sql.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    ChatController,
    AuthController,
    TicketChatController,
    NlSqlController,
  ],
  providers: [
    AiService,
    AuthSyncService,
    ChatPersistenceService,
    TicketLookupService,
    NlSqlService,
  ],
})
export class AppModule {}
