---
name: PGIM
description: Gestión de restaurantes multi-sucursal; la carta del comensal y las pantallas del restaurante sobre un mismo sistema.
colors:
  verde-albahaca: "#16756b"
  verde-albahaca-hondo: "#125e56"
  verde-albahaca-suave: "#e3eeed"
  hoja-albahaca: "#dceae9"
  blanco-mantel: "#ffffff"
  gris-bandeja: "#f4f5f7"
  linea-suave: "#e4e6e9"
  linea-firme: "#d3d7dc"
  tinta: "#15171a"
  texto: "#23262b"
  gris-nota: "#5d636b"
  azul-listo: "#1d5fb4"
  azul-listo-suave: "#eaf1fb"
  amarillo-riesgo: "#a16207"
  amarillo-riesgo-suave: "#fefce8"
  rojo-falta: "#b91c1c"
  rojo-falta-suave: "#fef2f2"
typography:
  display:
    fontFamily: "Urbanist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: "30px"
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Urbanist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Urbanist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "28px"
  body:
    fontFamily: "Urbanist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
    fontFeature: "tnum"
  label:
    fontFamily: "Urbanist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "19.5px"
  caption:
    fontFamily: "Urbanist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
rounded:
  control: "10px"
  cuadrado: "12px"
  panel: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.verde-albahaca}"
    textColor: "{colors.blanco-mantel}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.verde-albahaca-hondo}"
  button-secondary:
    backgroundColor: "{colors.blanco-mantel}"
    textColor: "{colors.texto}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.gris-bandeja}"
  button-tonal:
    backgroundColor: "{colors.verde-albahaca-suave}"
    textColor: "{colors.verde-albahaca-hondo}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.blanco-mantel}"
    textColor: "{colors.rojo-falta}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.gris-nota}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  input:
    backgroundColor: "{colors.blanco-mantel}"
    textColor: "{colors.texto}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  chip:
    backgroundColor: "{colors.blanco-mantel}"
    textColor: "{colors.texto}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.verde-albahaca}"
    textColor: "{colors.blanco-mantel}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  segmented-option-active:
    backgroundColor: "{colors.verde-albahaca-suave}"
    textColor: "{colors.verde-albahaca-hondo}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  tag-en-curso:
    backgroundColor: "{colors.verde-albahaca-suave}"
    textColor: "{colors.verde-albahaca-hondo}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  tag-listo:
    backgroundColor: "{colors.azul-listo-suave}"
    textColor: "{colors.azul-listo}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  tag-riesgo:
    backgroundColor: "{colors.amarillo-riesgo-suave}"
    textColor: "{colors.amarillo-riesgo}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  tag-falta:
    backgroundColor: "{colors.rojo-falta-suave}"
    textColor: "{colors.rojo-falta}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.blanco-mantel}"
    rounded: "{rounded.panel}"
    padding: "16px"
  kpi:
    backgroundColor: "{colors.gris-bandeja}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.panel}"
    padding: "10px 12px"
  nav-item-active:
    backgroundColor: "{colors.verde-albahaca-suave}"
    textColor: "{colors.verde-albahaca-hondo}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
---

# Design System: PGIM

## Overview

**Creative North Star: "La mesa puesta"**

Todo a mano y en su lugar. Las superficies son blancas y limpias, los grupos se arman con hojas de un verde muy claro, y el Verde Albahaca aparece solo donde se puede tocar o donde algo está pasando. Nada decora: la foto del plato, el precio y la acción siguiente son el contenido.

El sistema tiene dos registros sobre los mismos tokens. **El comensal** es "La mesa puesta" en estado puro: carta sobre hoja tintada, tarjetas blancas con la foto arriba, densidad cómoda de 44 px (la carta nueva está pendiente; hoy el comensal usa la lista anterior). **El restaurante** (panel, cocina y salón) sigue la filosofía de **"El buen mozo"**: claro, rápido y amable, con jerarquía tipográfica fuerte y la acción siguiente siempre escrita, porque se lee de pie, a distancia y con apuro.

Tema claro único. Nada de beige, piedra ni crema: el blanco es blanco y los grises son fríos.

**Key Characteristics:**
- Un solo acento, Verde Albahaca, reservado para acción y estado en curso.
- Urbanist en toda la app; hoy de 400 a 600 (700–800 pendiente, para los títulos del comensal).
- Tres densidades: compacta (36 px) en escritorio, comensal (44 px) en el celular, táctil (48 px) en cocina y salón.
- Estados siempre con tono, ícono y texto; el OK es azul.
- Una sola sombra, solo para lo que flota.

## Colors

Un verde comestible sobre blanco y grises fríos, con tres tonos de estado que nunca compiten con el acento.

### Primary
- **Verde Albahaca** (#16756b): acción principal, navegación activa, foco, chip seleccionado y todo lo que está "en curso" (En preparación, Mesa en curso, Cuenta abierta). Blanco encima pasa AA.
- **Verde Albahaca Hondo** (#125e56): hover de la acción y texto sobre fondos verdes suaves.
- **Verde Albahaca Suave** (#e3eeed): fondo de la opción activa, del botón tonal y de la etiqueta "en curso".
- **Hoja de Albahaca** (#dceae9): hoja tintada que agrupa contenido detrás de tarjetas blancas en el comensal. Pendiente: el token existe, ninguna pantalla lo usa todavía.

### Neutral
- **Blanco Mantel** (#ffffff): fondo de página y de tarjetas.
- **Gris Bandeja** (#f4f5f7): paneles secundarios, KPI, hover de filas y botones.
- **Línea Suave** (#e4e6e9): bordes de tarjetas y divisores.
- **Línea Firme** (#d3d7dc): bordes de controles (campos, botón secundario, segmentado).
- **Tinta** (#15171a): títulos y cifras.
- **Texto** (#23262b): texto corrido.
- **Gris Nota** (#5d636b): metadatos, ayudas y etiquetas secundarias.

### Estados
- **Azul Listo** (#1d5fb4) sobre **#eaf1fb**: OK, Listo, Aprobado, Confirmada, mesa libre, guardado con éxito.
- **Amarillo Riesgo** (#a16207) sobre **#fefce8**: en riesgo, inasistencia.
- **Rojo Falta** (#b91c1c) sobre **#fef2f2**: faltante, error, cancelado, rechazado.

### Named Rules
**The Albahaca Touch Rule.** El verde solo marca lo que se puede tocar o lo que está en curso. Si un elemento verde no hace nada y no está pasando, no es verde.

**The Listo Is Blue Rule.** El estado OK es azul, nunca verde, para que "En preparación" y "Listo" no se confundan en la cola de cocina.

**The No-Beige Rule.** No hay fondos cálidos, piedra ni crema. Las superficies son Blanco Mantel o Gris Bandeja.

## Typography

**Display Font:** Urbanist Variable (con ui-sans-serif, system-ui)
**Body Font:** Urbanist Variable (con ui-sans-serif, system-ui)

**Character:** una geométrica amable de una sola familia: redonda y abierta en el texto, compacta y firme en los títulos (hoy 600; 700–800 pendiente). Las cifras van tabulares en toda la app.

### Hierarchy
- **Display** (600, 26px, 30px): títulos de las pantallas del comensal.
- **Headline** (600, 22px, 28px): título de página del panel y cifras de KPI.
- **Title** (600, 16px, 28px): títulos de panel, modal y sección.
- **Body** (400, 15px, 22px): texto corrido y celdas; textos largos a 65–75ch.
- **Label** (500, 13px, 19.5px): botones compactos, campos y navegación de escritorio.
- **Caption** (600, 12px, 16px): etiquetas de estado y metadatos.

### Named Rules
**The Sixteen-Pixel Field Rule.** En el celular, el texto de los campos va a 16 px; con menos, iOS hace zoom al enfocar.

**The Tabular Rule.** Precios, cantidades, horas y totales usan cifras tabulares para que se alineen en columna.

## Layout

Una columna en el celular y grillas por rol en escritorio. El comensal usa un ancho máximo de 480 px con la acción principal fija abajo, al alcance del pulgar. El panel usa una barra lateral (80 px con íconos en tablet, 224 px con texto desde `lg`) y contenido con márgenes de 16 a 24 px.

Las tres densidades fijan la altura de los controles: compacta 36 px (44 px en celular), comensal 44 px y táctil 48 px. El espaciado sigue la escala de 4 px; los grupos se separan con `gap`, no con márgenes.

**The Thumb Rule.** En el celular, la acción principal de la pantalla queda fija abajo; nunca arriba ni escondida en un menú.

## Elevation & Depth

Plano por defecto. La profundidad sale de bordes de 1 px, del Gris Bandeja y de las hojas tintadas; las tarjetas apoyadas no llevan sombra.

### Shadow Vocabulary
- **Flotante** (`box-shadow: 0 10px 28px rgb(21 23 26 / 0.16)`): solo para lo que flota sobre la pantalla: modales, desplegables y avisos. Pendiente: las barras fijas del comensal hoy llevan solo borde.

### Named Rules
**The One Shadow Rule.** Hay una sola sombra y es para lo que flota. Si está apoyado, lleva borde, no sombra.

## Shapes

Esquinas suaves y consistentes: 10 px en controles, 12 px en botones cuadrados de ícono (pendiente: el token existe, ningún componente lo usa todavía), 16 px en tarjetas, paneles y modales, y píldora para chips y etiquetas. Los bordes son de 1 px; el borde punteado se reserva para estados vacíos.

## Components

### Buttons
- **Shape:** esquinas suaves (10px); un solo botón principal por pantalla.
- **Primary:** Verde Albahaca con texto blanco; alto por densidad (36, 44 o 48 px).
- **Hover / Focus:** hover a Verde Albahaca Hondo; foco con contorno de 2 px en Verde Albahaca separado 2 px.
- **Secundario:** blanco con borde Línea Firme. **Tonal:** Verde Albahaca Suave con texto Hondo, para acciones repetidas en filas o tarjetas. **Peligro:** blanco con texto Rojo Falta. **Fantasma:** sin fondo, texto Gris Nota.

### Chips
- **Style:** píldora de 44 px, blanco con borde Línea Firme.
- **State:** seleccionado en Verde Albahaca con texto blanco.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Blanco Mantel; los KPI van sobre Gris Bandeja.
- **Shadow Strategy:** sin sombra (ver Elevation & Depth).
- **Border:** Línea Suave de 1 px.
- **Internal Padding:** 16px.

### Inputs / Fields
- **Style:** borde Línea Firme, fondo blanco, esquinas de 10px; 44 px de alto en el celular y 36 px en escritorio.
- **Focus:** borde Verde Albahaca con un halo del 20 % del mismo verde.
- **Error / Disabled:** error con mensaje en Rojo Falta y su ícono (el borde rojo del campo está pendiente); deshabilitado sobre Gris Bandeja con texto Gris Nota.

### Navigation
- **Panel:** barra lateral blanca; el ítem activo va en Verde Albahaca Suave con texto Hondo y el ícono en Verde Albahaca. En tablet, ícono arriba y texto chico debajo.
- **Comensal:** pestañas inferiores con ícono y texto; la activa en Verde Albahaca Hondo.

### Estado
Etiqueta en píldora con ícono, texto y tono; la única fuente es `lib/estados.ts` y ninguna pantalla elige el color a mano.

## Do's and Don'ts

### Do:
- **Do** usar Verde Albahaca (#16756b) solo en acciones, navegación activa, foco y estados en curso.
- **Do** acompañar cada estado con ícono y texto, y usar Azul Listo (#1d5fb4) para OK.
- **Do** escribir la acción siguiente en el restaurante ("Marcar listo", "Activar mesa") en lugar de dejar un ícono solo.
- **Do** agrupar el contenido del comensal sobre Hoja de Albahaca (#dceae9) con tarjetas blancas encima (pendiente, llega con la carta nueva).
- **Do** respetar las alturas por densidad: 36, 44 y 48 px.

### Don't:
- **Don't** usar fondos beige, piedra o crema.
- **Don't** sumar un segundo color de acento ni volver al terracota.
- **Don't** usar verde para un estado OK.
- **Don't** poner sombra a tarjetas apoyadas.
- **Don't** usar modo oscuro: el tema es claro único.
