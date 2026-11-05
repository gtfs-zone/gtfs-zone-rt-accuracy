import {
  renderMoonIcon,
  renderNavIcon,
  renderSunIcon,
  type NavIconName,
} from 'gtfs-zone-web-common/ui/nav-icons';
import {
  githubAction,
  type NavbarAction,
} from 'gtfs-zone-web-common/ui/navbar-actions';
import { t } from '../i18n/messages';

/** The navbar action row. Element ids are wired in `src/index.ts`. */
export const NAVBAR_ACTIONS: NavbarAction[] = [
  {
    kind: 'toggle',
    id: 'theme-toggle',
    label: t('nav.theme'),
    iconOn: renderSunIcon('swap-on h-5 w-5'),
    iconOff: renderMoonIcon('swap-off h-5 w-5'),
    inputClass: 'theme-controller',
    value: 'light',
  },
  { kind: 'locale', id: 'locale-toggle' },
  {
    kind: 'icon',
    id: 'help-btn',
    label: t('nav.guide'),
    icon: renderNavIcon('guide'),
  },
  githubAction('gtfs-zone-rt-accuracy'),
  {
    kind: 'labeled',
    id: 'load-btn',
    label: t('nav.load'),
    icon: renderNavIcon('load', { sizeClass: 'h-4 w-4' }),
    btnClass: 'btn-primary',
  },
];

/** Icons the mobile dock shares with the navbar, by element id. */
export const DOCK_ICONS: [string, NavIconName][] = [
  ['dock-browse', 'browse'],
  ['dock-help', 'guide'],
];
