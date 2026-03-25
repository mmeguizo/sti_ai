/**
 * Natural-language → MySQL → Natural-language answer pipeline.
 *
 * Uses LangChain (PromptTemplate + RunnableSequence) with HuggingFace
 * for NL-to-SQL translation and answer formatting.
 *
 * SECURITY: Only SELECT queries are permitted — all mutations are blocked.
 *
 * Exported for reuse:
 *   askDatabase(question)  — standalone convenience function
 *   SQL_PROMPT / ANSWER_PROMPT — LangChain prompt templates
 *   validateSelectOnly / extractSql — helper utilities
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { PromptTemplate } from '@langchain/core/prompts';
import { HfInference } from '@huggingface/inference';
import * as mysql from 'mysql2/promise';

// ─── Prompt templates ──────────────────────────────────────────────

export const SQL_PROMPT = PromptTemplate.fromTemplate(
  `You are a MySQL expert. Given the table schema below, write a single SELECT query that answers the user's question.

RULES:
- Return ONLY the raw SQL query, nothing else.
- Only SELECT is allowed — never INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or any other statement.
- Do not wrap the query in markdown code fences or backticks.
- End the query with a semicolon.
- If the question cannot be answered from the schema, write: SELECT 'Cannot answer from available data' AS answer;

Schema:
{schema}

Question: {question}

SQL:`,
);

export const ANSWER_PROMPT = PromptTemplate.fromTemplate(
  `You are an IT support analyst. Given a user's question, the SQL query that was run, and the result rows, write a clear, concise natural-language answer. Only state facts present in the results.

Question: {question}
SQL query: {sql}
Result rows:
{results}

Answer:`,
);

// ─── Security helpers ──────────────────────────────────────────────

const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'REPLACE',
  'MERGE',
  'EXEC',
  'EXECUTE',
  'GRANT',
  'REVOKE',
  'CALL',
  'LOAD ',
  'SET ',
];

/**
 * Validates that a SQL string is a read-only SELECT statement.
 * Throws if any mutation keyword is detected.
 */
export function validateSelectOnly(sql: string): void {
  const upper = sql.trim().replace(/\s+/g, ' ').toUpperCase();

  if (!upper.startsWith('SELECT')) {
    throw new Error('Only SELECT queries are permitted.');
  }

  for (const kw of FORBIDDEN_KEYWORDS) {
    if (upper.includes(kw)) {
      throw new Error(`Forbidden SQL keyword detected: ${kw.trim()}`);
    }
  }
}

/**
 * Extracts a SQL SELECT statement from an LLM response that may
 * contain markdown fences, explanation text, etc.
 */
export function extractSql(raw: string): string {
  // Try markdown code fences first
  const fenced = raw.match(/```(?:sql)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Try to find a SELECT … ; statement
  const stmt = raw.match(/SELECT[\s\S]*?;/i);
  if (stmt) return stmt[0].trim();

  // Fallback: use the raw response trimmed
  return raw.trim();
}

// ─── Core pipeline ─────────────────────────────────────────────────

const TABLE_NAME = 'synthetic_it_support_tickets';

/**
 * End-to-end pipeline: natural-language question → SQL → answer.
 *
 * 1. Connects to MySQL and reads the table schema.
 * 2. Sends schema + question to HuggingFace (via LangChain) to generate SQL.
 * 3. Validates the generated query is SELECT-only (security guard).
 * 4. Executes the query.
 * 5. Sends the results back to HuggingFace to produce a natural-language answer.
 *
 * @param question  Plain-English question about the ticket data.
 * @returns         Natural-language answer string.
 */
export async function askDatabase(question: string): Promise<string> {
  const host = process.env.MYSQL_HOST ?? 'localhost';
  const port = Number(process.env.MYSQL_PORT ?? '3306');
  const user = process.env.MYSQL_USER ?? 'root';
  const password = process.env.MYSQL_PASSWORD ?? '';
  const database = process.env.MYSQL_DATABASE ?? 'it_support_ticket';
  const hfToken = process.env.HF_TOKEN ?? '';
  const hfModel = process.env.HF_MODEL ?? 'meta-llama/Llama-3.1-8B-Instruct';

  if (!hfToken) {
    throw new Error('HF_TOKEN environment variable is required.');
  }

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
  });

  try {
    // 1 ── Discover table schema
    const [schemaRows] = await conn.query(
      `SHOW CREATE TABLE \`${TABLE_NAME}\``,
    );
    const schema = (schemaRows as any[])[0]?.['Create Table'] ?? '';
    if (!schema) {
      throw new Error(`Could not read schema for table ${TABLE_NAME}`);
    }

    // 2 ── HuggingFace client (uses chatCompletion — conversational task)
    const hf = new HfInference(hfToken);

    async function callHf(prompt: string): Promise<string> {
      const result = await hf.chatCompletion({
        model: hfModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      });
      return result?.choices?.[0]?.message?.content?.trim() ?? '';
    }

    // 3 ── Generate SQL via prompt template + chatCompletion
    const sqlPrompt = await SQL_PROMPT.format({ schema, question });
    const rawSql = await callHf(sqlPrompt);
    const sql = extractSql(rawSql);

    console.log('[askDatabase] Generated SQL:', sql);

    // 4 ── Security gate: SELECT only
    validateSelectOnly(sql);

    // 5 ── Execute the query
    const [rows] = await conn.query(sql);
    const results = JSON.stringify(rows, null, 2).slice(0, 4000);

    // 6 ── Format natural-language answer via chatCompletion
    const answerPrompt = await ANSWER_PROMPT.format({ question, sql, results });
    const answer = await callHf(answerPrompt);

    return answer.trim();
  } finally {
    await conn.end();
  }
}

// ─── Test execution block ──────────────────────────────────────────
// Run directly:  npx ts-node src/tickets/ask-database.ts

if (require.main === module) {
  const testQuestions = [
    'How many high priority tickets do we have?',
    'What are the most common ticket categories?',
    'Show me the latest 5 open tickets',
    'How many tickets are assigned to each agent?',
  ];

  void (async () => {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  NL → SQL Pipeline  —  Test Run          ║');
    console.log('╚══════════════════════════════════════════╝\n');

    for (const q of testQuestions) {
      console.log(`Q: ${q}`);
      try {
        const answer = await askDatabase(q);
        console.log(`A: ${answer}\n`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}\n`);
      }
    }

    process.exit(0);
  })();
}
