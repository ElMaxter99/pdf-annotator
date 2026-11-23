import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import { AiHelperService, type AiProvider } from '../../services/ai-helper.service';
import { DesktopUpdateService, getDesktopBridge } from '../../services/desktop-update.service';
import { EditorSettingsService } from '../../services/editor-settings.service';
import { OptionsSection, OptionsService } from '../../services/options.service';
import { AI_LIMIT_PRESETS, limitChoice, parseAiLimitInput } from '../../utils/ai-limit.utils';
import { AiModelSelectComponent } from '../ai-model-select/ai-model-select.component';
import { UpdateChannelComponent } from '../update-channel/update-channel.component';

/**
 * Ventana «Opciones» (mesas P-150 a P-152): Actualizaciones e Inteligencia artificial (proveedor, modelo y límite de
 * peticiones por traslado). Todo se guarda al momento; con una sola sección no se muestra la lista.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-options-dialog',
  standalone: true,
  imports: [TranslationPipe, UpdateChannelComponent, AiModelSelectComponent],
  templateUrl: './options-dialog.component.html',
})
export class OptionsDialogComponent {
  readonly options = inject(OptionsService);
  readonly editor = inject(EditorSettingsService);
  readonly snapDistances = [3, 6, 10];
  readonly update = inject(DesktopUpdateService);
  readonly helper = inject(AiHelperService);
  private readonly i18n = inject(TranslationService);

  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;
  @ViewChild('closeBtn') private closeBtn?: ElementRef<HTMLButtonElement>;
  private opener: HTMLElement | null = null;

  readonly presets = AI_LIMIT_PRESETS;
  readonly port = getDesktopBridge()?.helperPort ?? 4310;
  readonly provider = this.helper.provider;
  readonly providers = computed(() =>
    (['claude', 'copilot', 'fake'] as AiProvider[]).filter((p) => p !== 'fake' || this.helper.found()['fake'] === true),
  );
  readonly providerName = computed(() => providerLabel(this.provider()));
  readonly limit = computed(() => this.helper.limitFor(this.provider()));
  readonly choice = computed(() => limitChoice(this.limit()));
  /** «Otro…» abierto (a mano o porque el límite guardado no es uno de los rápidos). */
  readonly otherOpen = signal(false);
  readonly otherText = signal('');
  readonly otherError = signal(false);
  readonly confirmReset = signal(false);
  readonly offline = computed(() => this.helper.connection() === 'offline' || this.helper.connection() === 'unknown');
  readonly noCli = computed(() => this.helper.connection() === 'noCli');
  readonly otherShown = computed(() => this.otherOpen() || this.choice() === 'other');

  readonly updateState = this.update.state;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.onDocumentEscape, true);
      inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', this.onDocumentEscape, true));
    }
    effect(() => {
      const open = this.options.isOpen();
      if (typeof document === 'undefined') return;
      if (open) {
        // Only the opening matters here: typing a limit changes `limit()` and must not reset the dialog.
        untracked(() => {
          this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          this.confirmReset.set(false);
          this.syncOther();
          setTimeout(() => this.closeBtn?.nativeElement.focus());
        });
      } else if (this.opener) {
        this.opener.focus?.();
        this.opener = null;
      }
    });
    effect(() => {
      if (this.options.isOpen() && this.options.section() === 'ai' && this.helper.available) {
        if (this.helper.connection() === 'unknown') this.helper.check();
      }
    });
  }

  private readonly onDocumentEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.options.isOpen() && !document.querySelector('[data-testid="channel-dialog"]')) {
      event.stopPropagation();
      this.options.close();
    }
  };

  /** Prepara el campo de «Otro…» con el límite guardado. */
  private syncOther(): void {
    const limit = this.limit();
    this.otherOpen.set(false);
    this.otherError.set(false);
    this.otherText.set(limit !== null && limitChoice(limit) === 'other' ? String(limit) : '');
  }

  statusText(): string {
    const s = this.updateState();
    const v = { version: s.version, current: s.current };
    if (s.checking) return this.i18n.translate('update.panel.status.checking', v);
    switch (s.status) {
      case 'available':
        return this.i18n.translate(s.prerelease ? 'update.panel.status.availableRc' : 'update.panel.status.available', v);
      case 'downloading':
        return this.i18n.translate('update.panel.status.downloading', v);
      case 'installing':
        return this.i18n.translate('update.panel.status.installing', v);
      case 'ready':
        return this.i18n.translate('update.panel.status.ready', v);
      case 'error':
        return this.i18n.translate('update.panel.status.error', v);
      default:
        return this.i18n.translate(s.lastChecked ? 'update.panel.status.upToDate' : 'update.panel.status.never', v);
    }
  }

  sectionLabel(section: OptionsSection): string {
    return this.i18n.translate(
      section === 'editor'
        ? 'options.editor.title'
        : section === 'updates'
          ? 'options.updates.title'
          : 'options.ai.title',
    );
  }

  providerLabel(p: AiProvider): string {
    return providerLabel(p);
  }

  isDefault(value: number | null): boolean {
    const factory = value === null ? this.provider() !== 'copilot' : value === 10 && this.provider() === 'copilot';
    return factory;
  }

  setProvider(p: AiProvider): void {
    this.helper.setProvider(p);
    this.syncOther();
  }

  chooseLimit(value: number | null): void {
    this.otherOpen.set(false);
    this.otherError.set(false);
    this.helper.setLimit(this.provider(), value);
  }

  openOther(): void {
    this.otherOpen.set(true);
    if (!this.otherText()) {
      const limit = this.limit();
      this.otherText.set(limit !== null ? String(limit) : '');
    }
    setTimeout(() => this.dialog?.nativeElement.querySelector<HTMLInputElement>('[data-testid="options-limit-input"]')?.focus());
  }

  onOtherInput(text: string): void {
    this.otherText.set(text);
    const parsed = parseAiLimitInput(text);
    if (parsed.ok) {
      this.otherError.set(false);
      this.helper.setLimit(this.provider(), parsed.value);
    } else {
      this.otherError.set(true);
    }
  }

  previousLimitText(): string {
    const limit = this.limit();
    return limit === null ? this.i18n.translate('options.ai.limit.inf') : String(limit);
  }

  askReset(): void {
    this.confirmReset.set(true);
  }

  doReset(): void {
    this.helper.resetDefaults();
    this.confirmReset.set(false);
    this.syncOther();
  }

  onNavKeydown(event: KeyboardEvent): void {
    const list = this.options.sections();
    const i = list.indexOf(this.options.section());
    let next = -1;
    if (event.key === 'ArrowDown') next = (i + 1) % list.length;
    else if (event.key === 'ArrowUp') next = (i - 1 + list.length) % list.length;
    if (next < 0) return;
    event.preventDefault();
    this.options.select(list[next]);
    setTimeout(() => this.dialog?.nativeElement.querySelector<HTMLElement>('.options__nav [aria-current="page"]')?.focus());
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.dialog) return;
    const items = Array.from(
      this.dialog.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])'),
    ).filter((el) => !el.closest('[data-testid="channel-dialog"]') && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Ctrl/⌘ + coma abre las Opciones desde cualquier pantalla. */
  @HostListener('document:keydown', ['$event'])
  onGlobalKey(event: KeyboardEvent): void {
    if (event.key === ',' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      if (!this.options.available()) return;
      event.preventDefault();
      if (this.options.isOpen()) this.options.close();
      else this.options.open();
    }
  }
}

function providerLabel(p: AiProvider): string {
  return p === 'claude' ? 'Claude Code' : p === 'copilot' ? 'Copilot CLI' : 'IA';
}
