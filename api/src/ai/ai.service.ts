import {
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HfInference } from '@huggingface/inference';

interface QueueEntry {
  id: number;
  releaseToWorker: () => void;
  rejectRequest: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

@Injectable()
export class AiService {
  private readonly hf: HfInference;
  private readonly model: string;
  private readonly fallbackModels = ['Qwen/Qwen2.5-7B-Instruct'];
  private readonly maxConcurrentRequests: number;
  private readonly maxQueuedRequests: number;
  private readonly queueWaitTimeoutMs: number;
  private readonly inferenceTimeoutMs: number;
  private activeRequests = 0;
  private queueSequence = 0;
  private readonly waitingQueue: QueueEntry[] = [];

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('HF_TOKEN');

    if (!token) {
      throw new Error('Missing HF_TOKEN in environment variables.');
    }

    this.hf = new HfInference(token);
    this.model =
      this.configService.get<string>('HF_MODEL') ||
      'meta-llama/Llama-3.1-8B-Instruct';
    this.maxConcurrentRequests = this.getNumericEnv(
      'AI_MAX_CONCURRENT_REQUESTS',
      4,
    );
    this.maxQueuedRequests = this.getNumericEnv('AI_MAX_QUEUE_SIZE', 20);
    this.queueWaitTimeoutMs = this.getNumericEnv('AI_QUEUE_WAIT_TIMEOUT_MS', 15000);
    this.inferenceTimeoutMs = this.getNumericEnv('AI_REQUEST_TIMEOUT_MS', 70000);
  }

  async generateChatResponse(message: string): Promise<string> {
    return this.runWithConcurrencyGuard(async () =>
      this.runWithTimeout(
        () => this.generateChatResponseFromModels(message),
        this.inferenceTimeoutMs,
      ),
    );
  }

  private async generateChatResponseFromModels(message: string): Promise<string> {
    const modelsToTry = [this.model, ...this.fallbackModels].filter(
      (model, index, arr) => arr.indexOf(model) === index,
    );

    try {
      for (const model of modelsToTry) {
        try {
          console.log('Calling HF with model:', model);

          const result = await this.hf.chatCompletion({
            model,
            messages: [
              {
                role: 'user',
                content: message,
              },
            ],
            max_tokens: 400,
          });

          const generatedText = result?.choices?.[0]?.message?.content;
          if (generatedText?.trim()) {
            return generatedText.trim();
          }
        } catch (error) {
          if (this.isModelNotSupportedError(error)) {
            console.warn(
              `HF model not supported by enabled provider: ${model}`,
            );
            continue;
          }
          throw error;
        }
      }

      throw new Error(
        'No configured Hugging Face models are supported by your enabled provider.',
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack =
        error instanceof Error ? error.stack : 'No stack trace';
      console.error('=== HUGGING FACE API ERROR ===');
      console.error('Error message:', errorMessage);
      console.error('Error stack:', errorStack);
      console.error(
        'Full error object:',
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      );
      console.error('=============================');
      throw new InternalServerErrorException(
        'Failed to generate response from Hugging Face.',
      );
    }
  }

  private async runWithConcurrencyGuard<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    await this.acquireExecutionSlot();

    try {
      return await operation();
    } finally {
      this.releaseExecutionSlot();
    }
  }

  private async acquireExecutionSlot(): Promise<void> {
    if (this.activeRequests < this.maxConcurrentRequests) {
      this.activeRequests += 1;
      return;
    }

    if (this.waitingQueue.length >= this.maxQueuedRequests) {
      throw new ServiceUnavailableException(
        'The AI server is busy right now. Please retry in a few moments.',
      );
    }

    await new Promise<void>((resolve, reject) => {
      const queueId = ++this.queueSequence;
      const timeoutHandle = setTimeout(() => {
        const queueIndex = this.waitingQueue.findIndex((entry) => entry.id === queueId);
        if (queueIndex >= 0) {
          this.waitingQueue.splice(queueIndex, 1);
        }

        reject(
          new ServiceUnavailableException(
            'The AI request waited too long in the queue. Please try again.',
          ),
        );
      }, this.queueWaitTimeoutMs);

      this.waitingQueue.push({
        id: queueId,
        timeoutHandle,
        releaseToWorker: () => {
          clearTimeout(timeoutHandle);
          this.activeRequests += 1;
          resolve();
        },
        rejectRequest: reject,
      });
    });
  }

  private releaseExecutionSlot(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    const nextEntry = this.waitingQueue.shift();
    if (!nextEntry) {
      return;
    }

    try {
      nextEntry.releaseToWorker();
    } catch (error) {
      nextEntry.rejectRequest(
        error instanceof Error
          ? error
          : new Error('Failed to release queued AI request.'),
      );
    }
  }

  private async runWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new GatewayTimeoutException(
                'The AI provider took too long to respond. Please try again.',
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private getNumericEnv(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    const parsedValue = Number(rawValue);

    if (!rawValue || !Number.isFinite(parsedValue) || parsedValue <= 0) {
      return fallback;
    }

    return parsedValue;
  }

  private isModelNotSupportedError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const hfError = error as {
      httpResponse?: { body?: { error?: { code?: string } } };
    };

    return hfError.httpResponse?.body?.error?.code === 'model_not_supported';
  }
}
