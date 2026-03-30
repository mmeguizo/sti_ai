import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

export interface TicketRow {
  [column: string]: unknown;
}

@Injectable()
export class TicketLookupService implements OnModuleDestroy {
  private readonly logger = new Logger(TicketLookupService.name);
  private pool: mysql.Pool;
  private textColumns: string[] = [];
  private allColumns: string[] = [];

  constructor(private readonly configService: ConfigService) {
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
      connectionLimit: 5,
    });

    this.discoverColumns().catch((err) =>
      this.logger.error('Failed to discover MySQL columns', err),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /** Discover column names and types once at startup. */
  private async discoverColumns(): Promise<void> {
    const [rows] = await this.pool.query(
      'SHOW COLUMNS FROM `synthetic_it_support_tickets`',
    );
    const columns = rows as Array<{ Field: string; Type: string }>;

    this.allColumns = columns.map((c) => c.Field);

    // Pick text-searchable columns (varchar, text, longtext, etc.)
    this.textColumns = columns
      .filter((c) => /char|text|enum/i.test(c.Type))
      .map((c) => c.Field);

    this.logger.log(
      `Discovered ${this.allColumns.length} columns (${this.textColumns.length} searchable)`,
    );
  }

  /**
   * Search tickets by keywords extracted from the user question.
   * Uses parameterised LIKE queries — no raw user input in SQL.
   */
  async searchTickets(question: string): Promise<TicketRow[]> {
    // Wait for column discovery if it hasn't finished yet
    if (this.textColumns.length === 0) {
      await this.discoverColumns();
    }

    if (this.textColumns.length === 0) {
      return [];
    }

    // Extract meaningful keywords (3+ chars, skip common stop words)
    const stopWords = new Set([
      'the',
      'and',
      'for',
      'are',
      'was',
      'were',
      'been',
      'have',
      'has',
      'had',
      'with',
      'this',
      'that',
      'from',
      'what',
      'how',
      'who',
      'when',
      'where',
      'which',
      'can',
      'you',
      'your',
      'all',
      'about',
      'there',
      'their',
      'they',
      'will',
      'would',
      'could',
      'should',
      'does',
      'not',
      'any',
      'many',
      'much',
      'some',
    ]);

    const keywords = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    console.log('[ticket-lookup] Extracted keywords:', keywords);

    if (keywords.length === 0) {
      console.log('[ticket-lookup] No keywords — returning 15 sample tickets');
      // If no keywords, return a sample of recent tickets for context
      const [rows] = await this.pool.query(
        'SELECT * FROM `synthetic_it_support_tickets` LIMIT 15',
      );
      return rows as TicketRow[];
    }

    // Build WHERE clause: any keyword matches any text column
    const conditions: string[] = [];
    const params: string[] = [];

    for (const keyword of keywords.slice(0, 5)) {
      const colConditions = this.textColumns.map((col) => `\`${col}\` LIKE ?`);
      conditions.push(`(${colConditions.join(' OR ')})`);
      for (let i = 0; i < this.textColumns.length; i++) {
        params.push(`%${keyword}%`);
      }
    }

    const sql = `SELECT * FROM \`synthetic_it_support_tickets\` WHERE ${conditions.join(' OR ')} LIMIT 15`;

    console.log('[ticket-lookup] SQL:', sql);
    console.log('[ticket-lookup] Params:', params);

    const [rows] = await this.pool.query(sql, params);

    console.log(
      `[ticket-lookup] MySQL returned ${(rows as TicketRow[]).length} row(s)`,
    );

    return rows as TicketRow[];
  }

  /** Format ticket rows into a readable context string for the LLM. */
  formatTicketsForPrompt(tickets: TicketRow[]): string {
    if (tickets.length === 0) {
      return 'No matching tickets found in the database.';
    }

    return tickets
      .map((ticket, idx) => {
        const fields = Object.entries(ticket)
          .map(([key, value]) => `  ${key}: ${value ?? 'N/A'}`)
          .join('\n');
        return `--- Ticket ${idx + 1} ---\n${fields}`;
      })
      .join('\n\n');
  }
}
