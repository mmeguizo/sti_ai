import { Component, effect, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ChatService } from '../services/chat.service';

interface Message {
  text: string;
  sender: 'user' | 'bot';
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent {
  messages = signal<Message[]>([]);
  messageInput = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);
  loadingLabel = signal('Thinking');
  @ViewChild('messagesContainer')
  private messagesContainer?: ElementRef<HTMLDivElement>;
  private loadingTimeouts: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private chatService: ChatService,
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

  sendMessage(): void {
    const message = this.messageInput().trim();
    if (!message) return;

    // Add user message to chat
    this.messages.update((msgs) => [...msgs, { text: message, sender: 'user' }]);
    this.messageInput.set('');
    this.isLoading.set(true);
    this.error.set(null);
    this.startLoadingSequence();

    // Call API
    this.chatService.sendMessage(message).subscribe({
      next: (response) => {
        this.messages.update((msgs) => [...msgs, { text: response.reply, sender: 'bot' }]);
        this.finishLoadingState();
      },
      error: (error) => {
        this.error.set(this.formatChatError(error));
        this.finishLoadingState();
        console.error('Chat error:', error);
      },
    });
  }

  private startLoadingSequence(): void {
    this.clearLoadingTimeouts();
    this.loadingLabel.set('Thinking');

    const phases: Array<[number, string]> = [
      [3000, 'Connecting to demo server'],
      [9000, 'Waking up free server'],
      [18000, 'Generating response'],
      [35000, 'Still working, free hosting can be slow'],
    ];

    for (const [delayMs, label] of phases) {
      const timeoutId = setTimeout(() => this.loadingLabel.set(label), delayMs);
      this.loadingTimeouts.push(timeoutId);
    }
  }

  private finishLoadingState(): void {
    this.clearLoadingTimeouts();
    this.loadingLabel.set('Thinking');
    this.isLoading.set(false);
  }

  private clearLoadingTimeouts(): void {
    for (const timeoutId of this.loadingTimeouts) {
      clearTimeout(timeoutId);
    }
    this.loadingTimeouts = [];
  }

  private formatChatError(error: unknown): string {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError') {
      return 'The demo server or AI model took too long to respond. Free hosting can cold start, so please try again in a moment.';
    }

    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Cannot reach the demo server right now. It may be starting up or temporarily unavailable.';
      }

      if (error.status >= 500) {
        const serverMessage = typeof error.error?.message === 'string' ? error.error.message : null;
        return serverMessage || 'The demo server hit an internal error while generating a reply.';
      }
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Failed to get response from the demo server.';
  }

  private scrollToBottom(): void {
    const el = this.messagesContainer?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }
}
