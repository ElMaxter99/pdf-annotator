import { Directive, ElementRef, Input, OnDestroy, OnInit } from '@angular/core';
import { GuidedTourService } from './guided-tour.service';

@Directive({
  selector: '[appGuideAnchor]',
  standalone: true,
})
export class GuidedTourAnchorDirective implements OnInit, OnDestroy {
  @Input({ required: true }) appGuideAnchor!: string;

  constructor(private readonly elementRef: ElementRef<HTMLElement>, private readonly tour: GuidedTourService) {}

  ngOnInit() {
    if (this.appGuideAnchor) {
      this.tour.registerAnchor(this.appGuideAnchor, this.elementRef.nativeElement);
    }
  }

  ngOnDestroy() {
    if (this.appGuideAnchor) {
      this.tour.unregisterAnchor(this.appGuideAnchor, this.elementRef.nativeElement);
    }
  }
}
