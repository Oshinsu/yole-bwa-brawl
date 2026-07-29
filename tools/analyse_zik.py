"""Analyse des pistes musicales — par la MESURE, pas par le titre.

Assigner une musique a une phase de jeu d'apres son nom seul, c'est deviner. Ici
chaque piste est reellement DECODEE (Web Audio, `decodeAudioData`) et on en tire
quatre indicateurs qui disent ce qu'elle est :

  - energie RMS         : la piste est-elle dense ou aeree ?
  - crete / RMS         : dynamique, donc percussif contre nappe ;
  - centroide spectral  : brillance ; un mix grave sonne calme, un mix aigu tendu ;
  - pulsations/minute   : estimation de tempo par autocorrelation de l'enveloppe.

Le classement par intensite qui en sort sert a placer les boucles : la plus calme
au menu, la plus dense au coeur de l'action.

    PORT=8791 python tools/serve.py &
    python tools/analyse_zik.py
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parent.parent
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")

ANALYSE = """async (chemin) => {
  const reponse = await fetch(chemin);
  const brut = await reponse.arrayBuffer();
  const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
  const audio = await ctx.decodeAudioData(brut);
  const pcm = audio.getChannelData(0);
  const n = pcm.length;

  let somme = 0, crete = 0;
  for (let i = 0; i < n; i++) {
    const v = pcm[i];
    somme += v * v;
    const a = Math.abs(v);
    if (a > crete) crete = a;
  }
  const rms = Math.sqrt(somme / n);

  // Enveloppe d'energie par fenetres de ~11 ms : base commune au tempo et a la
  // mesure de dynamique.
  const pas = Math.max(1, Math.round(audio.sampleRate * 0.011));
  const env = new Float32Array(Math.floor(n / pas));
  for (let f = 0; f < env.length; f++) {
    let s = 0;
    for (let i = f * pas; i < (f + 1) * pas; i++) s += pcm[i] * pcm[i];
    env[f] = Math.sqrt(s / pas);
  }

  // Flux POSITIF : ne garder que les montees, c'est ce qui porte le rythme. Une
  // nappe continue a un flux quasi nul, donc pas de tempo detectable.
  const flux = new Float32Array(env.length);
  for (let f = 1; f < env.length; f++) flux[f] = Math.max(0, env[f] - env[f - 1]);

  const parSeconde = audio.sampleRate / pas;
  let meilleurBpm = 0, meilleurScore = 0;
  for (let bpm = 60; bpm <= 200; bpm++) {
    const decalage = Math.round(parSeconde * 60 / bpm);
    if (decalage < 2 || decalage >= flux.length) continue;
    let score = 0;
    for (let f = 0; f + decalage < flux.length; f++) score += flux[f] * flux[f + decalage];
    score /= (flux.length - decalage);
    if (score > meilleurScore) { meilleurScore = score; meilleurBpm = bpm; }
  }

  // Centroide spectral sur une fenetre centrale, DFT grossiere en 64 bandes :
  // suffisant pour classer grave/aigu, inutile d'etre exact.
  const debut = Math.max(0, Math.floor(n / 2) - 8192);
  const bandes = 64;
  let poids = 0, total = 0;
  for (let b = 1; b <= bandes; b++) {
    const freq = b * (audio.sampleRate / 2) / bandes;
    let re = 0, im = 0;
    for (let i = 0; i < 4096; i++) {
      const t = 2 * Math.PI * freq * i / audio.sampleRate;
      const v = pcm[debut + i] ?? 0;
      re += v * Math.cos(t);
      im -= v * Math.sin(t);
    }
    const mag = Math.hypot(re, im);
    poids += mag * freq;
    total += mag;
  }

  return {
    dureeS: +audio.duration.toFixed(1),
    rms: +rms.toFixed(4),
    crete: +crete.toFixed(3),
    dynamique: +(crete / Math.max(1e-6, rms)).toFixed(2),
    centroideHz: Math.round(total > 0 ? poids / total : 0),
    bpm: meilleurBpm
  };
}"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    pistes = sorted((RACINE / "zik").glob("*.mp3"))
    resultats = []
    with sync_playwright() as p:
        lancement = {"headless": True, "args": ["--autoplay-policy=no-user-gesture-required"]}
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        navigateur = p.chromium.launch(**lancement)
        page = navigateur.new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        for piste in pistes:
            mesure = page.evaluate(ANALYSE, f"/zik/{piste.name}")
            mesure["titre"] = piste.stem
            mesure["fichier"] = piste.name
            mesure["poidsKo"] = round(piste.stat().st_size / 1024)
            resultats.append(mesure)
        navigateur.close()

    # Indice d'intensite : energie, brillance et tempo, chacun normalise sur le
    # lot. C'est un classement RELATIF entre ces huit pistes, pas une mesure
    # absolue — il n'a de sens que pour les ordonner entre elles.
    def normalise(cle):
        valeurs = [r[cle] for r in resultats]
        lo, hi = min(valeurs), max(valeurs)
        return {r["titre"]: ((r[cle] - lo) / (hi - lo) if hi > lo else 0.5) for r in resultats}

    nRms, nCent, nBpm = normalise("rms"), normalise("centroideHz"), normalise("bpm")
    for r in resultats:
        r["intensite"] = round(nRms[r["titre"]] * 0.5 + nCent[r["titre"]] * 0.2 + nBpm[r["titre"]] * 0.3, 3)
    resultats.sort(key=lambda r: r["intensite"])

    print(f"{'titre':<24}{'duree':>8}{'rms':>8}{'dyn':>7}{'centro':>8}{'bpm':>6}{'intens':>8}")
    for r in resultats:
        print(f"{r['titre']:<24}{r['dureeS']:>8}{r['rms']:>8}{r['dynamique']:>7}"
              f"{r['centroideHz']:>8}{r['bpm']:>6}{r['intensite']:>8}")
    (RACINE / "docs" / "ZIK_ANALYSE.json").write_text(
        json.dumps(resultats, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
