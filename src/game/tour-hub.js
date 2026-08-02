import { TOUR_STAGES } from "./balance.js";
import { rankTourBoats } from "./tour-progress.js";

let hub = null;
let previousFocus = null;

function closeHub() {
  if (!hub) return false;
  if (typeof hub.close === "function" && hub.open) hub.close();
  else hub.removeAttribute("open");
  hub.hidden = true;
  hub.classList.add("hidden");
  previousFocus?.focus?.();
  previousFocus = null;
  return true;
}

function focusableHubItems(dialog) {
  return [...dialog.querySelectorAll(
    "button:not([hidden]):not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
  )].filter((node) => {
    if (node.hidden || node.classList?.contains?.("hidden")) return false;
    return typeof node.getClientRects !== "function" || node.getClientRects().length > 0;
  });
}

function stageStatus(progress, index) {
  if (!progress) return index === 0 ? "next" : "locked";
  if (progress.status === "completed") return "done";
  if (progress.results.some((result) => result.stage === index)) return "done";
  if (index === progress.stage) return "next";
  return index < progress.stage ? "done" : "locked";
}

function buildHub(game) {
  const dialog = document.createElement("dialog");
  dialog.id = "tourHub";
  dialog.className = "tour-hub";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-labelledby", "tourHubTitle");
  dialog.setAttribute("aria-describedby", "tourHubLead");
  dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = `
    <div class="tour-hub__shell">
      <header class="tour-hub__header">
        <div>
          <span class="eyebrow">CAMPAGNE LOCALE · 8 ÉTAPES</span>
          <h2 id="tourHubTitle">LE GRAND TOUR</h2>
          <p id="tourHubLead">Huit côtes, huit mers, un seul classement général.</p>
        </div>
        <button type="button" class="tour-hub__close" aria-label="Fermer le Tour">×</button>
      </header>
      <div class="tour-hub__summary">
        <div class="tour-hub__progress">
          <span>PROGRESSION</span>
          <strong id="tourHubProgress">0 / 8</strong>
          <div class="tour-hub__bar" aria-hidden="true"><i></i></div>
        </div>
        <div class="tour-hub__next">
          <span>PROCHAINE ÉTAPE</span>
          <strong id="tourHubNext">SAINTE-ANNE → LE VAUCLIN</strong>
          <small id="tourHubWeather">ALIZÉS FRANCS · POINTE MARIN</small>
        </div>
      </div>
      <ol class="tour-route" id="tourRoute" aria-label="Les huit étapes du Tour"></ol>
      <section class="tour-standings" aria-labelledby="tourStandingsTitle">
        <div class="tour-standings__title">
          <span class="eyebrow">CLASSEMENT GÉNÉRAL</span>
          <h3 id="tourStandingsTitle">LA FLOTTE</h3>
        </div>
        <ol id="tourStandings"></ol>
      </section>
      <footer class="tour-hub__actions">
        <p id="tourHubStorage" role="status">La progression utilise le stockage local de ce navigateur lorsqu'il est disponible.</p>
        <div>
          <button type="button" class="secondary" id="tourHubNew">NOUVEAU TOUR</button>
          <button type="button" class="primary" id="tourHubContinue">COMMENCER LE TOUR</button>
        </div>
      </footer>
    </div>`;
  document.body.appendChild(dialog);

  dialog.querySelector(".tour-hub__close").addEventListener("click", closeHub);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeHub();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeHub();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeHub();
      return;
    }
    // Sans showModal(), le navigateur ne rend ni l'arrière-plan inerte ni la
    // tabulation modale. Le fallback garde donc le focus dans le Tour.
    if (event.key !== "Tab" || typeof dialog.showModal === "function") return;
    const items = focusableHubItems(dialog);
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
  dialog.querySelector("#tourHubContinue").addEventListener("click", () => {
    const progress = game.tourStore().load();
    closeHub();
    if (progress?.status === "active") game.resumeTour();
    else game.startNewTour();
  });
  dialog.querySelector("#tourHubNew").addEventListener("click", () => {
    const progress = game.tourStore().load();
    if (progress?.status === "active" && !globalThis.confirm?.("Abandonner la progression actuelle et recommencer le Tour ?")) return;
    closeHub();
    game.startNewTour();
  });
  return dialog;
}

function renderStages(dialog, progress) {
  const route = dialog.querySelector("#tourRoute");
  route.replaceChildren();
  TOUR_STAGES.forEach((stage, index) => {
    const status = stageStatus(progress, index);
    const item = document.createElement("li");
    item.className = `tour-route__stage is-${status}`;
    item.style.setProperty("--stage-accent", stage.accent);
    item.innerHTML = `
      <span class="tour-route__number">${String(index + 1).padStart(2, "0")}</span>
      <span class="tour-route__copy">
        <strong></strong>
        <small></small>
        <em></em>
      </span>
      <span class="tour-route__state" aria-label="${status === "done" ? "Étape terminée" : status === "next" ? "Prochaine étape" : "Étape verrouillée"}">
        ${status === "done" ? "✓" : status === "next" ? "→" : "·"}
      </span>`;
    item.querySelector("strong").textContent = stage.name;
    item.querySelector("small").textContent = `${stage.weatherLabel} · ${stage.landmark}`;
    item.querySelector("em").textContent = stage.tagline;
    route.appendChild(item);
  });
}

function renderStandings(dialog, game, progress) {
  const list = dialog.querySelector("#tourStandings");
  list.replaceChildren();
  const points = progress?.points ?? game.boats.map(() => 0);
  const ranking = rankTourBoats(points, progress?.results ?? [], game.boats.length);
  ranking.forEach((entry, index) => {
    const boat = game.boats[entry.id];
    const item = document.createElement("li");
    item.innerHTML = `
      <span class="tour-standings__place">${index + 1}</span>
      <i style="--boat-color:#${boat.color.toString(16).padStart(6, "0")}"></i>
      <strong></strong>
      <small>${entry.wins} victoire${entry.wins === 1 ? "" : "s"}</small>
      <b>${entry.points} pts</b>`;
    item.querySelector("strong").textContent = boat.name;
    list.appendChild(item);
  });
}

export function openTourHub(game) {
  if (!globalThis.document || !game) return false;
  hub ??= buildHub(game);
  const progress = game.tourStore().load();
  const storageUnavailable = game.tourPersistenceAvailable === false
    || typeof game.tourStore().storage?.setItem !== "function";
  const completeCount = progress?.results?.length ?? 0;
  const stageIndex = progress?.status === "active" ? progress.stage : 0;
  const stage = TOUR_STAGES[stageIndex];
  hub.querySelector("#tourHubProgress").textContent = `${completeCount} / ${TOUR_STAGES.length}`;
  hub.querySelector(".tour-hub__bar i").style.width = `${completeCount / TOUR_STAGES.length * 100}%`;
  hub.querySelector("#tourHubNext").textContent = progress?.status === "completed" ? "TOUR TERMINÉ" : stage.name;
  hub.querySelector("#tourHubWeather").textContent = progress?.status === "completed"
    ? "LE PODIUM EST CONSERVÉ SUR CET APPAREIL"
    : `${stage.weatherLabel.toUpperCase()} · ${stage.landmark.toUpperCase()}`;
  hub.querySelector("#tourHubContinue").textContent = progress?.status === "active"
    ? `CONTINUER · ÉTAPE ${stageIndex + 1}`
    : "COMMENCER LE TOUR";
  hub.querySelector("#tourHubNew").classList.toggle("hidden", !progress);
  hub.querySelector("#tourHubStorage").textContent = storageUnavailable
    ? "⚠ Stockage local indisponible : le Tour restera jouable, mais seulement pendant cette session."
    : "La course en cours reprend au départ de l'étape. Les étapes terminées sont conservées sur cet appareil.";
  renderStages(hub, progress);
  renderStandings(hub, game, progress);
  previousFocus = document.activeElement;
  hub.hidden = false;
  hub.classList.remove("hidden");
  if (typeof hub.showModal === "function") {
    if (!hub.open) hub.showModal();
  } else {
    hub.setAttribute("open", "");
  }
  // Sur mobile, focaliser le CTA du footer faisait ouvrir le Tour directement
  // au milieu de la route. La fermeture en tête est une cible sûre et garde la
  // première étape visible ; Start reste raccordé à l'action principale.
  hub.scrollTop = 0;
  hub.querySelector(".tour-hub__close")?.focus({ preventScroll: true });
  hub.scrollTop = 0;
  return true;
}

export const closeTourHub = closeHub;
