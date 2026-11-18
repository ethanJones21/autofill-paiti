# Changelog

Todo lo nuevo de Autofill PAITI, explicado sin tecnicismos. Lo más reciente va primero.

## Sin publicar · 18 de noviembre de 2026

### ✨ Novedades

- **Aviso al reproducir un flujo**: al pulsar ▶ el popup se cierra y aparece una tarjeta abajo a la derecha de la página, con barra de progreso y botón **Detener**.
- **Errores a la vista**: si algún paso falla, la tarjeta se pone roja y lista exactamente qué paso falló y por qué. Se queda hasta que la cierres. Si todo sale bien, se pone verde y desaparece sola.
- **Indicadores de carga**: los flujos muestran un esqueleto animado mientras llegan, y los botones muestran un spinner mientras trabajan (entrar, salir, guardar, clonar, borrar, reproducir, grabar). Si el servidor tarda, avisa que está despertando.
- **Ojo en la contraseña**: el botón 👁 muestra u oculta lo que escribes.

### 🔧 Mejoras

- **Nuevo diseño**: tarjetas blancas, campos redondeados con borde azul al enfocarlos, botón principal azul, pestañas tipo selector y etiquetas de colores.
- **Iniciar sesión es un desplegable** con la flecha ▼ a la derecha. Cuando ya entraste, solo ves tu usuario y **Salir**.
- **Menos pasos al guardar**: se evita crear el mismo flujo dos veces por un doble clic.
- **Sin ajustes**: se quitó el panel de Ajustes. El método de textarea queda en automático y la espera en 800 ms.

### 🐛 Correcciones

- No se podía escribir en el campo de contraseña del inicio de sesión.

## 17 de noviembre de 2026

### ✨ Novedades

- **Usuarios y contraseñas**: cada persona entra con su usuario. Las contraseñas se guardan cifradas y las sesiones duran 30 días.
- **Flujos privados y públicos**: tus flujos son privados por defecto. Si los haces públicos, cualquiera puede verlos y reproducirlos, incluso sin iniciar sesión.
- **Pestañas Mis flujos y Públicos**, para separar lo tuyo de lo de todos.
- **Editar flujos**: cambia nombre, visibilidad, valores, orden de los pasos o quita pasos que sobren.
- **Clonar flujos**: copia un flujo tuyo para editarlo rápido, o un flujo público de otra persona para hacerlo tuyo. La copia es privada.
- **Crear usuarios**: el script `create-user.js` los crea o cambia su contraseña.

### 🔧 Mejoras

- La aplicación se centra en grabar y reproducir flujos. Se quitó el guardado de formularios sueltos y sus registros.
- Solo el dueño puede editar o borrar un flujo.
- El servidor identifica quién eres por tu sesión, ya no por un nombre de usuario que se manda en la petición ni por una clave compartida.

### ⚠️ Cambios importantes

- Es obligatorio definir `TOKEN_SECRET` en el servidor, o no arranca.
- Los flujos guardados antes de esta versión no tienen dueño y ya no aparecen en la lista. Siguen en la base de datos.

## 16 de noviembre de 2026

### ✨ Novedades

- **Grabar flujos**: graba lo que haces en la página (campos y clics) y reprodúcelo cuando lo necesites.
- **Guardar formularios** y rellenarlos después, por usuario.
- **Producción y desarrollo**: se podía elegir el servidor al que conectarse.
- **Varios modales**: los flujos ya funcionan con pantallas que se abren encima de otras.
