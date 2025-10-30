import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-editor-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './editor-footer.component.html',
  styleUrls: ['./editor-footer.component.scss'],
})
export class EditorFooterComponent {
  @Input() appName = '';
  @Input() version = '';
  @Input() currentYear = new Date().getFullYear();
  @Input() appAuthor = '';
}
