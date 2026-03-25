import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { NlSqlService } from './nl-sql.service.js';

@Controller('nl-sql')
export class NlSqlController {
  constructor(private readonly nlSqlService: NlSqlService) {}

  @Post()
  async query(
    @Body('question') question: string,
  ): Promise<{ answer: string; sql: string }> {
    if (typeof question !== 'string' || !question.trim()) {
      throw new BadRequestException('question must be a non-empty string.');
    }

    console.log(
      '[nl-sql-controller] Incoming POST /nl-sql — question:',
      question.trim(),
    );

    try {
      const result = await this.nlSqlService.askDatabase(question.trim());
      console.log('[nl-sql-controller] Returning answer to client ✓');
      return result;
    } catch (err) {
      console.error(
        '[nl-sql-controller] ❌ Pipeline error:',
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  }
}
