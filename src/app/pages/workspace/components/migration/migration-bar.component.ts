import { FocusTrapDirective } from '../../../../directives/focus-trap.directive';
import { AiModelSelectComponent } from '../../../../components/ai-model-select/ai-model-select.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnInit, ViewChild, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { AiInstructionsComponent } from '../../../../components/ai-instructions/ai-instructions.component';
import { BatchStoreService } from '../../../../services/batch-store.service';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import type { NoticeId, WorkspacePageComponent } from '../../workspace.page';
import { AdjustReviewComponent } from './adjust-review.component';

/** Top bar of the editor while a PDF of a batch is open: B is edited, A is the reference. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-migration-bar',
  standalone: true,
  imports: [FocusTrapDirective, CommonModule, TranslationPipe, AdjustReviewComponent, AiModelSelectComponent, AiInstructionsComponent],
  templateUrl: './migration-bar.component.html',
})
export class MigrationBarComponent implements OnInit {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  readonly store = inject(BatchStoreService);
  /** PDF of the batch open in the editor (for its AI instructions, A6). */
  readonly batchItem = this.store.activeItem;
  /** Saves the instructions typed for one PDF (the id it was typed for, even if another PDF is open now). */
  readonly saveInstructions = (text: string, id: string): void => {
    if (id && this.store.find(id)) {
      this.store.setItemAiInstructions(id, text);
    }
  };

  readonly modes = ['overlay', 'toggle', 'split'] as const;
  readonly menuOpen = signal(false);
  /** Mode waiting for confirmation because B already has fields. */
  readonly confirmMode = signal<'replace' | null>(null);
  readonly readyOpen = signal(false);
  readonly bellOpen = signal(false);
  readonly loteOpen = signal(false);
  /** The «Lote» menu stays open while one of its nested panels (put A, AI) is open. */
  readonly loteVisible = () => this.loteOpen() || this.menuOpen() || this.vm.aiPanelOpen();
  @ViewChild('bell') private bellButton?: ElementRef<HTMLButtonElement>;

  private seenPutCopy = -1;

  constructor() {
    // The command palette asks for «Poner plantilla A · copiar tal cual»: same flow as the menu.
    effect(() => {
      const request = this.vm.putACopyRequest();
      if (this.seenPutCopy >= 0 && request !== this.seenPutCopy) {
        this.menuOpen.set(true);
        this.putCopy();
      }
      this.seenPutCopy = request;
    });
  }

  ngOnInit(): void {
    this.vm.aiHelper.checkIfLocal();
  }

  providerName(): string {
    const provider = this.vm.aiHelper.provider();
    return provider === 'copilot' ? 'Copilot' : provider === 'fake' ? 'Simulado' : 'Claude';
  }

  chipState(): 'unknown' | 'checking' | 'offline' | 'noCli' | 'ready' | 'limit' {
    const error = this.vm.ai()?.error;
    if (error?.code === 'limit') {
      return 'limit';
    }
    const state = this.vm.aiHelper.connection();
    return state === 'unknown' ? 'offline' : state;
  }

  toggleAiPanel(): void {
    if (this.vm.aiPanelOpen()) {
      this.vm.aiPanelOpen.set(false);
      return;
    }
    this.vm.openAiPanel();
  }

  recheckAi(): void {
    void this.vm.aiHelper.check();
  }

  putAi(): void {
    this.closeMenu();
    void this.vm.startAi();
  }

  toggleBell(): void {
    this.bellOpen.update((open) => !open);
  }

  showAllNotices(): void {
    this.vm.reopenNotice(null);
    this.bellOpen.set(false);
  }

  reopenNotice(id: NoticeId): void {
    this.vm.reopenNotice(id);
    if (!this.vm.closedNoticeList().length) {
      this.bellOpen.set(false);
    }
  }

  /** Closes a notice and leaves the keyboard focus on the bell, where it can be found again. */
  closeNotice(id: NoticeId): void {
    this.vm.closeNotice(id);
    setTimeout(() => this.bellButton?.nativeElement.focus());
  }


  toggleMenu(): void {
    this.confirmMode.set(null);
    this.menuOpen.update((open) => !open);
  }

  putCopy(): void {
    if (this.vm.annotationCount() > 0) {
      this.confirmMode.set('replace');
      return;
    }
    this.closeMenu();
    this.vm.applyTemplateA('replace');
  }

  putAdjust(): void {
    this.closeMenu();
    void this.vm.startAdjust();
  }

  putMissing(): void {
    this.closeMenu();
    this.vm.applyTemplateA('missing');
  }

  confirmReplace(): void {
    this.closeMenu();
    this.vm.applyTemplateA('replace');
  }

  toggleLote(): void {
    if (this.loteVisible()) {
      this.loteOpen.set(false);
      this.closeMenu();
      this.vm.aiPanelOpen.set(false);
    } else {
      this.loteOpen.set(true);
    }
  }

  closeMenu(): void {
    this.menuOpen.set(false);
    this.confirmMode.set(null);
  }

  openReady(): void {
    this.readyOpen.set(true);
  }

  confirmReady(): void {
    this.readyOpen.set(false);
    void this.vm.markReady();
  }

  /** A click outside a menu or panel closes it (clicking another menu's button switches to it). */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const path = event.composedPath();
    const inside = (selector: string) =>
      path.some((node) => node instanceof Element && node.matches(selector));
    if (!inside('.lote')) {
      this.loteOpen.set(false);
    }
    if (this.menuOpen() && !inside('.migration-menu--put')) {
      this.closeMenu();
    }
    if (this.bellOpen() && !inside('.migration-bell')) {
      this.bellOpen.set(false);
    }
    if (this.vm.aiPanelOpen() && !inside('.ai-chip-wrap')) {
      this.vm.aiPanelOpen.set(false);
    }
  }

  /** Esc closes the open menu or dialog. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.vm.aiConsentOpen()) {
      this.vm.aiConsentOpen.set(false);
      return;
    }
    if (this.loteOpen() && !this.menuOpen() && !this.vm.aiPanelOpen()) {
      this.loteOpen.set(false);
      return;
    }
    if (this.vm.aiPanelOpen()) {
      this.vm.aiPanelOpen.set(false);
      return;
    }
    const ai = this.vm.ai();
    if (ai) {
      if (ai.phase === 'ready' && !this.vm.isNoticeClosed('ai')) {
        this.closeNotice('ai');
      } else if (ai.phase !== 'ready') {
        this.vm.cancelAi();
      }
      return;
    }
    const adjust = this.vm.adjust();
    if (adjust?.card) {
      this.vm.closeAdjustCard();
    } else if (adjust?.phase === 'ready' && !this.vm.isNoticeClosed('adjust')) {
      this.closeNotice('adjust');
    } else if (adjust && adjust.phase !== 'ready') {
      this.vm.cancelAdjust();
    } else if (this.readyOpen()) {
      this.readyOpen.set(false);
    } else if (this.bellOpen()) {
      this.bellOpen.set(false);
      this.bellButton?.nativeElement.focus();
    } else if (this.menuOpen()) {
      this.closeMenu();
    } else if (this.loteOpen()) {
      this.loteOpen.set(false);
    }
  }

  /** Holding «A» shows only the reference (never while typing). */
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.isReferenceKey(event) && !event.repeat) {
      this.vm.holdingReference.set(true);
    }
    if (this.isOriginalKey(event) && !event.repeat) {
      this.vm.holdingOriginal.set(true);
      this.vm.refreshAdjustPreview();
    }
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'a') {
      this.vm.holdingReference.set(false);
    }
    if (event.key.toLowerCase() === 'p' && this.vm.holdingOriginal()) {
      this.vm.holdingOriginal.set(false);
      this.vm.refreshAdjustPreview();
    }
  }

  @HostListener('window:blur')
  onBlur(): void {
    this.vm.holdingReference.set(false);
    if (this.vm.holdingOriginal()) {
      this.vm.holdingOriginal.set(false);
      this.vm.refreshAdjustPreview();
    }
  }

  /** Holding «P» while the proposal is open shows the fields where they are in A. */
  private isOriginalKey(event: KeyboardEvent): boolean {
    if (event.key.toLowerCase() !== 'p' || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
      return false;
    }
    return this.vm.adjust()?.phase === 'ready' && !this.vm.preview() && !this.vm.editing();
  }

  private isReferenceKey(event: KeyboardEvent): boolean {
    if (event.key.toLowerCase() !== 'a' || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
      return false;
    }
    return !this.vm.preview() && !this.vm.editing();
  }
}
