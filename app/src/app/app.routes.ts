import { Routes } from '@angular/router';
import { DocsComponent } from './docs/docs.component';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'docs', component: DocsComponent },
  { path: '**', redirectTo: '' },
];
