import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { TranslationService } from './i18n/translation.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the localized title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const translation = TestBed.inject(TranslationService);
    expect(compiled.querySelector('.logo')?.textContent?.trim()).toBe(translation.translate('app.title'));
  });
});
