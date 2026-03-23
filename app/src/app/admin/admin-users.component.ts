import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminUserListResponse,
  AdminUserRecord,
  AdminUsersService,
} from '../services/admin-users.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.css',
})
export class AdminUsersComponent implements OnInit {
  private readonly adminUsersService = inject(AdminUsersService);

  protected readonly searchInput = signal('');
  protected readonly users = signal<AdminUserRecord[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly pageSize = 8;
  protected readonly total = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly busyUserId = signal<string | null>(null);

  ngOnInit(): void {
    this.loadUsers();
  }

  protected loadUsers(page = this.page()): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.adminUsersService.listUsers(this.searchInput().trim(), page, this.pageSize).subscribe({
      next: (response: AdminUserListResponse) => {
        this.users.set(response.items);
        this.page.set(response.page);
        this.total.set(response.total);
        this.totalPages.set(response.totalPages);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || error?.message || 'Failed to load users.');
        this.isLoading.set(false);
      },
    });
  }

  protected applySearch(): void {
    this.loadUsers(1);
  }

  protected clearSearch(): void {
    this.searchInput.set('');
    this.loadUsers(1);
  }

  protected goToPreviousPage(): void {
    if (this.page() > 1) {
      this.loadUsers(this.page() - 1);
    }
  }

  protected goToNextPage(): void {
    if (this.page() < this.totalPages()) {
      this.loadUsers(this.page() + 1);
    }
  }

  protected setStatus(user: AdminUserRecord, status: 'active' | 'disabled' | 'pending'): void {
    this.updateUser(user.auth0UserId, { status });
  }

  protected setRole(user: AdminUserRecord, role: 'user' | 'admin'): void {
    this.updateUser(user.auth0UserId, { role });
  }

  protected trackByUserId(_: number, user: AdminUserRecord): string {
    return user.auth0UserId;
  }

  private updateUser(
    auth0UserId: string,
    updates: { role?: 'user' | 'admin'; status?: 'pending' | 'active' | 'disabled' },
  ): void {
    this.busyUserId.set(auth0UserId);
    this.error.set(null);

    this.adminUsersService.updateUser(auth0UserId, updates).subscribe({
      next: (updatedUser) => {
        this.users.update((items) =>
          items.map((item) => (item.auth0UserId === updatedUser.auth0UserId ? updatedUser : item)),
        );
        this.busyUserId.set(null);
      },
      error: (error) => {
        this.error.set(error?.error?.message || error?.message || 'Failed to update user.');
        this.busyUserId.set(null);
      },
    });
  }
}
