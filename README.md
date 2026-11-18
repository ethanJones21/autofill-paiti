# Autofill PAITI

Extensión de Chrome (uso interno) para grabar y reproducir flujos en el sistema, con datos en MongoDB. Cada persona entra con su usuario y contraseña. Los flujos son privados (solo el dueño) o públicos (los ve cualquiera, incluso sin sesión).

## 1. Servidor

```bash
cd server
npm install
copy .env.example .env
npm start
```

Variables del `.env` (también en Render):

| Variable       | Para qué                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`         | Puerto (3000 por defecto)                                                                                                                            |
| `MONGO_URI`    | Conexión a MongoDB                                                                                                                                   |
| `DB_NAME`      | Base de datos (`autofill_paiti` por defecto)                                                                                                         |
| `TOKEN_SECRET` | Texto largo y aleatorio que firma las sesiones. Obligatorio: sin él el servidor no arranca. Si lo cambias, todos tienen que volver a iniciar sesión. |

Colecciones:

- `users`: `{ username, passwordHash, createdAt }`. El hash es scrypt, nunca se guarda la clave.
- `flows`: `{ ownerId, owner, name, page, steps[], visibility: "private" | "public", createdAt, updatedAt }`. El nombre es único por dueño.

### Crear o cambiar usuarios

```bash
node create-user.js raul miClave
```

Escribe en la base del `.env` donde lo ejecutes. Para crear usuarios en producción, ejecútalo con el `MONGO_URI` y `DB_NAME` de producción. Si el usuario ya existe, cambia su contraseña.

### API

| Método y ruta               | Quién         | Qué hace                                                       |
| --------------------------- | ------------- | -------------------------------------------------------------- |
| `POST /api/login`           | Cualquiera    | Devuelve un token (vale 30 días)                               |
| `GET /api/flows`            | Cualquiera    | Sin sesión, los públicos; con sesión, los tuyos y los públicos |
| `POST /api/flows`           | Con sesión    | Crea un flujo                                                  |
| `PUT /api/flows/:id`        | Solo el dueño | Edita nombre, visibilidad y pasos                              |
| `POST /api/flows/:id/clone` | Con sesión    | Copia privada de un flujo tuyo o público                       |
| `DELETE /api/flows/:id`     | Solo el dueño | Elimina                                                        |

## 2. Extensión

Chrome → `chrome://extensions` → activar _Modo desarrollador_ → _Cargar descomprimida_ → carpeta `extension`. Después de cambiar el código, recarga la extensión y la pestaña donde pruebes.

Antes de repartir la carpeta, cambia `SERVER_URL` al inicio de `extension/popup.js` por la URL de producción.

## 3. Uso

1. **Iniciar sesión**: desplegable (▼) arriba del popup. Con sesión solo se ve tu usuario y _Salir_. El ojo 👁 muestra u oculta la contraseña.
2. **Grabar**: en _Mis flujos_, pulsa **● Grabar flujo**, trabaja en la página y para con el panel rojo. Reabre el popup, ajusta los pasos, ponle nombre y elige Privado o Público → _Guardar flujo_.
3. **Pestañas**: _Mis flujos_ (tus privados y públicos) y _Públicos_ (de todos). Sin sesión solo existe _Públicos_.
4. **Acciones** de cada flujo:
   - **▶** reproduce.
   - **⧉** clona. La copia es privada, y sirve también para copiar un flujo público ajeno.
   - **✎** edita nombre, visibilidad, valores, orden y pasos.
   - **✕** elimina.

   Editar y eliminar son solo para el dueño.

5. **Reproducción**: al pulsar ▶ el popup se cierra y la página muestra un aviso abajo a la derecha. Mientras corre, tiene barra de progreso y botón _Detener_. Si termina bien, se pone verde y se quita solo. Si hay problemas, queda una tarjeta roja con la lista de errores y un botón _Cerrar_.
6. **Cargas**: la lista muestra esqueletos mientras llega, y los botones muestran un spinner mientras trabajan. Si el servidor tarda más de 4 segundos, avisa que está despertando.

Un flujo público expone los valores escritos en sus pasos. Revísalos antes de publicar.

## Cómo identifica campos sin id

Cada campo se guarda con: id (si no parece autogenerado), name, texto del label (Bootstrap 3 `.form-group`, tablas), ruta CSS y posición. Al reproducir se puntúa cada coincidencia y se elige la mejor.

## Textareas que no aceptan pegar

El método es automático: prueba, en orden, asignar valor → insertar texto → simular drag&drop → teclear carácter por carácter, y verifica que el texto haya quedado. Se puede fijar uno cambiando `method` en `cfg`, al inicio de `extension/popup.js`.

Si la página usa plugins (select2, bootstrap-select, editores WYSIWYG) puede requerir ajustes adicionales.

## Notas

- Los flujos de la versión anterior no tienen dueño (`ownerId`), así que ya no aparecen. Siguen en la base. La colección `forms` ya no se usa.
- El servidor borra al arrancar el índice antiguo `user_1_name_1` de `flows`.

## Para instalar skills

```bash
npx skills@latest install
```

```bash
npx skills install -g
```
