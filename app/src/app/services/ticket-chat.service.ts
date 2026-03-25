import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface TicketChatResponse {
  reply: string;
}

@Injectable({
  providedIn: 'root',
})
export class TicketChatService {
  private readonly apiUrl = `${environment.apiUrl}/ticket-chat`;
  private readonly requestTimeoutMs = 90000; // slightly longer — DB + AI

  constructor(private http: HttpClient) {}

  sendMessage(message: string): Observable<TicketChatResponse> {
    return this.http
      .post<TicketChatResponse>(this.apiUrl, { message })
      .pipe(timeout(this.requestTimeoutMs));
  }
}
