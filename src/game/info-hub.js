const SOURCES = Object.freeze([
  {
    label: "UNESCO — sauvegarde de la yole martiniquaise",
    href: "https://ich.unesco.org/en/Decisions/15.COM/8.c.2"
  },
  {
    label: "Martinique Tourisme — Tour des yoles rondes",
    href: "https://www.martinique.org/fr/tout-savoir/culture/tour-de-martinique-des-yoles-rondes"
  },
  {
    label: "Tour des Yoles — site de l’événement",
    href: "https://tourdesyoles.com/40-ans-competition-martinique/"
  }
]);

const STYLE_ID = "infoHubStyles";
let infoHubDialog = null;
let infoHubPreviousFocus = null;

function element(doc, tag, options = {}) {
  const node = doc.createElement(tag);
  if (options.id) node.id = options.id;
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    node.setAttribute(name, String(value));
  }
  return node;
}

function append(parent, ...children) {
  parent.append(...children.filter(Boolean));
  return parent;
}

function paragraph(doc, text, className = "") {
  return element(doc, "p", { text, className });
}

function externalLink(doc, source) {
  return element(doc, "a", {
    text: source.label,
    attributes: {
      href: source.href,
      target: "_blank",
      rel: "noopener noreferrer"
    }
  });
}

function addStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = element(doc, "style", { id: STYLE_ID });
  style.textContent = `
    .info-hub {
      width: min(1040px, calc(100vw - 24px));
      max-height: min(88vh, 860px);
      padding: 0;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 22px;
      color: #f7fbff;
      background:
        radial-gradient(circle at 86% 2%, rgba(46,213,190,.14), transparent 30%),
        linear-gradient(150deg, #0c2030 0%, #07141f 58%, #101622 100%);
      box-shadow: 0 28px 90px rgba(0,0,0,.66);
      overflow: hidden;
    }
    .info-hub::backdrop {
      background: rgba(2,10,17,.78);
      backdrop-filter: blur(8px);
    }
    .info-hub[hidden] { display: none; }
    .info-hub * { box-sizing: border-box; }
    .info-hub__shell {
      max-height: inherit;
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-color: rgba(62,221,196,.7) rgba(255,255,255,.06);
    }
    .info-hub__header {
      position: sticky;
      z-index: 2;
      top: 0;
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      padding: 26px clamp(20px,4vw,42px) 20px;
      border-bottom: 1px solid rgba(255,255,255,.1);
      background: rgba(7,20,31,.92);
      backdrop-filter: blur(14px);
    }
    .info-hub__eyebrow {
      display: block;
      margin-bottom: 5px;
      color: #54e6cd;
      font: 800 11px/1.2 system-ui,sans-serif;
      letter-spacing: .15em;
      text-transform: uppercase;
    }
    .info-hub h2, .info-hub h3 {
      margin: 0;
      color: #fff;
      font-family: system-ui,sans-serif;
      text-transform: uppercase;
      letter-spacing: .035em;
    }
    .info-hub h2 { font-size: clamp(25px,4vw,42px); line-height: 1; }
    .info-hub h3 { font-size: 17px; line-height: 1.25; }
    .info-hub__lead {
      max-width: 700px;
      margin: 9px 0 0;
      color: #b9cad7;
      font: 500 14px/1.55 system-ui,sans-serif;
    }
    .info-hub__close {
      flex: 0 0 44px;
      width: 44px;
      height: 44px;
      padding: 0;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 50%;
      color: #fff;
      background: rgba(255,255,255,.07);
      font: 400 28px/1 system-ui,sans-serif;
      cursor: pointer;
    }
    .info-hub__close:hover { background: rgba(255,255,255,.14); }
    .info-hub__close:focus-visible,
    .info-hub a:focus-visible,
    .info-hub button:focus-visible {
      outline: 3px solid #ffd95b;
      outline-offset: 3px;
    }
    .info-hub__body {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      padding: 22px clamp(16px,4vw,42px) 30px;
    }
    .info-hub__card {
      min-width: 0;
      padding: 21px;
      border: 1px solid rgba(255,255,255,.11);
      border-radius: 17px;
      background: rgba(255,255,255,.045);
    }
    .info-hub__card--wide { grid-column: 1 / -1; }
    .info-hub__card p,
    .info-hub__card li,
    .info-hub__card dd {
      color: #c6d4de;
      font: 500 13px/1.58 system-ui,sans-serif;
    }
    .info-hub__card p { margin: 11px 0 0; }
    .info-hub__facts,
    .info-hub__steps,
    .info-hub__sources {
      margin: 13px 0 0;
      padding-left: 20px;
    }
    .info-hub__facts li + li,
    .info-hub__steps li + li,
    .info-hub__sources li + li { margin-top: 7px; }
    .info-hub__facts strong { color: #fff; }
    .info-hub__glossary {
      display: grid;
      grid-template-columns: minmax(100px,.38fr) minmax(0,1fr);
      gap: 9px 15px;
      margin: 15px 0 0;
    }
    .info-hub__glossary dt {
      color: #54e6cd;
      font: 800 13px/1.5 system-ui,sans-serif;
    }
    .info-hub__glossary dd { margin: 0; }
    .info-hub__note {
      padding: 11px 13px;
      border-left: 3px solid #ffd95b;
      border-radius: 4px 10px 10px 4px;
      color: #f2e8b8 !important;
      background: rgba(255,217,91,.08);
    }
    .info-hub__warning {
      border-left-color: #ff806e;
      color: #ffd0c9 !important;
      background: rgba(255,96,75,.09);
    }
    .info-hub__install {
      display: inline-flex;
      min-height: 44px;
      align-items: center;
      justify-content: center;
      margin-top: 15px;
      padding: 10px 17px;
      border: 1px solid rgba(84,230,205,.55);
      border-radius: 999px;
      color: #061c1a;
      background: #54e6cd;
      font: 900 12px/1 system-ui,sans-serif;
      letter-spacing: .06em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .info-hub__install[hidden] { display: none; }
    .info-hub__sources a {
      color: #7eeedb;
      text-underline-offset: 3px;
    }
    .info-hub__credits {
      display: grid;
      grid-template-columns: repeat(3,minmax(0,1fr));
      gap: 8px;
      margin-top: 14px;
    }
    .info-hub__credit {
      padding: 12px;
      border-radius: 11px;
      background: rgba(0,0,0,.18);
    }
    .info-hub__credit strong {
      display: block;
      color: #fff;
      font: 800 12px/1.3 system-ui,sans-serif;
    }
    .info-hub__credit span {
      display: block;
      margin-top: 4px;
      color: #aebfca;
      font: 500 11px/1.45 system-ui,sans-serif;
    }
    /* V11 · la page A propos rejoint la même cale de course que les autres
       surfaces. Le texte reste natif, sélectionnable et accessible. */
    .info-hub {
      border: 0;
      border-radius: 5px 26px 5px 27px;
      color: #fff4cf;
      background:
        linear-gradient(145deg,rgba(2,9,20,.55),rgba(3,13,24,.39)),
        url("./assets/textures/v9/menu/menu-panel-material.webp") center/100% 100% no-repeat;
      box-shadow: 0 32px 100px rgba(0,0,0,.68),0 0 0 1px rgba(239,199,113,.14);
    }
    .info-hub::backdrop {
      background:
        radial-gradient(circle at 50% 25%,rgba(59,218,204,.12),transparent 36%),
        rgba(1,7,15,.86);
      backdrop-filter: blur(7px);
    }
    .info-hub__header {
      padding: 25px clamp(22px,4vw,43px) 18px;
      border-bottom-color: rgba(232,190,101,.22);
      background:
        linear-gradient(90deg,rgba(2,10,20,.96),rgba(4,18,29,.87)),
        url("./assets/textures/v9/menu/menu-panel-material.webp") center/cover;
      backdrop-filter: blur(5px);
    }
    .info-hub__eyebrow {
      color: #e8b85f;
      font: 900 8px/1.2 var(--font-ui);
      letter-spacing: .17em;
    }
    .info-hub h2,.info-hub h3 {
      color: #fff4cf;
      font-family: var(--font-display);
      font-weight: 400;
      letter-spacing: -.015em;
    }
    .info-hub h2 {
      font-size: clamp(31px,4vw,48px);
      font-style: italic;
      text-shadow: 0 6px 0 rgba(0,0,0,.20),0 15px 28px rgba(0,0,0,.34);
    }
    .info-hub h3 { font-size: 21px; }
    .info-hub__lead { color: rgba(219,239,237,.76); font: 500 11px/1.55 var(--font-ui); }
    .info-hub__close {
      border: 1px solid rgba(239,195,105,.28);
      border-radius: 2px 10px 2px 10px;
      color: #fff0c2;
      background: linear-gradient(130deg,rgba(63,43,26,.73),rgba(5,19,30,.78));
      font-family: var(--font-ui);
    }
    .info-hub__body { gap: 9px; padding: 18px clamp(18px,4vw,42px) 30px; }
    .info-hub__card {
      padding: 18px;
      border: 1px solid rgba(97,232,223,.14);
      border-radius: 2px 13px 2px 13px;
      background:
        linear-gradient(135deg,rgba(5,24,37,.90),rgba(4,17,29,.73)),
        url("./assets/textures/v9/menu/menu-panel-material.webp") center/cover;
      box-shadow: inset 3px 0 rgba(97,232,223,.28),0 9px 22px rgba(0,0,0,.22);
    }
    .info-hub__card p,.info-hub__card li,.info-hub__card dd {
      color: #bed5d7;
      font: 500 11px/1.58 var(--font-ui);
    }
    .info-hub__glossary dt { color: #e8b85f; font: 900 10px/1.5 var(--font-ui); }
    .info-hub__note {
      border-left-color: #e8b85f;
      border-radius: 2px 8px 2px 8px;
      color: #f4dfaa !important;
      background: rgba(113,73,29,.22);
    }
    .info-hub__credit {
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 2px 8px 2px 8px;
      background: rgba(2,13,23,.56);
    }
    .info-hub__credit strong { font: 900 9px/1.3 var(--font-ui); }
    .info-hub__credit span { color: #99b5b9; font: 500 9px/1.45 var(--font-ui); }
    .info-hub__sources a { color: #77e9df; }
    .info-hub__install {
      border-color: rgba(239,195,105,.45);
      border-radius: 2px 9px 2px 9px;
      color: #fff0bd;
      background: linear-gradient(120deg,rgba(138,84,30,.88),rgba(44,67,54,.86));
      font: 1000 8px/1 var(--font-ui);
      box-shadow: inset 3px 0 #e8b85f,0 8px 20px rgba(0,0,0,.28);
    }
    @media (max-width: 720px) {
      .info-hub { width: calc(100vw - 12px); max-height: calc(100dvh - 12px); border-radius: 4px 17px 4px 18px; }
      .info-hub__header { padding: 20px 17px 16px; }
      .info-hub__body { grid-template-columns: 1fr; padding: 14px 12px 22px; }
      .info-hub__card--wide { grid-column: auto; }
      .info-hub__credits { grid-template-columns: 1fr; }
      .info-hub__glossary { grid-template-columns: 1fr; gap: 2px; }
      .info-hub__glossary dd + dt { margin-top: 8px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .info-hub, .info-hub * { scroll-behavior: auto !important; transition: none !important; }
    }
  `;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function buildUnderstanding(doc) {
  const section = element(doc, "section", {
    className: "info-hub__card",
    attributes: { "aria-labelledby": "infoHubYoleTitle" }
  });
  append(section,
    element(doc, "span", { className: "info-hub__eyebrow", text: "Repères visuels et nautiques" }),
    element(doc, "h3", { id: "infoHubYoleTitle", text: "Comprendre la yole" }),
    paragraph(doc, "La yole ronde martiniquaise possède une silhouette et une manière de naviguer très particulières.", "info-hub__intro")
  );

  const facts = element(doc, "ul", { className: "info-hub__facts" });
  const entries = [
    ["Coque", "une seule coque en bois, longue et étroite — ni flotteur latéral ni seconde coque."],
    ["Direction", "pas de quille ni de gouvernail ; le patron dirige notamment à la pagaie."],
    ["Équilibre", "les bwa dressés sont déplacés du côté au vent et portent des équipiers qui servent de ballast mobile."],
    ["Gréement", "une grande voile domine une embarcation légère, vive et souvent fortement inclinée."]
  ];
  for (const [term, description] of entries) {
    const item = element(doc, "li");
    append(item,
      element(doc, "strong", { text: `${term} — ` }),
      doc.createTextNode(description)
    );
    facts.appendChild(item);
  }
  section.appendChild(facts);
  return section;
}

function buildGlossary(doc) {
  const section = element(doc, "section", {
    className: "info-hub__card",
    attributes: { "aria-labelledby": "infoHubGlossaryTitle" }
  });
  append(section,
    element(doc, "span", { className: "info-hub__eyebrow", text: "FR · usages locaux" }),
    element(doc, "h3", { id: "infoHubGlossaryTitle", text: "Petit glossaire" }),
    paragraph(
      doc,
      "Les termes sont expliqués ici par leur fonction. Ce panneau n’est pas un dictionnaire normatif français ↔ kréyol et ne propose aucune traduction non sourcée.",
      "info-hub__note"
    )
  );

  const glossary = element(doc, "dl", { className: "info-hub__glossary" });
  const entries = [
    ["Yole ronde", "Embarcation traditionnelle martiniquaise construite autour d’une coque unique en bois."],
    ["Bwa dressés", "Nom d’usage des longues perches mobiles sur lesquelles les équipiers se placent au vent."],
    ["Patron", "Responsable de la conduite de la yole ; il donne les choix de course et manœuvre à la pagaie."],
    ["Contre-gîte", "Action de déplacer le poids de l’équipage pour s’opposer à l’inclinaison créée par le vent."]
  ];
  for (const [term, definition] of entries) {
    append(glossary,
      element(doc, "dt", { text: term }),
      element(doc, "dd", { text: definition })
    );
  }
  section.appendChild(glossary);
  return section;
}

function isStandalone(doc) {
  const view = doc.defaultView ?? globalThis;
  return Boolean(
    view.matchMedia?.("(display-mode: standalone)")?.matches
    || view.navigator?.standalone
  );
}

function installTrigger(doc) {
  const trigger = doc.getElementById("installBtn");
  if (!trigger || trigger.hidden || trigger.disabled) return null;
  if (trigger.classList?.contains("hidden")) return null;
  return trigger;
}

function refreshInstallState(dialog, doc) {
  const button = dialog.querySelector("[data-info-install]");
  const status = dialog.querySelector("[data-info-install-status]");
  if (!button || !status) return;

  if (isStandalone(doc)) {
    button.hidden = true;
    status.textContent = "Le jeu est déjà ouvert comme une application installée.";
    return;
  }

  const available = Boolean(installTrigger(doc));
  button.hidden = !available;
  status.textContent = available
    ? "Chrome ou Edge autorise actuellement l’installation sur cet appareil."
    : "Si aucun bouton n’apparaît, utilisez l’icône Installer ou le menu de Chrome/Edge lorsqu’ils la proposent.";
}

function buildInstallation(doc) {
  const section = element(doc, "section", {
    className: "info-hub__card",
    attributes: { "aria-labelledby": "infoHubInstallTitle" }
  });
  append(section,
    element(doc, "span", { className: "info-hub__eyebrow", text: "PWA · jeu local" }),
    element(doc, "h3", { id: "infoHubInstallTitle", text: "Installation & hors-ligne" })
  );

  const steps = element(doc, "ol", { className: "info-hub__steps" });
  for (const text of [
    "Chrome / Edge : utilisez le bouton d’installation ci-dessous lorsqu’il est disponible.",
    "iPhone / iPad avec Safari : Partager → Sur l’écran d’accueil.",
    "Avant de jouer hors-ligne, effectuez une première visite complète avec une connexion active."
  ]) steps.appendChild(element(doc, "li", { text }));

  const button = element(doc, "button", {
    className: "info-hub__install",
    text: "Installer le jeu",
    attributes: { type: "button", "data-info-install": "" }
  });
  button.hidden = true;
  button.addEventListener("click", () => {
    const trigger = installTrigger(doc);
    if (!trigger) {
      refreshInstallState(infoHubDialog, doc);
      return;
    }
    closeInfoHub();
    trigger.click();
  });

  append(section,
    steps,
    button,
    paragraph(doc, "", "info-hub__install-status"),
    paragraph(
      doc,
      "Le mode privé peut refuser l’installation ou le stockage, limiter le hors-ligne et effacer la progression à la fermeture.",
      "info-hub__note"
    )
  );
  section.querySelector(".info-hub__install-status").setAttribute("data-info-install-status", "");
  return section;
}

function buildCredits(doc) {
  const section = element(doc, "section", {
    className: "info-hub__card",
    attributes: { "aria-labelledby": "infoHubCreditsTitle" }
  });
  append(section,
    element(doc, "span", { className: "info-hub__eyebrow", text: "Dépendances · droits" }),
    element(doc, "h3", { id: "infoHubCreditsTitle", text: "Crédits & licences" })
  );

  const credits = element(doc, "div", { className: "info-hub__credits" });
  const entries = [
    ["Three.js", "Bibliothèque 3D · licence MIT."],
    ["Polices embarquées", "Distribuées sous SIL Open Font License (OFL)."],
    ["Musique & sons", "Droits de publication confirmés par le propriétaire du projet le 30 juillet 2026."]
  ];
  for (const [name, detail] of entries) {
    append(credits, append(
      element(doc, "div", { className: "info-hub__credit" }),
      element(doc, "strong", { text: name }),
      element(doc, "span", { text: detail })
    ));
  }
  append(section,
    credits,
    paragraph(
      doc,
      "Droits confirmés sur attestation du propriétaire. Le dépôt ne revendique pas une vérification juridique indépendante ni la publication de pièces individuelles.",
      "info-hub__note"
    )
  );
  return section;
}

function buildSourcesAndDisclaimer(doc) {
  const section = element(doc, "section", {
    className: "info-hub__card info-hub__card--wide",
    attributes: { "aria-labelledby": "infoHubSourcesTitle" }
  });
  append(section,
    element(doc, "span", { className: "info-hub__eyebrow", text: "Culture · transparence" }),
    element(doc, "h3", { id: "infoHubSourcesTitle", text: "Sources & fiction" }),
    paragraph(
      doc,
      "Yole Bwa Brawl est une fiction de jeu vidéo. Ses combats, équipes, livrées et situations sont imaginaires : le jeu n’est ni affilié, ni sponsorisé, ni approuvé par l’UNESCO, Martinique Tourisme ou les organisateurs du Tour des Yoles."
    ),
    paragraph(
      doc,
      "Les références ci-dessous servent à comprendre la pratique réelle. Aucune photographie externe n’est reproduite dans ce panneau."
    )
  );
  const list = element(doc, "ul", { className: "info-hub__sources" });
  for (const source of SOURCES) {
    const item = element(doc, "li");
    item.appendChild(externalLink(doc, source));
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

function focusableItems(dialog) {
  return [...dialog.querySelectorAll("button:not([hidden]):not([disabled]), a[href]")]
    .filter((node) => !node.hidden);
}

function restoreFocus() {
  const target = infoHubPreviousFocus;
  infoHubPreviousFocus = null;
  if (target?.isConnected !== false) target?.focus?.();
}

function buildInfoHub(doc) {
  addStyles(doc);
  const dialog = element(doc, "dialog", {
    id: "infoHub",
    className: "info-hub",
    attributes: {
      "aria-labelledby": "infoHubTitle",
      "aria-describedby": "infoHubLead",
      "aria-modal": "true"
    }
  });

  const shell = element(doc, "div", { className: "info-hub__shell" });
  const header = element(doc, "header", { className: "info-hub__header" });
  const heading = element(doc, "div");
  append(heading,
    element(doc, "span", { className: "info-hub__eyebrow", text: "Yole · installation · licences" }),
    element(doc, "h2", { id: "infoHubTitle", text: "À propos du jeu" }),
    paragraph(
      doc,
      "Quelques repères pour distinguer la yole ronde réelle de la fiction arcade, installer le jeu et vérifier ses crédits.",
      "info-hub__lead"
    )
  );
  heading.querySelector(".info-hub__lead").id = "infoHubLead";

  const close = element(doc, "button", {
    className: "info-hub__close",
    text: "×",
    attributes: { type: "button", "aria-label": "Fermer À propos du jeu" }
  });
  close.addEventListener("click", closeInfoHub);
  append(header, heading, close);

  const body = element(doc, "div", { className: "info-hub__body" });
  append(body,
    buildUnderstanding(doc),
    buildGlossary(doc),
    buildInstallation(doc),
    buildCredits(doc),
    buildSourcesAndDisclaimer(doc)
  );
  append(shell, header, body);
  dialog.appendChild(shell);

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeInfoHub();
  });
  dialog.addEventListener("close", restoreFocus);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeInfoHub();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeInfoHub();
      return;
    }
    if (event.key !== "Tab" || typeof dialog.showModal === "function") return;
    const items = focusableItems(dialog);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  doc.body.appendChild(dialog);
  return dialog;
}

export function openInfoHub() {
  const doc = globalThis.document;
  if (!doc?.body) return false;
  if (!infoHubDialog || infoHubDialog.ownerDocument !== doc) infoHubDialog = buildInfoHub(doc);

  infoHubPreviousFocus = doc.activeElement;
  infoHubDialog.hidden = false;
  refreshInstallState(infoHubDialog, doc);
  if (typeof infoHubDialog.showModal === "function") {
    if (!infoHubDialog.open) infoHubDialog.showModal();
  } else {
    infoHubDialog.setAttribute("open", "");
  }
  infoHubDialog.querySelector(".info-hub__close")?.focus();
  return true;
}

export function closeInfoHub() {
  if (!infoHubDialog) return false;
  if (typeof infoHubDialog.close === "function" && infoHubDialog.open) {
    infoHubDialog.close();
  } else {
    infoHubDialog.removeAttribute("open");
    infoHubDialog.hidden = true;
    restoreFocus();
  }
  return true;
}
