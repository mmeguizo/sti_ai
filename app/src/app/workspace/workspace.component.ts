import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AdminUsersComponent } from '../admin/admin-users.component';
import { ChatComponent } from '../chat/chat.component';
import { AuthFacadeService } from '../services/auth-facade.service';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, AdminUsersComponent, ChatComponent],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.css',
})
export class WorkspaceComponent {
  protected readonly auth = inject(AuthFacadeService);
  protected readonly adminView = false;
  protected isAdminView = false;

  protected toggleAdminView(): void {
    this.isAdminView = !this.isAdminView;
  }
}
