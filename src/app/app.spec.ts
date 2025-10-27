import { TestBed } from '@angular/core/testing';
import { App } from './app';

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

  it('should render title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.switchLanguage('es');
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const logoText = compiled.querySelector('.logo')?.textContent?.trim();
    expect(logoText).toBe('Anotador de PDF');
  });
});
