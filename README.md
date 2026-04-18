# MathApp

App web de estudio para ninos de 3 basico en Chile, enfocada en multiplicaciones del 1 al 10 con una experiencia ludica, historial local y coleccion de stickers.

## Objetivo

El proyecto esta pensado como material de estudio infantil para practicar tablas de multiplicar dentro del modulo:

`Math > 3 basico > Multiplicaciones`

La app prioriza sesiones cortas, feedback positivo, progresion visible y compatibilidad total con despliegues estaticos como GitHub Pages.

## Funcionalidades principales

- Onboarding obligatorio con nombre del estudiante
- Nombre persistido en el navegador
- Tres juegos disponibles:
  - **Cohete de resultados**: responder escribiendo
  - **Selva de opciones**: responder eligiendo entre alternativas
  - **Eco matematico**: responder por voz o escribiendo
- Configuracion persistente:
  - priorizacion de tablas
  - cantidad de ejercicios por partida
  - modo desafio
- Sesiones sin ejercicios repetidos dentro de la misma partida
- Cronometro por sesion
- Modo desafio con 10 segundos por pregunta y alerta visual progresiva
- Historial local por estudiante
- Reportes con precision, mejor puntaje, tablas a reforzar y juego favorito
- Coleccionables con stickers desbloqueables
- Album completo que muestra stickers ganados y aun bloqueados
- Soporte para pantalla completa
- Confetti y efectos de sonido sintetizados en el navegador

## Sistema de recompensas

La app usa un sistema de recompensas ponderado:

- No todas las multiplicaciones valen lo mismo
- La precision del premio se calcula con un peso mayor para preguntas mas dificiles
- El sticker ganado depende de la **tabla dominante** de la sesion
- Un mismo sticker se puede ganar mas de una vez
- Si un estudiante acumula el mismo sticker, el album muestra un badge `xN`

### Rarezas actuales

- **Clasico**
- **Aventura**
- **Premium**
- **Legendario**

La tabla del 10 fue rebalanceada para que no entregue recompensas exageradamente raras.

## Stickers

La coleccion mezcla:

- SVG locales agregados al repositorio en `public\stickers`
- variantes adicionales basadas en Twemoji

## Persistencia

Toda la persistencia es cliente-side usando `localStorage`, para mantener compatibilidad con GitHub Pages.

Claves actuales:

- `mathapp-multiplication-history-v1`
- `mathapp-multiplication-settings-v1`
- `mathapp-student-name-v1`

## Stack

- React 19
- TypeScript
- Vite
- Framer Motion
- canvas-confetti

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

## Desarrollo local

```bash
npm install
npm run dev
```

La app quedara disponible en la URL que entregue Vite.

## Build de produccion

```bash
npm run build
```

## Lint

```bash
npm run lint
```

## Deploy

El proyecto esta preparado para GitHub Pages mediante:

- `vite.config.ts` con `base: '/mathapp/'`
- workflow en `.github\workflows\deploy-pages.yml`

URL publicada:

`https://blackbeta-cl.github.io/mathapp/`

## Estructura util

- `src\App.tsx`: logica principal de la app, juegos, configuracion, historial y stickers
- `src\App.css`: estilos principales
- `src\index.css`: estilos globales
- `public\stickers\`: assets SVG de la coleccion
- `svgs\`: carpeta de origen con SVG locales aportados para expandir stickers

## Consideraciones tecnicas

- La app debe seguir funcionando como sitio estatico
- Evitar dependencias de backend
- Cualquier nuevo almacenamiento debe seguir siendo compatible con GitHub Pages
- Si se agregan nuevos stickers, deben integrarse al catalogo y al sistema de rarezas/ponderacion
- Si se cambia la logica de premios, mantener consistencia entre:
  - album completo
  - historial de premios
  - banner de premio al finalizar

## Licencias y atribucion

Parte de los stickers adicionales usan graficos basados en **Twemoji**.

Referencia de atribucion:

`Twemoji graphics licensed under CC-BY 4.0 by Twitter, Inc. and contributors.`

## Estado actual

El proyecto ya incluye:

- app jugable publicada
- juegos y desafios
- persistencia local por estudiante
- album de stickers con bloqueados/desbloqueados
- historial y reportes
- configuracion persistente
- soporte de pantalla completa

## Proximas ideas

- nuevos minijuegos
- progresion por niveles
- reportes mas detallados por tabla
- nuevas familias de stickers
- desafios semanales
