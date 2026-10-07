# Fehler-Fixes

### 2026-10-06 | Baeume schweben, Stamm unter dem untersten Blatt abgeschnitten
Kontext: Python + JS / Ghillie Ops / leafset.py, branches.py, build_all.py, foliage.js
Code:
p16 = np.clip(np.round((pos - boxc) / boxh * 32767), -32767, 32767)
Problem: Nutzer meldet "some trees arent actually on the ground and are instead flying in the air"
Fix: Die Quantisierungs-Box kam nur aus den Blaettern (leafset.py), Stamm/Aeste wurden in branches.py hineingeklemmt, der Stamm unterhalb des tiefsten Blatts kollabierte auf die Boxunterkante. Box umfasst jetzt auch die Ast-Prims. trunk_offset (build_all.py) misst den Stammfuss nach dem Entfernen der Bodenplatten. foliage.js meldet beim Laden jede Baumvariante, deren Stamm ueber 5 cm ueber dem Ursprung endet.
Status: offen (Assets muessen mit build_all.py neu gebaut werden)
Regel: Jede int16-Quantisierungs-Box muss alle Geometrie umfassen, die damit kodiert wird. Ursprung eines Modells immer an der tatsaechlich gerenderten Geometrie messen.

### 2026-10-06 | __pycache__ mitcommittet
Kontext: Git / Ghillie Ops / Repo-Wurzel
Code:
python3 -m py_compile leafset.py build_all.py && git add -A
Problem: Eigener Fehler: Syntaxpruefung legte __pycache__/*.pyc an, git add -A hat sie mitgenommen
Fix: __pycache__ aus dem Repo entfernt, .gitignore mit __pycache__/ angelegt
Status: funktioniert
Regel: Nach py_compile vor dem Commit git status ansehen, nie blind git add -A.

### 2026-10-07 | Kamerapunkt im Fluss, Screenshot unter Wasser
Kontext: Python / Ghillie Ops / Gauntlet-Shots aus world.json
Code:
if d.min()<35: continue   # nur Abstand zu Baeumen und Hang geprueft
Problem: Eigener Fehler: forest_edge (663, 108) lag im flachen Flussbett, der Shot zeigte Kies und Wasseroberflaeche
Fix: Zusaetzlich Abstand zur Flusslinie aus world.json river >= 70 m verlangt
Status: funktioniert
Regel: Kamerapunkte gegen Fluss, Wege und Kartenrand pruefen, nicht nur gegen Hindernisse.

### 2026-10-07 | Builder stellt CRLF auf LF um
Kontext: JS / Ghillie Ops / terrain.js
Code:
git diff --stat a54cf01 -- terrain.js   # 1279 Zeilen statt 127
Problem: Der Gelaende-Builder schrieb die Datei mit LF, das Original hatte CRLF, der Diff wurde unlesbar
Fix: Nach dem Builder CRLF wiederhergestellt, Builder-Prompts verlangen kuenftig die Zeilenenden der Datei
Status: funktioniert
Regel: Nach jedem Builder Zeilenenden mit file pruefen, CRLF-Dateien bleiben CRLF.

### 2026-10-07 | Workflow: Argumentdatei als scriptPath uebergeben
Kontext: Workflow-Tool / Gauntlet-Orchestrierung
Code:
Workflow({ script: '...', scriptPath: 'r1_review_args.json' })
Problem: Eigener Fehler: scriptPath hat Vorrang vor script, die JSON-Datei wurde als Skript geparst
Fix: Grosse Eingaben als Dateien ablegen, nur Pfade in args uebergeben
Status: funktioniert
Regel: scriptPath nur fuer Workflow-Skripte, Daten immer ueber args.
