/**
 * Mounts the shared app shell. Imported first by `index.ts`, so the markup
 * exists before any other module looks up an element id.
 */

import { mountAppShell } from 'gtfs-zone-web-common/ui/app-shell';
import { t } from './i18n/messages';

mountAppShell({
  brandPrefix: 'accuracy',
  brandSuffix: '.rt.gtfs.zone',
  panelPlaceholder: t('shell.noData'),
  dock: [
    { id: 'dock-browse', label: t('shell.browse'), active: true },
    { id: 'dock-help', label: t('shell.help') },
  ],
});

// The map search has nothing to search here.
document.getElementById('map-search-card')?.classList.add('hidden');
