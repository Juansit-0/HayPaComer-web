# Model credits

| File | Source | Author | Changes |
|---|---|---|---|
| `campesino.glb` | Generated with [Hyper3D Rodin](https://hyper3d.ai) | Juan Camilo López Díaz | Simplified to 8000 triangles, ambient occlusion baked into vertex colours, 19-bone skeleton, Mixamo walk carried onto it |
| `campesina.glb` | Generated with [Hyper3D Rodin](https://hyper3d.ai) | Juan Camilo López Díaz | Same as above, skirt and ruana weighted to the hips and arms |
| `cargador.glb` | Generated with [Hyper3D Rodin](https://hyper3d.ai) | Juan Camilo López Díaz | Same as above, centred on the feet, the sack held by the right hand |
| `vecina.glb` | Generated with [Hyper3D Rodin](https://hyper3d.ai) | Juan Camilo López Díaz | Same as above |
| `vecino.glb` | Generated with [Hyper3D Rodin](https://hyper3d.ai) | Juan Camilo López Díaz | Same as above |

The walk is the "Walking" motion capture from [Adobe Mixamo](https://www.mixamo.com), free for personal and commercial projects, retargeted onto each skeleton and kept in place.

The processing is `tools/blender/character.py`; garment colours are painted at runtime by `app/story/figures.js`.
