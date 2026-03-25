import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { TicketLookupService } from './ticket-lookup.service';

@Controller('ticket-chat')
export class TicketChatController {
  constructor(
    private readonly aiService: AiService,
    private readonly ticketLookupService: TicketLookupService,
  ) {}

  @Post()
  async chat(@Body('message') message: string): Promise<{ reply: string }> {
    if (typeof message !== 'string' || !message.trim()) {
      throw new BadRequestException('message must be a non-empty string.');
    }

    const trimmedMessage = message.trim();

    console.log(
      '\n=== [ticket-chat] PIPELINE START ==========================',
    );
    console.log('[ticket-chat] 1. Question received:', trimmedMessage);

    // 1. Search MySQL for relevant tickets
    const tickets =
      await this.ticketLookupService.searchTickets(trimmedMessage);

    console.log(
      `[ticket-chat] 2. MySQL keyword search returned ${tickets.length} ticket(s)`,
    );
    if (tickets.length > 0) {
      console.log(
        '[ticket-chat]    First ticket sample:',
        JSON.stringify(tickets[0]).slice(0, 300),
      );
    } else {
      console.log('[ticket-chat]    ⚠ No tickets found by keyword search');
    }

    const ticketContext =
      this.ticketLookupService.formatTicketsForPrompt(tickets);

    console.log(
      `[ticket-chat] 3. Formatted ticket context length: ${ticketContext.length} chars`,
    );

    // 2. Build a strict DB-only prompt
    const systemPrompt = [
      'You are an IT Support Ticket analyst. You answer questions ONLY based on the ticket data provided below.',
      'RULES:',
      '- Use ONLY the data in the TICKET DATA section to form your answer.',
      '- Do NOT use any outside knowledge.',
      '- Do NOT make up or hallucinate information.',
      '- If the data does not contain the answer, say: "I could not find relevant information in the ticket database."',
      '- When referencing tickets, include their key fields (ID, subject, status, etc.) so the user can verify.',
      '- Be concise and factual.',
      '',
      '=== TICKET DATA (from MySQL database) ===',
      ticketContext,
      '=== END TICKET DATA ===',
      '',
      `User question: ${trimmedMessage}`,
    ].join('\n');

    console.log(
      `[ticket-chat] 4. Sending prompt to HuggingFace (${systemPrompt.length} chars)`,
    );

    // 3. Send composed prompt to Hugging Face
    try {
      const reply =
        await this.aiService.generateTicketChatResponse(systemPrompt);
      console.log('[ticket-chat] 5. HuggingFace reply:', reply.slice(0, 500));
      console.log(
        '=== [ticket-chat] PIPELINE END ============================\n',
      );
      return { reply };
    } catch (err) {
      console.error(
        '[ticket-chat] ❌ HuggingFace error:',
        err instanceof Error ? err.message : err,
      );
      console.error(
        '=== [ticket-chat] PIPELINE FAILED =========================\n',
      );
      throw err;
    }
  }
}
