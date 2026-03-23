import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { AiService } from '../ai/ai.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly aiService: AiService) {}

  @Get()
  getChatInfo(): { message: string; exampleRequest: { message: string } } {
    return {
      message: 'Use POST /chat with a JSON body containing a message field.',
      exampleRequest: { message: 'Hello' },
    };
  }

  @Post()
  async chat(@Body('message') message: string): Promise<{ reply: string }> {
    if (typeof message !== 'string' || !message.trim()) {
      throw new BadRequestException('message must be a non-empty string.');
    }

    const reply = await this.aiService.generateChatResponse(message.trim());
    return { reply };
  }
}
