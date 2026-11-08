import { defineCatalog } from 'gtfs-zone-web-common/i18n/index';
import { en } from './catalog.en';
import { fr } from './catalog.fr';
import { de } from './catalog.de';

/** Translator for accuracy.rt.gtfs.zone's own UI strings. */
export const t = defineCatalog(en, { fr, de });
