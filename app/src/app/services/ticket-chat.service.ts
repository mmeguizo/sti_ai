import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface TicketChatResponse {
  reply: string;
  chatId?: string;
}

export interface TicketChatSession {
  id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface TicketChatHistoryMessage {
  id: string;
  senderRole: 'user' | 'assistant';
  content: string;
  model: string | null;
  createdAt: string;
}

interface NlSqlResponse {
  answer: string;
  sql: string;
  chatId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TicketChatService {
  private readonly apiUrl = `${environment.apiUrl}/nl-sql`;
  private readonly requestTimeoutMs = 90000; // slightly longer — DB + AI

  constructor(private http: HttpClient) {}

  sendMessage(
    message: string,
    token?: string | null,
    chatId?: string | null,
  ): Observable<TicketChatResponse> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const body: { question: string; chatId?: string } = { question: message };
    if (chatId) {
      body.chatId = chatId;
    }

    return this.http.post<NlSqlResponse>(this.apiUrl, body, { headers }).pipe(
      timeout(this.requestTimeoutMs),
      map((res) => ({ reply: res.answer, chatId: res.chatId })),
    );
  }

  /** Fetches the list of past ticket chat sessions for the authenticated user. */
  getChatList(token: string): Observable<TicketChatSession[]> {
    return this.http.get<TicketChatSession[]>(`${this.apiUrl}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /** Fetches all messages for a specific ticket chat session. */
  getChatMessages(chatId: string, token: string): Observable<TicketChatHistoryMessage[]> {
    return this.http.get<TicketChatHistoryMessage[]>(
      `${this.apiUrl}/history/${encodeURIComponent(chatId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }
}
