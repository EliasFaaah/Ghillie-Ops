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
