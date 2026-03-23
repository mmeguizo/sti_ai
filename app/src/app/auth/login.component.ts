import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AuthFacadeService } from '../services/auth-facade.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  protected readonly auth = inject(AuthFacadeService);

  protected getAuthErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return 'Unknown login error.';
    }

    const authError = error as {
      message?: string;
      error_description?: string;
    };

    return authError.message || authError.error_description || 'Unknown login error.';
  }
}
