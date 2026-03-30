import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AdminUsersComponent } from '../admin/admin-users.component';
import { ChatComponent } from '../chat/chat.component';
import { TicketChatComponent } from '../ticket-chat/ticket-chat.component';
import { AuthFacadeService } from '../services/auth-facade.service';

type WorkspaceTab = 'chat' | 'tickets';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, AdminUsersComponent, ChatComponent, TicketChatComponent],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.css',
})
export class WorkspaceComponent {
  protected readonly auth = inject(AuthFacadeService);
  protected readonly adminView = false;
  protected isAdminView = false;
  protected activeTab: WorkspaceTab = 'chat';

  protected toggleAdminView(): void {
    this.isAdminView = !this.isAdminView;
  }

  protected setTab(tab: WorkspaceTab): void {
    this.activeTab = tab;
  }
}
