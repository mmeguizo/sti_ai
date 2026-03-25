import { Component, effect, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { TicketChatService } from '../services/ticket-chat.service';

interface Message {
  text: string;
  sender: 'user' | 'bot';
}

@Component({
  selector: 'app-ticket-chat',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './ticket-chat.component.html',
  styleUrl: './ticket-chat.component.css',
})
export class TicketChatComponent {
  messages = signal<Message[]>([]);
  messageInput = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);
  loadingLabel = signal('Searching tickets');

  @ViewChild('messagesContainer')
  private messagesContainer?: ElementRef<HTMLDivElement>;
  private loadingTimeouts: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private ticketChatService: TicketChatService,
    private sanitizer: DomSanitizer,
  ) {
    effect(() => {
      this.messages();
      this.isLoading();
      queueMicrotask(() => this.scrollToBottom());
    });
  }

  renderBotMarkdown(text: string): SafeHtml {
    const renderedMarkdown = marked.parse(text, {
      gfm: true,
      breaks: true,
    }) as string;

    const sanitizedHtml = DOMPurify.sanitize(renderedMarkdown);
    return this.sanitizer.bypassSecurityTrustHtml(sanitizedHtml);
  }

  clearChat(): void {
    this.messages.set([]);
    this.error.set(null);
    this.messageInput.set('');
  }

  sendMessage(): void {
    const message = this.messageInput().trim();
    if (!message) return;

    this.messages.update((msgs) => [...msgs, { text: message, sender: 'user' }]);
    this.messageInput.set('');
    this.isLoading.set(true);
    this.error.set(null);
    this.startLoadingSequence();

    this.ticketChatService.sendMessage(message).subscribe({
      next: (response) => {
        this.messages.update((msgs) => [...msgs, { text: response.reply, sender: 'bot' }]);
        this.finishLoadingState();
      },
      error: (err) => {
        this.error.set(this.formatError(err));
        this.finishLoadingState();
        console.error('Ticket chat error:', err);
      },
    });
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private startLoadingSequence(): void {
    this.clearLoadingTimeouts();
    this.loadingLabel.set('Searching tickets');

    const phases: Array<[number, string]> = [
      [3000, 'Querying database'],
      [9000, 'Analyzing ticket data with AI'],
      [18000, 'Generating response'],
      [35000, 'Still working, this may take a moment'],
    ];

    for (const [delayMs, label] of phases) {
      const timeoutId = setTimeout(() => this.loadingLabel.set(label), delayMs);
      this.loadingTimeouts.push(timeoutId);
    }
  }

  private finishLoadingState(): void {
    this.clearLoadingTimeouts();
    this.loadingLabel.set('Searching tickets');
    this.isLoading.set(false);
  }

  private clearLoadingTimeouts(): void {
    for (const id of this.loadingTimeouts) clearTimeout(id);
    this.loadingTimeouts = [];
  }

  private formatError(error: unknown): string {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError') {
      return 'The request took too long. The server or AI model may be slow — please try again.';
    }
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Cannot reach the server right now.';
      if (error.status >= 500) {
        const msg = typeof error.error?.message === 'string' ? error.error.message : null;
        return msg || 'Server error while querying tickets.';
      }
    }
    if (error instanceof Error && error.message) return error.message;
    return 'Failed to get a response.';
  }

  private scrollToBottom(): void {
    const el = this.messagesContainer?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }
}
