import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ChatRequest {
  message: string;
  chatId?: string;
}

export interface ChatResponse {
  reply: string;
  /** Returned by the backend when messages were persisted. Reuse for the next turn. */
  chatId?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface ChatHistoryMessage {
  id: string;
  senderRole: 'user' | 'assistant';
  content: string;
  model: string | null;
  createdAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly apiUrl = `${environment.apiUrl}/chat`;
  private readonly requestTimeoutMs = 65000;

  constructor(private http: HttpClient) {}

  sendMessage(
    message: string,
    token?: string | null,
    chatId?: string | null,
  ): Observable<ChatResponse> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const body: ChatRequest = { message };
    if (chatId) {
      body.chatId = chatId;
    }

    return this.http
      .post<ChatResponse>(this.apiUrl, body, { headers })
      .pipe(timeout(this.requestTimeoutMs));
  }

  /** Fetches the list of past chat sessions for the authenticated user. */
  getChatList(token: string): Observable<ChatSession[]> {
    return this.http.get<ChatSession[]>(`${this.apiUrl}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /** Fetches all messages for a specific chat session. */
  getChatMessages(chatId: string, token: string): Observable<ChatHistoryMessage[]> {
    return this.http.get<ChatHistoryMessage[]>(
      `${this.apiUrl}/history/${encodeURIComponent(chatId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }
}
