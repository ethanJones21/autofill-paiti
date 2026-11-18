# Autofill PAITI

## Reglas

- Cuando el usuario diga "changelog" (crear, actualizar o generar el changelog o las notas de versión), usa la skill `changelog-generator` (`.claude/skills/changelog-generator`). Invócala con la herramienta Skill antes de escribir nada, y no armes el changelog a mano.
- Versión de la extensión: al hacer el changelog, revisa si desde el último changelog/tag hay commits que tocan la carpeta `extension/` (`git log <último-tag>..HEAD -- extension`). Solo si los hay, sube la versión **minor** en `extension/manifest.json` (1.2.0 → 1.3.0, patch a 0) y usa esa versión como título de la entrada del changelog. Si no hay commits en `extension/`, no toques el manifest.
- Publicación: después de commitear, el usuario crea el tag `v<versión>` (igual al manifest) y lo sube con `git push --tags`; el workflow `.github/workflows/release-extension.yml` genera el Release con el zip de `extension/`. No crees ni subas el tag sin que el usuario lo pida.
