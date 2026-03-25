/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';
import { HfInference } from '@huggingface/inference';
import {
  SQL_PROMPT,
  ANSWER_PROMPT,
  validateSelectOnly,
  extractSql,
} from './ask-database.js';

@Injectable()
export class NlSqlService implements OnModuleDestroy {
  private readonly logger = new Logger(NlSqlService.name);
  private readonly pool: mysql.Pool;
  private readonly hf: HfInference;
  private readonly model: string;
  private readonly table = 'synthetic_it_support_tickets';
  private schemaCache: string | null = null;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('HF_TOKEN');
    if (!token) {
      throw new Error('Missing HF_TOKEN in environment variables.');
    }

    this.hf = new HfInference(token);
    this.model =
      this.configService.get<string>('HF_MODEL') ||
      'meta-llama/Llama-3.1-8B-Instruct';

    this.pool = mysql.createPool({
      host: this.configService.get<string>('MYSQL_HOST', 'localhost'),
      port: Number(this.configService.get<string>('MYSQL_PORT', '3306')),
      user: this.configService.get<string>('MYSQL_USER', 'root'),
      password: this.configService.get<string>('MYSQL_PASSWORD', ''),
      database: this.configService.get<string>(
        'MYSQL_DATABASE',
        'it_support_ticket',
      ),
      waitForConnections: true,
      connectionLimit: 3,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Calls HuggingFace chatCompletion (conversational task) —
   * the same method that works in AiService.
   */
  private async callHuggingFace(prompt: string): Promise<string> {
    const result = await this.hf.chatCompletion({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    });

    return result?.choices?.[0]?.message?.content?.trim() ?? '';
  }

  /**
   * Pipeline: natural-language question → SQL → answer.
   * Returns both the generated SQL and the human-readable answer.
   */
  async askDatabase(
    question: string,
  ): Promise<{ answer: string; sql: string }> {
    console.log(
      '\n=== [nl-sql] PIPELINE START ================================',
    );
    console.log('[nl-sql] 1. Question received:', question);

    const schema = await this.getSchema();
    console.log(`[nl-sql] 2. Table schema loaded (${schema.length} chars)`);

    // Step 1 — Build the SQL-generation prompt via LangChain template
    const sqlPromptText = await SQL_PROMPT.format({ schema, question });
    console.log(
      '[nl-sql] 3. Sending SQL prompt to HuggingFace chatCompletion...',
    );
    console.log(
      `[nl-sql]    Prompt preview (first 300 chars): ${sqlPromptText.slice(0, 300)}`,
    );

    let rawSql: string;
    try {
      rawSql = await this.callHuggingFace(sqlPromptText);
      console.log('[nl-sql] 4. Raw HuggingFace SQL response:', rawSql);
    } catch (err) {
      console.error(
        '[nl-sql] ❌ HuggingFace SQL generation FAILED:',
        err instanceof Error ? err.message : err,
      );
      console.error(
        '=== [nl-sql] PIPELINE FAILED ===============================\n',
      );
      throw err;
    }

    const sql = extractSql(rawSql);
    console.log('[nl-sql] 5. Extracted SQL:', sql);

    // Step 2 — Security: SELECT only
    try {
      validateSelectOnly(sql);
      console.log('[nl-sql] 6. Security check PASSED (SELECT only)');
    } catch (err) {
      console.error(
        '[nl-sql] ❌ Security check FAILED:',
        err instanceof Error ? err.message : err,
      );
      console.error(
        '=== [nl-sql] PIPELINE FAILED ===============================\n',
      );
      throw err;
    }

    // Step 3 — Execute
    console.log('[nl-sql] 7. Executing SQL against MySQL...');
    let rows: any;
    try {
      [rows] = await this.pool.query(sql);
      console.log(
        `[nl-sql] 8. MySQL returned ${Array.isArray(rows) ? rows.length : '?'} row(s)`,
      );
      console.log(
        '[nl-sql]    Result preview:',
        JSON.stringify(rows).slice(0, 500),
      );
    } catch (err) {
      console.error(
        '[nl-sql] ❌ MySQL query FAILED:',
        err instanceof Error ? err.message : err,
      );
      console.error(
        '=== [nl-sql] PIPELINE FAILED ===============================\n',
      );
      throw err;
    }

    const results = JSON.stringify(rows, null, 2).slice(0, 4000);

    // Step 4 — Natural-language answer
    const answerPromptText = await ANSWER_PROMPT.format({
      question,
      sql,
      results,
    });
    console.log('[nl-sql] 9. Sending results to HuggingFace for NL answer...');

    let answer: string;
    try {
      answer = await this.callHuggingFace(answerPromptText);
      console.log(
        '[nl-sql] 10. HuggingFace NL answer:',
        answer.trim().slice(0, 500),
      );
    } catch (err) {
      console.error(
        '[nl-sql] ❌ HuggingFace answer formatting FAILED:',
        err instanceof Error ? err.message : err,
      );
      console.error(
        '=== [nl-sql] PIPELINE FAILED ===============================\n',
      );
      throw err;
    }

    console.log(
      '=== [nl-sql] PIPELINE END ==================================\n',
    );
    return { answer: answer.trim(), sql };
  }

  /** Reads and caches the CREATE TABLE statement for the ticket table. */
  private async getSchema(): Promise<string> {
    if (this.schemaCache) return this.schemaCache;

    const [rows] = await this.pool.query(`SHOW CREATE TABLE \`${this.table}\``);
    this.schemaCache = (rows as any[])[0]?.['Create Table'] ?? '';

    if (!this.schemaCache) {
      throw new Error(`Could not read schema for table ${this.table}`);
    }

    this.logger.log('Cached table schema for NL-SQL pipeline');
    return this.schemaCache;
  }
}
