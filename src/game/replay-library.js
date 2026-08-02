import {
  ReplayVault,
  downloadReplay,
  isReplayCompatible
} from "../sim/replay.js";

export const REPLAY_LIBRARY_LIMIT = 8;

let libraryDialog = null;
let replayLibraryPreviousFocus = null;
let activeGame = null;
let activeOptions = {};

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function safeLabel(value, fallback, maxLength = 80) {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, maxLength) : fallback;
}

function replayMode(item) {
  const replay = safeObject(item?.replay);
  const summary = safeObject(item?.summary);
  const metadata = safeObject(replay.metadata);
  const tourStage = Number.isInteger(summary.tourStage)
    ? summary.tourStage
    : metadata.tourStage;

  if (Number.isInteger(tourStage) && tourStage >= 0) {
    return `Grand Tour · étape ${tourStage + 1}`;
  }

  const explicitMode = safeLabel(summary.mode ?? metadata.mode, "", 48);
  if (explicitMode) return explicitMode;

  const stage = safeLabel(summary.stage ?? metadata.stage, "", 48);
  if (stage) return `Grand Tour · ${stage}`;

  return "Combat solo";
}

function replayDate(value, locale) {
  if (typeof value !== "string" && typeof value !== "number") return "Date inconnue";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Date inconnue";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(parsed);
  } catch {
    return parsed.toISOString().replace("T", " ").slice(0, 16);
  }
}

function replaySeed(replay) {
  return Number.isFinite(replay?.seed)
    ? `0x${(replay.seed >>> 0).toString(16).padStart(8, "0").toUpperCase()}`
    : "—";
}

function replayChecksum(replay) {
  return typeof replay?.finalChecksum === "string"
    && /^[0-9a-f]{8}$/i.test(replay.finalChecksum)
    ? replay.finalChecksum.toLowerCase()
    : "—";
}

/**
 * Convertit une entrée du coffre en libellés bornés et affichables. Le DOM ne
 * reçoit ensuite ces valeurs que via `textContent`, jamais via du HTML.
 */
export function describeReplayEntry(item, locale = "fr-FR") {
  const replay = safeObject(item?.replay);
  let compatible = false;
  try {
    compatible = isReplayCompatible(replay);
  } catch {
    compatible = false;
  }
  return {
    item,
    replay,
    date: replayDate(item?.createdAt, locale),
    mode: replayMode(item),
    seed: replaySeed(replay),
    checksum: replayChecksum(replay),
    compatible,
    compatibility: compatible ? "Compatible" : "Ancienne version"
  };
}

export function listReplayEntries(vault, locale = "fr-FR") {
  let items = [];
  try {
    items = vault?.list?.();
  } catch {
    items = [];
  }
  return (Array.isArray(items) ? items : [])
    .slice(0, REPLAY_LIBRARY_LIMIT)
    .map((item) => describeReplayEntry(item, locale));
}

/**
 * Délègue la mutation au coffre : la clé de stockage reste un détail privé de
 * ReplayVault et ne fuit pas dans l'interface.
 */
export function removeReplayFromVault(vault, id) {
  if (!vault || (typeof id !== "string" && typeof id !== "number")) return false;
  try { return Boolean(vault.remove?.(id)); } catch { return false; }
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createMetric(label, value) {
  const wrapper = createElement("div", "replay-library__metric");
  wrapper.append(
    createElement("dt", "", label),
    createElement("dd", "", value)
  );
  return wrapper;
}

function setStatus(message) {
  const status = libraryDialog?.querySelector("#replayLibraryStatus");
  if (status) status.textContent = message;
}

function resolveVault() {
  return activeOptions.vault
    ?? activeGame?.replayVault
    ?? new ReplayVault(undefined, REPLAY_LIBRARY_LIMIT);
}

function confirmAction(message) {
  return typeof globalThis.confirm === "function"
    ? globalThis.confirm(message)
    : false;
}

function focusableLibraryItems(dialog) {
  return [...dialog.querySelectorAll(
    "button:not([hidden]):not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
  )].filter((node) => !node.hidden);
}

function playEntry(entry) {
  const play = activeOptions.onPlay
    ?? (typeof activeGame?.startReplay === "function"
      ? activeGame.startReplay.bind(activeGame)
      : null);
  if (!play) {
    setStatus("Lecture indisponible dans cet écran.");
    return;
  }
  try {
    const started = play(entry.replay, entry.item);
    if (started === false) {
      setStatus("Ce replay ne peut pas être lancé.");
      return;
    }
    closeReplayLibrary();
  } catch {
    setStatus("Le replay n'a pas pu être lancé.");
  }
}

function createReplayRow(entry) {
  const item = createElement(
    "li",
    `replay-library__item ${entry.compatible ? "is-compatible" : "is-incompatible"}`
  );

  const heading = createElement("div", "replay-library__heading");
  const title = createElement("strong", "", entry.mode);
  const date = createElement("time", "", entry.date);
  if (typeof entry.item?.createdAt === "string") date.dateTime = entry.item.createdAt;
  heading.append(title, date);

  const metrics = createElement("dl", "replay-library__metrics");
  metrics.append(
    createMetric("Seed", entry.seed),
    createMetric("Checksum", entry.checksum),
    createMetric("Lecture", entry.compatibility)
  );

  const actions = createElement("div", "replay-library__item-actions");
  const play = createElement("button", "primary replay-library__play", "LIRE");
  play.type = "button";
  play.disabled = !entry.compatible;
  if (!entry.compatible) {
    play.title = "Replay créé avec une autre version du gameplay";
    play.setAttribute("aria-label", "Lire — indisponible, ancienne version");
  } else {
    play.setAttribute("aria-label", `Lire le replay du ${entry.date}`);
  }
  play.addEventListener("click", () => playEntry(entry));

  const download = createElement("button", "secondary replay-library__download", "TÉLÉCHARGER");
  download.type = "button";
  download.setAttribute("aria-label", `Télécharger le replay du ${entry.date}`);
  download.addEventListener("click", () => {
    const success = downloadReplay(entry.replay);
    setStatus(success
      ? `Replay du ${entry.date} téléchargé.`
      : "Téléchargement indisponible dans ce navigateur.");
  });

  const remove = createElement("button", "secondary danger-soft replay-library__remove", "SUPPRIMER");
  remove.type = "button";
  remove.setAttribute("aria-label", `Supprimer le replay du ${entry.date}`);
  remove.addEventListener("click", () => {
    if (!confirmAction(`Supprimer le replay « ${entry.mode} » du ${entry.date} ?`)) return;
    if (!removeReplayFromVault(resolveVault(), entry.item?.id)) {
      setStatus("Suppression impossible : le stockage local n'est pas disponible.");
      return;
    }
    renderLibrary();
    setStatus(`Replay du ${entry.date} supprimé.`);
  });

  actions.append(play, download, remove);
  item.append(heading, metrics, actions);
  return item;
}

function renderLibrary() {
  if (!libraryDialog) return;
  const list = libraryDialog.querySelector("#replayLibraryList");
  const empty = libraryDialog.querySelector("#replayLibraryEmpty");
  const clear = libraryDialog.querySelector("#replayLibraryClear");
  const entries = listReplayEntries(resolveVault(), activeOptions.locale ?? "fr-FR");

  list.replaceChildren(...entries.map(createReplayRow));
  list.hidden = entries.length === 0;
  empty.hidden = entries.length !== 0;
  clear.disabled = entries.length === 0;
  setStatus(entries.length
    ? `${entries.length} replay${entries.length === 1 ? "" : "s"} conservé${entries.length === 1 ? "" : "s"} sur cet appareil.`
    : "Aucun replay sauvegardé sur cet appareil.");
}

function buildLibrary() {
  const dialog = createElement("dialog", "tour-hub replay-library");
  dialog.id = "replayLibrary";
  dialog.setAttribute("aria-labelledby", "replayLibraryTitle");
  dialog.setAttribute("aria-describedby", "replayLibraryLead");
  dialog.setAttribute("aria-modal", "true");
  dialog.hidden = true;

  const shell = createElement("div", "tour-hub__shell replay-library__shell");
  const header = createElement("header", "tour-hub__header");
  const heading = createElement("div");
  const eyebrow = createElement("span", "eyebrow", "ARCHIVES LOCALES · 8 MAXIMUM");
  const title = createElement("h2", "", "REPLAYOTHÈQUE");
  title.id = "replayLibraryTitle";
  const lead = createElement(
    "p",
    "",
    "Relis exactement une course compatible ou garde son fichier JSON."
  );
  lead.id = "replayLibraryLead";
  heading.append(eyebrow, title, lead);

  const close = createElement("button", "tour-hub__close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fermer la replayothèque");
  close.addEventListener("click", closeReplayLibrary);
  header.append(heading, close);

  const content = createElement("section", "replay-library__content");
  content.setAttribute("aria-label", "Replays sauvegardés");
  const list = createElement("ol", "replay-library__list");
  list.id = "replayLibraryList";
  const empty = createElement(
    "p",
    "replay-library__empty",
    "Aucun replay pour l'instant. Termine un Combat solo ou une étape du Tour."
  );
  empty.id = "replayLibraryEmpty";
  content.append(list, empty);

  const footer = createElement("footer", "tour-hub__actions replay-library__footer");
  const status = createElement("p", "", "");
  status.id = "replayLibraryStatus";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const footerActions = createElement("div");
  const clear = createElement("button", "secondary danger-soft", "TOUT EFFACER");
  clear.id = "replayLibraryClear";
  clear.type = "button";
  clear.addEventListener("click", () => {
    if (!confirmAction("Effacer définitivement tous les replays sauvegardés sur cet appareil ?")) return;
    if (!resolveVault().clear()) {
      setStatus("Effacement impossible : le stockage local n'est pas disponible.");
      return;
    }
    renderLibrary();
    setStatus("Tous les replays ont été effacés.");
  });
  const done = createElement("button", "primary", "FERMER");
  done.type = "button";
  done.addEventListener("click", closeReplayLibrary);
  footerActions.append(clear, done);
  footer.append(status, footerActions);

  shell.append(header, content, footer);
  dialog.append(shell);
  document.body.appendChild(dialog);

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeReplayLibrary();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeReplayLibrary();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeReplayLibrary();
      return;
    }
    // Les navigateurs sans showModal n'imposent pas la modalité : on garde la
    // tabulation dans la replayothèque jusqu'à sa fermeture explicite.
    if (event.key !== "Tab" || typeof dialog.showModal === "function") return;
    const items = focusableLibraryItems(dialog);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  return dialog;
}

export function openReplayLibrary(game, options = {}) {
  if (!globalThis.document?.body || (!game && !options.vault)) return false;
  activeGame = game ?? null;
  activeOptions = safeObject(options);
  if (!libraryDialog?.isConnected) libraryDialog = buildLibrary();

  renderLibrary();
  replayLibraryPreviousFocus = document.activeElement;
  libraryDialog.hidden = false;
  if (typeof libraryDialog.showModal === "function") {
    if (!libraryDialog.open) libraryDialog.showModal();
  } else {
    libraryDialog.setAttribute("open", "");
  }
  const firstPlayable = libraryDialog.querySelector(".replay-library__play:not(:disabled)");
  (firstPlayable ?? libraryDialog.querySelector(".tour-hub__close"))?.focus();
  return true;
}

export function closeReplayLibrary() {
  if (!libraryDialog) return false;
  if (typeof libraryDialog.close === "function" && libraryDialog.open) {
    libraryDialog.close();
  } else {
    libraryDialog.removeAttribute("open");
  }
  libraryDialog.hidden = true;
  replayLibraryPreviousFocus?.focus?.();
  replayLibraryPreviousFocus = null;
  activeGame = null;
  activeOptions = {};
  return true;
}
