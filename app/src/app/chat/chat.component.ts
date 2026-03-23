import { Component, OnInit, effect, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { take } from 'rxjs';
import { ChatService, ChatSession } from '../services/chat.service';
import { AuthFacadeService } from '../services/auth-facade.service';

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
export class ChatComponent implements OnInit {
  // ── chat messages ──────────────────────────────────────────────────────────
  messages = signal<Message[]>([]);
  messageInput = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);
  loadingLabel = signal('Thinking');

  // ── sidebar ────────────────────────────────────────────────────────────────
  sidebarOpen = signal(true);
  chatSessions = signal<ChatSession[]>([]);
  activeChatId = signal<string | null>(null);
  historyLoading = signal(false);

  @ViewChild('messagesContainer')
  private messagesContainer?: ElementRef<HTMLDivElement>;
  private loadingTimeouts: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private chatService: ChatService,
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
    // Load the chat history list as soon as the component is created
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

  /** Loads an old chat session from Supabase and shows it in the main panel. */
  openChat(session: ChatSession): void {
    if (this.activeChatId() === session.id) return; // already open

    this.authFacade.rawToken$.pipe(take(1)).subscribe((token) => {
      if (!token) return;
      this.historyLoading.set(true);
      this.error.set(null);

      this.chatService.getChatMessages(session.id, token).subscribe({
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
          console.error('Load chat error:', err);
          this.historyLoading.set(false);
        },
      });
    });
  }

  /** Reloads the sidebar list — called after a new chat saves its first message. */
  private loadChatHistory(): void {
    this.authFacade.rawToken$.pipe(take(1)).subscribe((token) => {
      if (!token) return;

      this.chatService.getChatList(token).subscribe({
        next: (sessions) => this.chatSessions.set(sessions),
        error: (err) => console.warn('Could not load chat history:', err),
      });
    });
  }

  // ── send message ───────────────────────────────────────────────────────────

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

    this.messages.update((msgs) => [...msgs, { text: message, sender: 'user' }]);
    this.messageInput.set('');
    this.isLoading.set(true);
    this.error.set(null);
    this.startLoadingSequence();

    this.authFacade.rawToken$.pipe(take(1)).subscribe((token) => {
      this.chatService.sendMessage(message, token, this.activeChatId()).subscribe({
        next: (response) => {
          this.messages.update((msgs) => [...msgs, { text: response.reply, sender: 'bot' }]);

          // When backend returns a chatId for the first time, store it
          // and refresh the sidebar so the new session appears
          if (response.chatId && !this.activeChatId()) {
            this.activeChatId.set(response.chatId);
            this.loadChatHistory();
          } else if (response.chatId) {
            this.activeChatId.set(response.chatId);
          }

          this.finishLoadingState();
        },
        error: (error) => {
          this.error.set(this.formatChatError(error));
          this.finishLoadingState();
          console.error('Chat error:', error);
        },
      });
    });
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

  // ── private helpers ────────────────────────────────────────────────────────

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
