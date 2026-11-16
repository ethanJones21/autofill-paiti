# Autofill PAITI

Extensión de Chrome (uso interno) para guardar y rellenar formularios por usuario, con datos en MongoDB.

## 1. Servidor
```
cd server
npm install
copy .env.example .env     (ajusta MONGO_URI si hace falta)
npm start
```
Colección `forms` en la base `autofill_paiti`: `{ user, name, page, fields[], updatedAt }`.

## 2. Extensión
Chrome → `chrome://extensions` → activar *Modo desarrollador* → *Cargar descomprimida* → carpeta `extension`.

## 3. Uso
1. Abrir el popup → **Configuración**: usuario (ej. `raul`), URL del servidor, guardar.
2. En el formulario del sistema, llenarlo a mano → **Capturar campos** → marcar los que se quieren guardar, editar valores, poner nombre → **Guardar**.
3. Otro día, en la misma pantalla → **Rellenar** junto al formulario guardado.

## Cómo identifica campos sin id
Cada campo se guarda con: id (si no parece autogenerado), name, texto del label (Bootstrap 3 `.form-group`, tablas), ruta CSS y posición. Al rellenar se puntúa cada coincidencia y se elige la mejor.

## Textareas que no aceptan pegar
Configuración → *Textarea*. En "Automático" prueba, en orden: asignar valor → insertar texto → simular drag&drop → teclear carácter por carácter, y verifica que el texto haya quedado. Si tu sistema solo acepta un método, fíjalo ahí.
Nota: si la página usa plugins (select2, bootstrap-select, editores WYSIWYG) puede requerir ajustes adicionales.
