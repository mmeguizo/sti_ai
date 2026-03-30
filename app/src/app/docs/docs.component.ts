import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './docs.component.html',
  styleUrl: './docs.component.css',
})
export class DocsComponent implements OnInit {
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly markdown = signal('');

  protected readonly rendered = computed<SafeHtml>(() => {
    const md = this.markdown();
    if (!md) return '';

    const html = marked.parse(md, {
      gfm: true,
      breaks: true,
    }) as string;

    return this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(html));
  });

  constructor(private sanitizer: DomSanitizer) {}

  async ngOnInit(): Promise<void> {
    try {
      const response = await fetch('/project-docs.md', { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`Failed to load docs (${response.status})`);
      }
      const text = await response.text();
      this.markdown.set(text);
    } catch (err) {
      console.error('Docs load error:', err);
      this.error.set('Could not load documentation right now.');
    } finally {
      this.loading.set(false);
    }
  }
}
