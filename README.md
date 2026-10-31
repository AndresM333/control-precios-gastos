# Control de Precios y Gastos (PWA)

<div align="center">

## 🚀 ¡Pruébala en vivo o Instálala con un solo clic!

| 🌟 **Instalación Limpia Oficial** *(Recomendada para uso personal/familiar)* | 🧪 **Modo Demostración** *(Para explorar y probar)* |
| :---: | :---: |
| [![Instalación Limpia](https://img.shields.io/badge/✨%20INSTALACIÓN%20LIMPIA%20(SIN%20DATOS)-10B981?style=for-the-badge&logo=sparkles&logoColor=white)](https://andresm333.github.io/control-precios-gastos/?mode=clean) | [![Modo Demo](https://img.shields.io/badge/🧪%20PROBAR%20CON%20DATOS%20DEMO-6366F1?style=for-the-badge&logo=flask&logoColor=white)](https://andresm333.github.io/control-precios-gastos/?mode=demo) |
| 👉 **[Abrir App Limpia para Instalar](https://andresm333.github.io/control-precios-gastos/?mode=clean)** 👈<br>*Inicia 100% vacía (0 tiendas y 0 productos), lista para tus compras reales.* | 👉 **[Abrir con Tiendas y Productos Demo](https://andresm333.github.io/control-precios-gastos/?mode=demo)** 👈<br>*Carga tiendas y productos de ejemplo para ver cómo funciona.* |

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Online-2563EB?style=for-the-badge&logo=github&logoColor=white)](https://andresm333.github.io/control-precios-gastos/)

*No requiere instalar archivos ejecutables ni APKs. Funciona directo en tu teléfono o computadora como PWA.*

| 📸 **Acceso Directo Escáner** | 🛒 **Acceso Directo Mercado** | 💵 **Acceso Directo Gastos** |
| :---: | :---: | :---: |
| [▶ Probar Escáner de Facturas](https://andresm333.github.io/control-precios-gastos/?action=scan) | [▶ Probar Programar Mercado](https://andresm333.github.io/control-precios-gastos/?action=planner) | [▶ Probar Cargar Gasto](https://andresm333.github.io/control-precios-gastos/?action=expense) |

</div>

---

Aplicación Web Progresiva (PWA) instalable para **teléfono (Android / iOS)** y **computadora (Windows / Mac)**, diseñada para registrar compras y facturas mediante IA, monitorear gastos diarios, comparar tiendas inteligentemente y analizar la evolución de precios con la tasa oficial del Banco de Venezuela (BCV).

---

## ⚡ Instalación y Accesos Rápidos con Shortcut Manager

Esta aplicación incluye integración total con **Shortcut Manager** y la API nativa de atajos rápidos de Android y Windows para que puedas abrir funciones específicas en 1 solo toque.

### Método 1: Atajos Nativos de Android (Mantener pulsado el icono)
1. Instala la aplicación en la pantalla de inicio de tu teléfono desde el navegador.
2. **Mantén presionado el icono de la app** durante 1 segundo.
3. El administrador de atajos de Android desplegará el menú con 3 accesos instantáneos:
   - 📸 **Escanear Factura IA**: Abre directo la cámara y el analizador de facturas.
   - 🛒 **Programar Mercado**: Te lleva directo a optimizar tu lista de compras.
   - 💵 **Cargar Gasto Manual**: Abre de inmediato la ventana para registrar un gasto rápido.
4. **Tip**: Puedes arrastrar cualquiera de estos atajos a un espacio vacío de tu pantalla de inicio para tener un botón dedicado.

### Método 2: Usando Apps de "Shortcut Manager" / "Shortcut Maker" en Android
Si utilizas aplicaciones de gestión de atajos en Android (como **Shortcut Manager**, **Shortcut Maker** o **QuickShortcutMaker**):
1. Abre tu aplicación de **Shortcut Manager**.
2. Selecciona la opción **"Web Link" / "Enlace Web"** (o Crear atajo de navegador).
3. Ingresa la URL de la función que deseas abrir directamente:
   - **Para abrir el Escáner de Facturas**: `http://TU_IP_O_DOMINIO:8080/index.html?action=scan`
   - **Para abrir Programar Mercado**: `http://TU_IP_O_DOMINIO:8080/index.html?action=planner`
   - **Para cargar un Gasto Rápido**: `http://TU_IP_O_DOMINIO:8080/index.html?action=expense`
4. Selecciona el icono personalizado (puedes usar el archivo `icons/icon.svg` incluido).
5. Pulsa en **"Create Shortcut" (Crear Acceso Directo)** para colocarlo en tu pantalla.

### Método 3: En la Computadora (Windows / Mac con extensiones de atajos)
Si usas extensiones de navegador como **Shortcut Manager**:
1. Crea un nuevo atajo asignando la combinación de teclas que prefieras (por ejemplo, `Ctrl + Shift + F` para Facturas o `Ctrl + Shift + G` para Gastos).
2. Asigna la URL local `http://localhost:8080/index.html?action=scan` para abrir instantáneamente la pantalla de captura sin navegar manualmente por el menú.

---

## 🚀 Cómo Iniciar la Aplicación

### En Windows (Computadora):
1. Ve a la carpeta `C:\Users\AM\.gemini\antigravity\scratch\control_precios_gastos`.
2. Haz doble clic en el archivo **`iniciar_app.bat`**.
3. Se abrirá automáticamente en tu navegador web predeterminado (Chrome, Brave, Edge).
4. **Para instalarla en tu PC como app nativa**: En la barra de direcciones de tu navegador, haz clic en el icono de **"Instalar aplicación"** (o en el menú `...` > *Instalar Precios & Gastos*). Se creará un acceso directo en tu escritorio e inicio de Windows.

### En tu Teléfono Celular (Android / iPhone):
1. Asegúrate de que tu celular esté conectado al **mismo Wi-Fi** que tu computadora.
2. Al ejecutar `iniciar_app.bat`, la ventana negra te mostrará tu dirección de red local (por ejemplo: `http://192.168.1.15:8080`).
3. Abre esa dirección en el navegador de tu teléfono (Chrome o Safari).
4. **Para instalarla en tu teléfono**: Toca el menú de opciones (los 3 puntos en Chrome o el botón Compartir en Safari) y selecciona **"Añadir a la pantalla de inicio"** o **"Instalar aplicación"**.
5. ¡Listo! Tendrás la aplicación instalada en tu teléfono con ícono propio, pantalla completa y acceso a la cámara.

---

## 🌟 Características Principales

### 1. 📸 Escaneo de Facturas con IA y Compresión Extrema
- **Compresión Extrema**: Reduce fotos de 5-10 MB a un archivo **WebP en escala de grises de ~20-35 KB** (>98.5% de ahorro). Puedes almacenar miles de facturas sin llenar la memoria de tu dispositivo.
- **Google Gemini Flash (100% Gratuito)**: Extrae automáticamente el nombre de la tienda, la fecha, los productos, cantidades, precios unitarios y el total.
- **Actualización Automática**:
  - Si la tienda no existe, la crea.
  - Si el producto ya existe en esa tienda, actualiza su precio y registra la fecha en su historial.
  - **Seguridad en las calificaciones**: La IA tiene **estrictamente prohibido** asignar o modificar calificaciones de estrellas. Las valoraciones de calidad de 1 a 5 estrellas son 100% manuales y personales del usuario.
- **Registro en Contabilidad**: El total de la factura se anota automáticamente como un gasto en la sección de contabilidad.

### 2. 📈 Historial de Precios y Gráficas Porcentuales por Producto
- Gráfica interactiva de línea que muestra cómo ha cambiado el precio a lo largo del tiempo.
- Selector de rangos: **1 Mes, 3 Meses, 6 Meses, 1 Año o Todo el Historial**.
- Cálculo automático de variación porcentual:
  $$\Delta\% = \left(\frac{P_{final} - P_{inicial}}{P_{inicial}}\right) \times 100$$
  - Muestra en rojo si subió de precio ($+X\%$) o en verde si bajó ($ -X\% $ ahorro).
- Botón para alternar la visualización entre **Dólares ($)** y **Bolívares (Bs.)**.

### 3. 💵 Tasa Oficial Dual (Banco de Venezuela / BCV)
- Consulta automáticamente la tasa oficial del día vía API pública.
- Cada producto se registra en su moneda original (USD o Bs.) y el sistema genera automáticamente el valor en la otra moneda.
- Opción de actualizar la tasa manualmente en cualquier momento si estás sin conexión a internet.

### 4. 🛒 "Programar Mercado" (Canasta Interactiva con Cantidades + y -)
- **Catálogo Disponible**: Cada producto cuenta con un botón verde `+` para añadir unidades inmediatamente a la canasta.
- **Canasta Elegida**:
  - Control de unidades dinámico con botones `-` y `+`. Al reducir la cantidad a 0, el producto se retira automáticamente de la canasta.
  - Indicador de unidades totales y cantidad de productos seleccionados.
  - Botón para vaciar la canasta en un solo clic.
- **Optimizador Multi-Criterio**: Multiplica los precios unitarios por las cantidades elegidas y calcula:
  1. 💰 **La Tienda Más Barata**: Calcula el costo total exacto de la canasta con los precios actualizados.
  2. 📍 **La Tienda Más Cercana**: Mide la distancia en km utilizando coordenadas GPS o Google Maps.
  3. ⭐ **La Tienda Mejor Valorada**: Promedia las estrellas (1-5 ⭐) de los productos de tu canasta en cada comercio.
- Te indica si falta algún producto en una tienda específica para que no hagas viajes en vano.

### 5. 🎨 Identificadores Visuales Obligatorios (Íconos SVG y Fotos)
- **Tiendas**: Toda tienda debe contar obligatoriamente con una foto real o un ícono SVG estándar (Supermercado, Minimarket, Farmacia, Panadería, Carnicería, Frutería, etc.).
- **Productos**: Todo producto debe contar obligatoriamente con una foto real optimizada en WebP o un ícono SVG estándar (Granos/Harinas, Lácteos, Carnes, Frutas, Enlatados, Café, Limpieza, Farmacia, etc.).
- **Tienda Interactiva**: Al tocar o presionar el bloque de cualquier tienda, se despliega una ventana emergente interactiva con todos los productos registrados en ese comercio y un botón directo para agregar nuevos productos vinculados a esa tienda.

### 6. ⭐ Calificación de Estrellas Compartida
- Los productos que compartan el **mismo nombre y la misma imagen o ícono**, aunque pertenezcan a diferentes tiendas, **comparten automáticamente su valoración de calidad (1 a 5 estrellas)**.
- Se valora el producto intrínseco (su sabor, frescura o marca) y no el comercio que lo distribuye.

### 7. 📍 Geoperimetraje y Aviso de Ubicación en Tiempo Real
- Al iniciar, la aplicación solicita permiso para obtener la ubicación GPS en tiempo real.
- Si el usuario bloquea o deniega el permiso, se presenta una ventana emergente informativa detallando qué funciones se pierden (cálculo de distancias en km, filtro de la tienda más cercana y autollenado de coordenadas al registrar comercios).

### 8. 📊 Zona de Contabilidad (Control de Gastos Diarios)
- Filtros por período: **Hoy, Esta Semana, Este Mes y Todo**.
- Visualización de totales tanto en USD como en Bolívares.
- Asientos automáticos procedentes de facturas procesadas y botón para **+ Cargar Gastos Manuales** (transporte, propinas, comidas callejeras, servicios).

### 6. 🗃️ Archivo de Facturas
- Galería independiente para consultar tus facturas antiguas sin ralentizar la app principal.
- Visor de imagen de alto contraste con lista detallada de productos comprados.

### 7. ☁️ Respaldo Selectivo y Google Drive
- **Sincronización en la Nube**: Interruptor en Ajustes para mantener tu información sincronizada entre la PC y teléfonos.
- **Exportación Granular**:
  - Elige si exportar todo o sólo tiendas específicas.
  - Opción de **Guardar tiendas con número identificador** (ej: `Automercados Plaza's (1)`) para compartir listas de precios con familiares o amigos sin peligro de sobreescribir sus datos propios.
- **Importador Inteligente**: Previsualiza el contenido del respaldo y te permite decidir si renombrar duplicados con números, actualizar solo precios o ignorar repetidos.

### 8. 👥 Login con Google, Grupos Compartidos y Copia a Espacio Personal
- **Acceso Exclusivo con Google**: Inicia sesión con tu cuenta de Gmail.
- **Separación Total de Bibliotecas**:
  - **👤 Mi Espacio Personal**: Tu biblioteca privada de tiendas, productos y contabilidad. Nadie más tiene acceso.
  - **👥 Grupos Compartidos (Familia / Equipo)**: Espacios colaborativos donde varios miembros ven y actualizan los mismos precios en tiempo real.
  - Selector rápido en la barra superior para alternar entre tu espacio personal y tus grupos en 1 clic.
- **Invitaciones por Correo Electrónico**:
  - El Administrador del grupo agrega a las personas usando **únicamente su correo de Gmail**.
  - **Seguridad Garantizada**: El invitado solo podrá unirse y ver los precios si inicia sesión con esa cuenta de Google específica.
- **📥 Motor de Copia al Espacio Personal**:
  - Botón individual en cada tienda y producto: **"📥 A Personal"**.
  - Botón en el banner del grupo: **"📥 Copiar biblioteca del grupo a mi espacio personal"**.
  - Al copiar, se actualizan los precios más recientes sin sobreescribir tus calificaciones personales de calidad (1 a 5 ⭐), manteniendo tus datos privados intactos.
- **Reglas de Seguridad en la Nube**: El repositorio incluye el archivo `firestore.rules` con las reglas de seguridad listas para desplegar en Firebase.

---

## 🔑 Cómo Obtener tu Clave Gratuita de Gemini Flash

1. Ingresa a [Google AI Studio (aistudio.google.com)](https://aistudio.google.com/app/apikey).
2. Inicia sesión con tu cuenta de Google.
3. Haz clic en el botón azul **"Create API Key"** (Crear clave API).
4. Copia la clave (empieza por `AIzaSy...`) y pégala en la pestaña **Ajustes** de tu app.
5. ¡Listo! El nivel gratuito de Google permite hasta 1.500 solicitudes al día sin pagar absolutamente nada.
