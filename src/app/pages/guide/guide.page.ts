import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { LanguageSelectorComponent } from '../../components/language-selector/language-selector.component';
import { ThemeToggleComponent } from '../../components/theme-toggle/theme-toggle.component';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { Language, TranslationService } from '../../i18n/translation.service';
import { APP_NAME, APP_VERSION } from '../../app-version';
import { AppMetadataService } from '../../services/app-metadata.service';
import { PendingFileService } from '../../services/pending-file.service';
import { ToastService } from '../../services/toast.service';
import { GUIDE_GROUPS, GUIDE_ICONS, GUIDE_TOPICS, GuideGroup, GuideTopic } from './guide.data';

@Component({
  selector: 'app-guide-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslationPipe, LanguageSelectorComponent, ThemeToggleComponent],
  templateUrl: './guide.page.html',
  styleUrls: ['./guide.page.scss'],
})
export class GuidePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationService);
  private readonly pending = inject(PendingFileService);
  private readonly toast = inject(ToastService);
  private readonly meta = inject(AppMetadataService);

  readonly appName = APP_NAME;
  readonly version = APP_VERSION;
  readonly languages = this.i18n.supportedLanguages;
  readonly language = this.i18n.language;
  readonly groups = GUIDE_GROUPS;
  readonly topics = GUIDE_TOPICS;
  readonly query = signal('');
  readonly opening = signal(false);

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly topicId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: null,
  });

  readonly current = computed<GuideTopic | null>(
    () => this.topics.find((topic) => topic.id === this.topicId()) ?? null
  );
  readonly currentIndex = computed(() => this.topics.findIndex((t) => t.id === this.current()?.id));
  readonly previous = computed(() => this.topics[this.currentIndex() - 1] ?? null);
  readonly next = computed(() => this.topics[this.currentIndex() + 1] ?? null);

  readonly searching = computed(() => this.query().trim().length > 0);
  readonly results = computed(() => {
    this.language();
    const q = this.normalize(this.query());
    if (!q) {
      return this.topics;
    }
    return this.topics.filter((topic) => this.normalize(this.searchText(topic)).includes(q));
  });
  readonly visibleGroups = computed(() => {
    const ids = new Set(this.results().map((t) => t.id));
    return this.groups
      .map((group) => ({ group, items: this.topics.filter((t) => t.group === group && ids.has(t.id)) }))
      .filter((entry) => entry.items.length > 0);
  });

  constructor() {
    this.meta.applyDefaultMetadata();
    effect(() => {
      this.current();
      queueMicrotask(() => this.heading()?.nativeElement.focus({ preventScroll: false }));
    });
  }

  icon(topic: GuideTopic): string {
    return GUIDE_ICONS[topic.icon];
  }

  shot(topic: GuideTopic): string | null {
    return topic.shot ? `/assets/guide/${topic.shot}.webp` : null;
  }

  stepKeys(topic: GuideTopic): string[] {
    return Array.from({ length: topic.steps }, (_, i) => `guide.topics.${topic.id}.s${i + 1}`);
  }

  setLanguage(language: Language) {
    this.i18n.setLanguage(language);
  }

  onQuery(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
  }

  clearQuery() {
    this.query.set('');
  }

  groupLabel(group: GuideGroup): string {
    return `guide.groups.${group}`;
  }

  async tryInApp() {
    if (this.opening()) {
      return;
    }
    this.opening.set(true);
    try {
      const response = await fetch('/examples/factura-ejemplo.pdf');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      this.pending.setPendingFile(new File([blob], 'factura-ejemplo.pdf', { type: 'application/pdf' }));
      await this.router.navigate(['/workspace']);
    } catch (error) {
      console.error('No se pudo cargar el documento de ejemplo.', error);
      this.toast.error(this.i18n.translate('guide.tryFailed'));
    } finally {
      this.opening.set(false);
    }
  }

  private searchText(topic: GuideTopic): string {
    const base = `guide.topics.${topic.id}`;
    const keys = ['title', 'summary', 'tip', ...this.stepKeys(topic).map((k) => k.slice(base.length + 1))];
    return keys.map((key) => this.i18n.translate(`${base}.${key}`)).join(' ');
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }
}
