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
  ghostsPage,
  aboutPage(ABOUT_APP),
];
