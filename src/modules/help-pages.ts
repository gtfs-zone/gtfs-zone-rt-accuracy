/** The help pages: what exists, its grouping, and its copy. */

import { eyebrow, glyphList, lede } from 'gtfs-zone-web-common/ui/help-modal';
import type { AboutApp } from 'gtfs-zone-web-common/ui/about-links';
import {
  aboutPage,
  ICON_CHECK,
  ICON_LEG,
  ICON_LOAD,
  ICON_MAP,
  type HelpPage,
} from 'gtfs-zone-web-common/ui/help-pages';
import { t } from '../i18n/messages';

const welcomePage: HelpPage = {
  id: 'welcome',
  label: t('help.welcome.label'),
  group: 'Getting Started',
  title: t('help.welcome.title'),
  showOnce: true,
  render: () =>
    [
      eyebrow('GTFS.zone'),
      lede(t('help.welcome.lede')),
      glyphList([
        {
          icon: ICON_LOAD,
          term: t('help.welcome.load'),
          description: t('help.welcome.loadText'),
        },
        {
          icon: ICON_CHECK,
          term: t('help.welcome.score'),
          description: t('help.welcome.scoreText'),
        },
        {
          icon: ICON_LEG,
          term: t('help.welcome.baselines'),
          description: t('help.welcome.baselinesText'),
        },
        {
          icon: ICON_MAP,
          term: t('help.welcome.replay'),
          description: t('help.welcome.replayText'),
        },
      ]),
    ].join(''),
};

const baselinesPage: HelpPage = {
  id: 'baselines',
  label: t('help.baselines.label'),
  group: 'Reference',
  title: t('help.baselines.title'),
  render: () =>
    `<ul class="list-disc pl-5 space-y-2 text-sm">${[
      t('help.baselines.schedule'),
      t('help.baselines.lastStop'),
      t('help.baselines.gps'),
      t('help.baselines.floor'),
    ]
      .map((s) => `<li>${s}</li>`)
      .join('')}</ul>
    <p class="text-sm opacity-70">${t('report.method')}</p>`,
};

/** The trip line with the stretch a gps fix may snap to shaded. */
function gpsWindowDiagram(): string {
  const stops = [12, 72, 132, 192, 252, 308]
    .map((x) => `<circle cx="${x}" cy="40" r="3.5" fill="currentColor"/>`)
    .join('');
  const label = (x: number, y: number, text: string, anchor = 'middle') =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="10" fill="currentColor" opacity="0.75">${text}</text>`;
  return `<svg viewBox="0 0 320 76" class="w-full max-w-md" role="img" aria-label="${t('help.gpsWindow.title')}">
    <rect x="56" y="30" width="170" height="20" rx="3" fill="var(--color-primary)" fill-opacity="0.18"/>
    <line x1="12" y1="40" x2="308" y2="40" stroke="currentColor" stroke-width="2" opacity="0.6"/>
    ${stops}
    <line x1="196" y1="24" x2="196" y2="56" stroke="var(--color-primary)" stroke-width="2"/>
    ${label(196, 18, t('help.gpsWindow.scheduled'))}
    <circle cx="120" cy="40" r="6" fill="var(--color-primary)"/>
    ${label(120, 18, t('help.gpsWindow.fix'))}
    ${label(56, 66, t('help.gpsWindow.late'), 'start')}
    ${label(226, 66, t('help.gpsWindow.early'), 'end')}
    <path d="M290 64 h18 m-5 -4 l5 4 l-5 4" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
  </svg>`;
}

const gpsWindowPage: HelpPage = {
  id: 'gps-window',
  label: t('help.gpsWindow.label'),
  group: 'Reference',
  title: t('help.gpsWindow.title'),
  render: () =>
    `<div class="space-y-3 text-sm">
      <p>${t('help.gpsWindow.why')}</p>
      ${gpsWindowDiagram()}
      <ul class="list-disc pl-5 space-y-2">${[
        t('help.gpsWindow.window'),
        t('help.gpsWindow.edges'),
        t('help.gpsWindow.delay'),
        t('help.gpsWindow.origin'),
        t('help.gpsWindow.age'),
      ]
        .map((s) => `<li>${s}</li>`)
        .join('')}</ul>
    </div>`,
};

const ghostsPage: HelpPage = {
  id: 'ghosts',
  label: t('help.ghosts.label'),
  group: 'Reference',
  title: t('help.ghosts.title'),
  render: () =>
    `<div class="space-y-3 text-sm">
      <div class="flex items-center gap-3">
        <svg width="72" height="20" aria-hidden="true">
          <circle cx="10" cy="10" r="6" fill="currentColor"/>
          <line x1="16" y1="10" x2="54" y2="10" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" opacity="0.8"/>
          <circle cx="61" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/>
        </svg>
        <span class="opacity-70">${t('help.ghosts.title')}</span>
      </div>
      <p>${t('help.ghosts.text')}</p>
      <p>${t('help.ghosts.filter')}</p>
    </div>`,
};

const ABOUT_APP: AboutApp = {
  name: 'accuracy.rt.gtfs.zone',
  blurb: [t('help.about.blurb'), t('help.about.blurb2')],
  contactSubject: t('help.about.subject'),
  repo: 'gtfs-zone-rt-accuracy',
  sibling: {
    name: 'viz.rt.gtfs.zone',
    href: 'https://viz.rt.gtfs.zone',
    note: t('help.about.sibling'),
  },
};

export const HELP_PAGES: HelpPage[] = [
  welcomePage,
  baselinesPage,
  gpsWindowPage,
  ghostsPage,
  aboutPage(ABOUT_APP),
];
