import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat/chat.controller';
import { AiService } from './ai/ai.service';
import { AuthController } from './auth/auth.controller';
import { AuthSyncService } from './auth/auth.service';
import { ChatPersistenceService } from './chat/chat.persistence.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [ChatController, AuthController],
  providers: [AiService, AuthSyncService, ChatPersistenceService],
})
export class AppModule {}
