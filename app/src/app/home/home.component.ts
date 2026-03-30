import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { LoginComponent } from '../auth/login.component';
import { AuthFacadeService } from '../services/auth-facade.service';
import { WorkspaceComponent } from '../workspace/workspace.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, LoginComponent, WorkspaceComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  protected readonly auth = inject(AuthFacadeService);
}
