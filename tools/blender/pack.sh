#!/bin/bash
GP=/c/Users/Leschke/Downloads/GhillieOps/tools/gltfpack.exe
EXP="${GHILLIE_WORK:-/c/Users/Leschke/Downloads/GhillieWork}/exp"
OUT=/c/Users/Leschke/Downloads/Models/GhillieOps
for n in "$@"; do
  "$GP" -i "$EXP/$n/$n.gltf" -o "$OUT/$n.glb" -cc -tc -tu normal,attrib -kn -km $PACK_EXTRA 2>&1 | tail -2
done
