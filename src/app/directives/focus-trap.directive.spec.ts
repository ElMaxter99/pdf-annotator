import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FocusTrapDirective } from './focus-trap.directive';

@Component({
  standalone: true,
  imports: [FocusTrapDirective],
  template: `<div appFocusTrap id="d"><button id="a">A</button><button id="b">B</button></div>`,
})
class HostComponent {}

describe('FocusTrapDirective', () => {
  function tab(el: HTMLElement, shiftKey = false): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev;
  }

  it('wraps Tab from the last to the first element and Shift+Tab the other way', () => {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const a = fixture.nativeElement.querySelector('#a') as HTMLElement;
    const b = fixture.nativeElement.querySelector('#b') as HTMLElement;
    b.focus();
    expect(tab(b).defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(a);
    expect(tab(a, true).defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(b);
    fixture.nativeElement.remove();
  });

  it('does not intercept Tab between inner elements', () => {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const a = fixture.nativeElement.querySelector('#a') as HTMLElement;
    a.focus();
    expect(tab(a).defaultPrevented).toBeFalse();
    fixture.nativeElement.remove();
  });
});
