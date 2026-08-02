import { RIGS, SAIL_LIVERIES } from "./balance.js";

// Catalogue purement visuel du garage. L'index 0 de chaque famille reproduit
// exactement la yole orange d'origine : charger une ancienne sauvegarde ne
// change donc pas son apparence.
const strictCatalog = (entries) => Object.freeze(
  entries.map((entry) => Object.freeze({ ...entry }))
);

export const HULL_PAINTS = strictCatalog([
  { key: "origine", label: "ORANGE BWA", color: 0xff7524 },
  { key: "lagon", label: "BLEU LAGON", color: 0x18bec8 },
  { key: "grenat", label: "GRENAT", color: 0xa92f4c },
  { key: "indigo", label: "INDIGO", color: 0x3d4f91 },
  { key: "soleil", label: "SOLEIL", color: 0xf1b632 },
  { key: "ivoire", label: "IVOIRE", color: 0xe9e1cc }
]);

export const GUNWALE_ACCENTS = strictCatalog([
  { key: "ivoire", label: "IVOIRE", color: 0xfff2c9 },
  { key: "ecume", label: "ÉCUME", color: 0xe9ffff },
  { key: "charbon", label: "CHARBON", color: 0x152530 },
  { key: "lagon", label: "LAGON", color: 0x56eadc },
  { key: "soleil", label: "SOLEIL", color: 0xffcf45 },
  { key: "rose", label: "ROSE MADRAS", color: 0xf15c8a }
]);

// La texture du bwa reste la source du veinage. Ces couleurs sont uniquement
// des teintes multiplicatives et ne prétendent pas changer l'essence du bois.
export const WOOD_FINISHES = strictCatalog([
  { key: "naturel", label: "BOIS NATUREL", color: 0xffffff, roughness: 0.74 },
  { key: "miel", label: "VERNIS MIEL", color: 0xf2c57c, roughness: 0.58 },
  { key: "ambre", label: "AMBRE", color: 0xc98646, roughness: 0.52 },
  { key: "bruni", label: "BOIS BRUNI", color: 0x76503a, roughness: 0.66 }
]);

export const CREW_KITS = strictCatalog([
  { key: "origine", label: "ORANGE BWA", jersey: 0xff7524, shorts: 0x0d2531 },
  { key: "lagon", label: "LAGON", jersey: 0x1de1e8, shorts: 0x103042 },
  { key: "kolibri", label: "KOLIBRI", jersey: 0x42c982, shorts: 0x142d28 },
  { key: "grenat", label: "GRENAT", jersey: 0xef3f75, shorts: 0x331725 },
  { key: "soleil", label: "SOLEIL", jersey: 0xffc531, shorts: 0x302411 },
  { key: "indigo", label: "INDIGO", jersey: 0x7658ff, shorts: 0x211c42 }
]);

// Le profil visuel suit les trois vrais choix de simulation. Le groupe complet
// (mât, voile, marque et déchirures) est transformé ensemble afin qu'aucune
// pièce ne flotte après un changement de gréement.
export const RIG_VISUAL_PROFILES = strictCatalog([
  { key: "misaine", height: 0.92, chord: 0.91, rake: -0.012 },
  { key: "standard", height: 1, chord: 1, rake: 0 },
  { key: "grand", height: 1.055, chord: 1.075, rake: 0.008 }
]);

export const DEFAULT_CUSTOMIZATION = Object.freeze({
  hullColor: 0,
  accentColor: 0,
  woodFinish: 0,
  crewKit: 0,
  sailLivery: 0,
  rig: 1
});

/**
 * Accepte uniquement un index entier appartenant au catalogue. Une valeur
 * issue d'un localStorage corrompu retombe sur un défaut connu au lieu d'être
 * silencieusement arrondie vers une autre option.
 */
export function normalizeCatalogIndex(value, catalog, fallback = 0) {
  const safeFallback = Number.isInteger(fallback) && fallback >= 0 && fallback < catalog.length
    ? fallback
    : 0;
  return Number.isInteger(value) && value >= 0 && value < catalog.length
    ? value
    : safeFallback;
}

/** Normalise un réglage, un profil de garage ou un futur snapshot de replay. */
export function normalizeCustomization(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return Object.freeze({
    hullColor: normalizeCatalogIndex(source.hullColor, HULL_PAINTS, DEFAULT_CUSTOMIZATION.hullColor),
    accentColor: normalizeCatalogIndex(source.accentColor, GUNWALE_ACCENTS, DEFAULT_CUSTOMIZATION.accentColor),
    woodFinish: normalizeCatalogIndex(source.woodFinish, WOOD_FINISHES, DEFAULT_CUSTOMIZATION.woodFinish),
    crewKit: normalizeCatalogIndex(source.crewKit, CREW_KITS, DEFAULT_CUSTOMIZATION.crewKit),
    sailLivery: normalizeCatalogIndex(source.sailLivery, SAIL_LIVERIES, DEFAULT_CUSTOMIZATION.sailLivery),
    rig: normalizeCatalogIndex(source.rig, RIGS, DEFAULT_CUSTOMIZATION.rig)
  });
}

