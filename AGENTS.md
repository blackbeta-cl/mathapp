# AGENTS.md

## Proposito

Este archivo entrega contexto rapido para agentes y colaboradores que trabajen en este repositorio.

## Resumen del proyecto

- Aplicacion educativa infantil para practicar tablas de multiplicar
- Publicacion estatica en GitHub Pages
- Persistencia completamente local en navegador
- Logica principal concentrada en `src\App.tsx`

## Comandos importantes

```bash
npm run dev
npm run build
npm run lint
```

## Reglas practicas del repo

1. Mantener compatibilidad con GitHub Pages.
2. No introducir dependencias de backend para funcionalidades centrales.
3. Usar `localStorage` para configuracion, historial y datos del estudiante.
4. Si tocas stickers, actualizar:
   - catalogo de stickers
   - vista de bloqueados/desbloqueados
   - historial de premios
   - banner de recompensa final
5. Si cambias la logica de recompensas, preservar la ponderacion por dificultad.
6. No romper la experiencia movil: el drawer de stickers es full width en movil y 50% en tablet/desktop.

## Zonas clave del codigo

- `src\App.tsx`
  - tipos y constantes
  - creacion de sesiones
  - configuracion persistente
  - historial por estudiante
  - calculo de recompensas ponderadas
  - layout principal, drawer y album
- `src\App.css`
  - estilos del shell
  - drawer lateral
  - pantalla de juego
  - album de stickers
- `public\stickers\`
  - SVG ya listos para el album
- `svgs\`
  - fuente local adicional de SVG aportados por el usuario

## Persistencia

Claves de `localStorage` en uso:

- `mathapp-multiplication-history-v1`
- `mathapp-multiplication-settings-v1`
- `mathapp-student-name-v1`

## Recompensas y stickers

- El desbloqueo exige 90% o mas de precision ponderada
- El sticker depende de la tabla dominante de la sesion
- Puede haber duplicados del mismo sticker
- El album debe mostrar cantidad acumulada (`xN`) cuando corresponda
- La coleccion completa incluye stickers ganados y no ganados

## Assets externos

- Parte de los stickers adicionales usan Twemoji
- Si agregas mas assets externos, deja trazabilidad de origen y licencia
- Evita integrar contenido con copyright dudoso o no verificable

## Convenciones recomendadas

- Cambios pequenos y coherentes
- Mantener texto de UI en espanol
- Seguir la estetica infantil y amigable existente
- Reusar helpers antes de duplicar logica

## Verificacion esperada

Antes de cerrar cambios de codigo:

```bash
npm run build
npm run lint
```
