---
name: gauntlet-realism
description: Gauntlet Loop nach Matt Shumer fuer den Realismus von Ghillie Ops. Builder-Subagenten verbessern je einen Aspekt (Wald, Gras, Gelaende, Licht, Wasser, Bauten, Ferne), frische Kritiker vergleichen Spiel-Screenshots blind gegen echte Fotos und AAA-Screenshots, Schleife bis das Spiel besteht oder 6 Runden um sind. Ausloeser "gauntlet", "gauntlet loop", "realism loop".
---

# Gauntlet Loop: Realismus

Grundregeln, nicht verhandelbar:
1. Die Messlatte ist echt: echte Fotos und Screenshots veroeffentlichter AAA-Spiele, nie generierte Bilder.
2. Wer baut, bewertet nie die eigene Arbeit.
3. Jeder Kritiker ist neu, sieht nur ein Bildpaar A/B und weiss nicht, welches Bild das Spiel ist. Er sieht keine fruehere Runde und keinen frueheren Bericht.
4. Der Orchestrator (du) schreibt keinen Spielcode. Er plant, macht Screenshots, mischt die Paare, wertet aus und gibt Kritik woertlich an den Builder.

Projektwurzel: `C:\Users\Leschke\Downloads\GhillieOps`. Alle Pfade relativ dazu.

## 0. Vorbereitung (einmal)

1. `.claude/fehler-fixes.md` lesen, passende Regeln anwenden.
2. `SPEC.md`, `ARCHITECTURE.md`, `PROGRESS.md` lesen. Performance-Gate aus SPEC Abschnitt 4: CPU p99 <= 11 ms, GPU p99 <= 14 ms.
3. Waldpunkt bestimmen und in `qa/gauntlet/spots.json` speichern:
   ```
   python -c "import json,collections;m=json.load(open('assets/world/world.json'))['models'];c=collections.Counter();[c.update([(int(l[i]//40),int(l[i+2]//40))]) for n in ('OakTree','SpruceTree','BirchTree') for l in [m[n]] for i in range(0,len(l),5)];(x,z),k=c.most_common(1)[0];print(json.dumps({'forest':[x*40+20,z*40+20,k]}))"
   ```
4. Referenzen nach `qa/refs/<aspekt>/` laden, pro Aspekt mindestens 2 Fotos (`photo_*.jpg`) und 2 AAA-Screenshots (`aaa_*.jpg`):
   - Fotos: Wikimedia Commons API (`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=<begriff>&prop=imageinfo&iiprop=url&iiurlwidth=1920&format=json`), mit curl laden. Nur echte Fotos, Sommer, Mitteleuropa, Tageslicht, Augenhoehe ausser bei `gelaende` und `ferne`. Quelle und Lizenz in `qa/refs/SOURCES.md`.
   - AAA: Steam-Store-Screenshots per `https://store.steampowered.com/api/appdetails?appids=<id>` (Feld `screenshots[].path_full`). Arma Reforger 1874880, Call of Duty 1938090, Delta Force 2507950. App-IDs pruefen, nur Bilder ohne HUD und Menues behalten.
   - Jede Referenz vor der Uebernahme ansehen. Motiv, Tageszeit und Kamerahoehe muessen zum Shot passen.

## 1. Aspekte und Shots

| Aspekt | Shots (qa.mjs Schritte) | Referenzmotiv | Dateien (siehe ARCHITECTURE.md) |
|---|---|---|---|
| wald | Waldpunkt: `__GO.teleport(x,300,z,0,-0.05)`, `__GO.mode('walk')`, 3 s warten. Waldrand: `__GO.bookmark('meadow_ground')` | Mischwald innen, Waldrand von der Wiese | `src/veg/foliage.js`, `src/veg/trees.js`, `tools/*/leafset.py`, `branches.py`, `build_all.py` |
| gras | `__GO.bookmark('meadow_ground')` | Wiese auf Augenhoehe | `src/veg/grass.js`, `src/world/terrain.js` |
| gelaende | `__GO.bookmark('overview')`, `__GO.bookmark('quarry')` | Huegelland von oben, Steinbruch | `src/world/terrain.js`, `tools/bake_world.mjs`, Fels-Modelle |
| licht | `overview` mit `__GO.setTime(8)`, `(13)`, `(18)` | gleiche Szenerie zur gleichen Tageszeit | `src/render/lighting.js`, `sun.js`, `post.js` |
| wasser | `__GO.bookmark('river_bridge')` | kleiner Fluss mit Steinbruecke | `src/world/water.js` |
| bauten | `__GO.bookmark('village')`, `('farm')`, `('red_base')` | Dorf, Bauernhof, Feldlager | Modelle in Blender, `src/veg/props.js` |
| ferne | `__GO.bookmark('overview')`, Blick zum Horizont | Landschaft mit Luftperspektive | `src/world/horizon.js`, `lighting.js` (Nebel) |

Reihenfolge: wald, gras, licht, gelaende, ferne, wasser, bauten.

Shot-Datei pro Aspekt `qa/gauntlet/<aspekt>/steps.json`, Uhrzeit 10 Uhr ausser bei `licht`:
```
[
  { "until": "window.__GO && __GO.state().boot.ready", "timeout": 120 },
  { "eval": "__GO.setTime(10)" },
  { "eval": "__GO.bookmark('meadow_ground')" },
  { "wait": 4 },
  { "shot": "gras_1.png" }
]
```
Aufnahme: `node tools/qa.mjs --out qa/gauntlet/<aspekt>/r<k>/shots --size 1920x1080 --steps qa/gauntlet/<aspekt>/steps.json`. Danach `report.json` pruefen: keine `problems`, keine `pageErrors`. Jeden Screenshot selbst ansehen, bevor er zum Kritiker geht.

## 2. Eine Runde pro Aspekt

1. Shots aufnehmen (oben).
2. Paare bauen, 3 pro Aspekt: 2x Spiel gegen AAA, 1x Spiel gegen Foto, jedes Paar mit anderem Shot oder anderer Referenz:
   `python tools/gauntlet_pair.py <spiel.png> <referenz.jpg> qa/gauntlet/<aspekt>/r<k>/blind/p<n> qa/gauntlet/<aspekt>/r<k>/keys/p<n>.json`
3. Pro Paar einen neuen Kritiker-Subagenten starten. Die drei duerfen parallel laufen. Prompt woertlich, nur `<ordner>` ersetzen:

   > Du bist ein unbestechlicher Art Director fuer AAA-Shooter. In `<ordner>` liegen A.png und B.png. Eines ist eine Referenz (echtes Foto oder Screenshot eines veroeffentlichten AAA-Spiels), das andere ein Kandidat. Lies ausschliesslich diese zwei Dateien, keine anderen Dateien oder Ordner. Beantworte: 1) Welches Bild ist realistischer, A oder B? Kein Unentschieden. 2) Sicherheit 1 bis 5. 3) Note 1 bis 10 fuer beide Bilder in: Form und Silhouette, Material und Textur, Licht und Schatten, Farbe und Tonwerte, Dichte und Detail, Ferne und Atmosphaere. 4) Fuer das unterlegene Bild jeden Mangel mit Bildregion (links/mitte/rechts, oben/mitte/unten), was falsch aussieht, wie es in der Realitaet aussieht, Schwere major oder minor. Kein Lob, keine Hoeflichkeit, keine Vermutungen ueber die Technik. Antworte nur als JSON: {"winner":"A|B","confidence":1-5,"scores":{"A":{...},"B":{...}},"defects":[{"image":"A|B","region":"...","wrong":"...","real":"...","severity":"major|minor"}]}

4. Entblinden mit `keys/p<n>.json`. Bericht `qa/gauntlet/<aspekt>/r<k>/report.md`: pro Paar Gewinner, Sicherheit, Noten des Spiels, alle Maengel des Spielbilds woertlich.
5. Urteil:
   - PASS, wenn in beiden AAA-Paaren das Spiel gewinnt oder der Kritiker bei seinem Sieg fuer die Referenz Sicherheit <= 2 angibt, und im Foto-Paar kein major-Mangel am Spielbild steht.
   - Sonst FAIL.
6. Bei FAIL einen neuen Builder-Subagenten starten (Prompt unten). Danach naechste Runde mit neuen Kritikern, neue Paare, neue Zufallsreihenfolge.
7. Hoechstens 6 FAIL-Runden pro Aspekt. Danach offene Maengel nach `PROGRESS.md` unter "Carried to S8" und weiter zum naechsten Aspekt.
8. Nach jeder Runde eine Zeile ins Verdict-Log von `PROGRESS.md`: `- <datum> | gauntlet <aspekt> | round <k> | PASS/FAIL | <kurz> | qa/gauntlet/<aspekt>/r<k>/report.md`.

## 3. Builder-Prompt

> Du bist Builder fuer den Aspekt `<aspekt>` von Ghillie Ops (three.js, `C:\Users\Leschke\Downloads\GhillieOps`). Lies zuerst `.claude/fehler-fixes.md`, `SPEC.md`, `ARCHITECTURE.md`. Ziel: Ein blinder Kritiker soll die Spiel-Screenshots nicht mehr von den Referenzen in `qa/refs/<aspekt>/` unterscheiden koennen. Die Referenzen darfst du ansehen. Maengel aus der letzten Runde, woertlich: <maengel aus report.md>. Regeln: Nur Dateien dieses Aspekts aendern (<dateiliste>). Neue oder geaenderte 3D-Modelle nur in Blender ueber die Blender-Werkzeuge: Szene bauen, Viewport-Screenshot ansehen, korrigieren, Ursprung am Boden, Meter, Vorderseite -Y, Modifier angewandt, dann exportieren. Texturen von Poly Haven oder ambientCG, sonst ComfyUI. Keine Kommentare im Code. Vor der Rueckgabe: `node tools/check.mjs` ohne Fehler; `node tools/qa.mjs --out qa/tmp --size 1920x1080 --url "/?autostart=1&selftest=1" --steps "[{\"until\":\"__GO.state().selftest.done\",\"timeout\":180},{\"eval\":\"__GO.state().selftest\",\"as\":\"selftest\"},{\"stats\":\"idle\",\"seconds\":5}]"` mit 0 failed und CPU p99 <= 11 ms, GPU p99 <= 14 ms. Eigene Fehler in `.claude/fehler-fixes.md` eintragen. Gib zurueck: geaenderte Dateien, was sich sichtbar aendert, Messwerte. Bewerte dein Ergebnis nicht.

## 4. Abschluss

Wenn alle Aspekte PASS oder ausgeschoepft sind: `qa/gauntlet/summary.md` mit Tabelle Aspekt / Runden / Urteil / offene Maengel. Zum Schluss ein Vorher-Nachher-Paar pro Aspekt (Runde 1 gegen letzte Runde) an den Nutzer schicken.
