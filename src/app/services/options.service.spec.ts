import { TestBed } from '@angular/core/testing';
import { AiHelperService } from './ai-helper.service';
import { DesktopUpdateService } from './desktop-update.service';
import { OptionsService } from './options.service';

describe('OptionsService', () => {
  function service(desktop: boolean, ai: boolean): OptionsService {
    TestBed.configureTestingModule({
      providers: [
        { provide: DesktopUpdateService, useValue: { isDesktop: desktop } },
        { provide: AiHelperService, useValue: { available: ai } },
      ],
    });
    return TestBed.inject(OptionsService);
  }

  it('has no sections (and does not open) on the public web', () => {
    const options = service(false, false);
    expect(options.available()).toBeFalse();
    options.open();
    expect(options.isOpen()).toBeFalse();
  });

  it('offers only the sections that exist and opens on the requested one', () => {
    const options = service(false, true);
    expect(options.sections()).toEqual(['ai']);
    options.open('updates');
    expect(options.section()).toBe('ai');
    expect(options.isOpen()).toBeTrue();
    options.close();
    expect(options.isOpen()).toBeFalse();
  });

  it('lists both sections on the desktop app', () => {
    const options = service(true, true);
    expect(options.sections()).toEqual(['updates', 'ai']);
    options.open('ai');
    expect(options.section()).toBe('ai');
  });
});
