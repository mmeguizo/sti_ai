import { Component, OnInit, effect, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { take } from 'rxjs';
import { TicketChatService, TicketChatSession } from '../services/ticket-chat.service';
import { AuthFacadeService } from '../services/auth-facade.service';

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
export class TicketChatComponent implements OnInit {
  // ── chat messages ──────────────────────────────────────────────────────────
  messages = signal<Message[]>([]);
  messageInput = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);
  loadingLabel = signal('Analyzing question');

  // ── sidebar ────────────────────────────────────────────────────────────────
  sidebarOpen = signal(true);
  chatSessions = signal<TicketChatSession[]>([]);
  activeChatId = signal<string | null>(null);
  historyLoading = signal(false);

  @ViewChild('messagesContainer')
  private messagesContainer?: ElementRef<HTMLDivElement>;
  private loadingTimeouts: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private ticketChatService: TicketChatService,
    private authFacade: AuthFacadeService,
    private sanitizer: DomSanitizer,
  ) {
    effect(() => {
      this.messages();
      this.isLoading();
      queueMicrotask(() => this.scrollToBottom());
    });
  }

  ngOnInit(): void {
    this.loadChatHistory();
  }

  // ── sidebar actions ────────────────────────────────────────────────────────

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  /** Clears the current conversation so the user can start a new one. */
  newChat(): void {
    this.messages.set([]);
    this.activeChatId.set(null);
    this.error.set(null);
    this.messageInput.set('');
  }

  /** Loads an old ticket chat session and shows it in the main panel. */
  openChat(session: TicketChatSession): void {
    if (this.activeChatId() === session.id) return;

    this.authFacade.rawToken$.pipe(take(1)).subscribe((token) => {
      if (!token) return;
      this.historyLoading.set(true);
      this.error.set(null);

      this.ticketChatService.getChatMessages(session.id, token).subscribe({
        next: (msgs) => {
          this.activeChatId.set(session.id);
          this.messages.set(
            msgs.map((m) => ({
              text: m.content,
              sender: m.senderRole === 'user' ? 'user' : 'bot',
            })),
          );
          this.historyLoading.set(false);
        },
        error: (err) => {
          this.error.set('Failed to load chat. Please try again.');
          console.error('Load ticket chat error:', err);
          this.historyLoading.set(false);
        },
      });
    });
  }

  /** Reloads the sidebar list. */
  private loadChatHistory(): void {
    this.authFacade.rawToken$.pipe(take(1)).subscribe((token) => {
      if (!token) return;

      this.ticketChatService.getChatList(token).subscribe({
        next: (sessions) => this.chatSessions.set(sessions),
        error: (err) => console.warn('Could not load ticket chat history:', err),
      });
    });
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  renderBotMarkdown(text: string): SafeHtml {
    const renderedMarkdown = marked.parse(text, {
      gfm: true,
      breaks: true,
    }) as string;

    const sanitizedHtml = DOMPurify.sanitize(renderedMarkdown);
    return this.sanitizer.bypassSecurityTrustHtml(sanitizedHtml);
  }

  /** Returns a short relative label like "Today", "Yesterday", or a date. */
  sessionDateLabel(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  clearChat(): void {
    this.newChat();
  }

  sendMessage(): void {
    const message = this.messageInput().trim();
    if (!message) return;

    this.messages.update((msgs) => [...msgs, { text: message, sender: 'user' }]);
    this.messageInput.set('');
    this.isLoading.set(true);
    this.error.set(null);
    this.startLoadingSequence();

    this.authFacade.rawToken$.pipe(take(1)).subscribe((token) => {
      this.ticketChatService.sendMessage(message, token, this.activeChatId()).subscribe({
        next: (response) => {
          this.messages.update((msgs) => [...msgs, { text: response.reply, sender: 'bot' }]);

          if (response.chatId && !this.activeChatId()) {
            this.activeChatId.set(response.chatId);
            this.loadChatHistory();
          } else if (response.chatId) {
            this.activeChatId.set(response.chatId);
          }

          this.finishLoadingState();
        },
        error: (err) => {
          this.error.set(this.formatError(err));
          this.finishLoadingState();
          console.error('Ticket chat error:', err);
        },
      });
    });
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private startLoadingSequence(): void {
    this.clearLoadingTimeouts();
    this.loadingLabel.set('Analyzing question');

    const phases: Array<[number, string]> = [
      [3000, 'Generating SQL query'],
      [9000, 'Querying database'],
      [18000, 'Formatting answer with AI'],
      [35000, 'Still working, this may take a moment'],
    ];

    for (const [delayMs, label] of phases) {
      const timeoutId = setTimeout(() => this.loadingLabel.set(label), delayMs);
      this.loadingTimeouts.push(timeoutId);
    }
  }

  private finishLoadingState(): void {
    this.clearLoadingTimeouts();
    this.loadingLabel.set('Analyzing question');
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
