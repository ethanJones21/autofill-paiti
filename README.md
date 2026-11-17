# Autofill PAITI

Extensión de Chrome (uso interno) para grabar y reproducir flujos en el sistema, con datos en MongoDB. Los flujos son privados (solo el dueño) o públicos (los ve cualquiera, incluso sin sesión).

## 1. Servidor
```
cd server
npm install
copy .env.example .env     (ajusta MONGO_URI y pon un TOKEN_SECRET largo y aleatorio)
npm start
```
Colecciones en la base `autofill_paiti`:
- `users`: `{ username, passwordHash, createdAt }` (hash scrypt, nunca la clave).
- `flows`: `{ ownerId, owner, name, page, steps[], visibility: "private"|"public", createdAt, updatedAt }`.

### Crear o cambiar usuarios
```
node create-user.js raul miClave
```
Si el usuario existe, cambia su contraseña.

## 2. Extensión
Chrome → `chrome://extensions` → activar *Modo desarrollador* → *Cargar descomprimida* → carpeta `extension`.

## 3. Uso
1. Popup → **Iniciar sesión** con usuario y contraseña; con sesión solo se ve tu usuario y *Salir*. La URL del servidor es la constante `SERVER_URL` al inicio de `extension/popup.js`.
2. **● Grabar flujo**, trabajar en la página, parar con el panel rojo, reabrir el popup, ajustar pasos, ponerle nombre y elegir Privado/Público → *Guardar flujo*.
3. Pestañas **Mis flujos** (tus privados y públicos) y **Públicos** (de todos; sin sesión solo existe esta). En la lista: **▶** reproduce, **⧉** clona (copia privada, también de flujos públicos ajenos), **✎** edita (nombre, visibilidad, valores, orden y pasos), **✕** elimina. Editar y eliminar son solo para el dueño.

Un flujo público expone los valores escritos en sus pasos. Revísalos antes de publicar.

## Cómo identifica campos sin id
Cada campo se guarda con: id (si no parece autogenerado), name, texto del label (Bootstrap 3 `.form-group`, tablas), ruta CSS y posición. Al reproducir se puntúa cada coincidencia y se elige la mejor.

## Textareas que no aceptan pegar
El método es automático: prueba, en orden, asignar valor → insertar texto → simular drag&drop → teclear carácter por carácter, y verifica que el texto haya quedado. Se puede fijar uno cambiando `method` en `cfg`, al inicio de `extension/popup.js`.
Nota: si la página usa plugins (select2, bootstrap-select, editores WYSIWYG) puede requerir ajustes adicionales.
