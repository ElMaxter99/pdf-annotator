import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { OfflineLibraryService } from '../../services/offline-library.service';
import { OfflinePdfSummary } from '../../models/offline-library.model';

@Component({
  selector: 'app-library-page',
  standalone: true,
  templateUrl: './library.page.html',
  styleUrls: ['./library.page.scss'],
  imports: [
    CommonModule,
    TranslationPipe,
  ],
})
export class LibraryPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly offlineLibrary = inject(OfflineLibraryService);

  readonly loading = signal(true);
  readonly query = signal('');
  readonly summaries = signal<OfflinePdfSummary[]>([]);
  readonly visibleSummaries = computed(() => this.summaries());

  async ngOnInit(): Promise<void> {
    await this.refreshLibrary();
  }

  async refreshLibrary() {
    this.loading.set(true);
    try {
      const docs = await this.offlineLibrary.listDocuments(this.query());
      this.summaries.set(docs);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(value: string) {
    this.query.set(value);
    await this.refreshLibrary();
  }

  openDocument(id: string) {
    this.router.navigate(['/workspace', id]);
  }

  async deleteDocument(id: string) {
    await this.offlineLibrary.deleteDocument(id);
    await this.refreshLibrary();
  }

  goToLanding() {
    this.router.navigate(['/landing']);
  }

  startNewWorkspace() {
    this.router.navigate(['/workspace']);
  }
}
