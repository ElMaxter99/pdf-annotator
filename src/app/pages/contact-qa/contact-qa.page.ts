import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

interface ContactChannel {
  title: string;
  description: string;
  ctaLabel: string;
  link: string;
  hint?: string;
  icon: string;
}

interface QaHighlight {
  title: string;
  description: string;
  pill: string;
}

@Component({
  selector: 'app-contact-qa-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './contact-qa.page.html',
  styleUrls: ['./contact-qa.page.scss'],
})
export class ContactQaPageComponent {
  readonly contactChannels: ContactChannel[] = [
    {
      title: 'Contacto directo',
      description: 'Respuestas rápidas para bloqueos críticos, dudas de despliegue o repro de bugs.',
      ctaLabel: 'Abrir email',
      link: 'mailto:qa@pdf-annotator.test?subject=Soporte%20QA%20-%20Pdf%20Annotator',
      hint: 'Tiempo de respuesta promedio: < 2h en horario laboral.',
      icon: '📧',
    },
    {
      title: 'Canal síncrono',
      description: 'Sesiones de pairing de QA, validación de flujos complejos y diseño de casos edge.',
      ctaLabel: 'Agendar 25 min',
      link: 'https://cal.com/qa-office-hours',
      hint: 'Incluye checklist previa y enlace de videollamada.',
      icon: '🎥',
    },
    {
      title: 'Feedback continuo',
      description: 'Suscríbete a las notas de regresión, bitácora de fixes y métricas de estabilidad.',
      ctaLabel: 'Ver tablero',
      link: 'https://linear.app/qa/pdf-annotator',
      hint: 'Actualizado cada mañana con prioridades y owners.',
      icon: '📊',
    },
  ];

  readonly qaHighlights: QaHighlight[] = [
    {
      pill: 'Smoke diario',
      title: 'Checklists accionables',
      description:
        'Cobertura diaria de smoke, flujos críticos y verificación de PDFs con anotaciones pesadas.',
    },
    {
      pill: 'DX first',
      title: 'Definición de listo',
      description:
        'Criterios claros por historia: reproducibilidad, trazas, capturas y dataset mínimo de prueba.',
    },
    {
      pill: 'Autonomía',
      title: 'Escalada inmediata',
      description:
        'Canal directo con ingeniería para desbloquear flujos y priorizar regresiones sin fricción.',
    },
  ];

  readonly guardrails: string[] = [
    'Reproducibilidad garantizada: pasos, datos de entrada y resultado esperado en cada ticket.',
    'Validación de accesibilidad en formularios y atajos clave en el visor.',
    'Métricas claras: tiempo de respuesta, severidad y tiempo a fix visible en el tablero.',
    'Ambiente estable: versiones de navegador soportadas y PDFs de prueba versionados.',
  ];
}
