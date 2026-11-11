# SIGESER: interfaz web

SPA en React 19 + TypeScript con Vite. La instalación, el despliegue y las pruebas se describen en el [README principal](../README.md).

| Comando | Uso |
|---|---|
| `npm ci` | Instala las dependencias exactas de `package-lock.json` |
| `npm run dev` | Servidor de desarrollo en http://localhost:8080 (reenvía `/api` al backend en el puerto 8001) |
| `npm test` | Pruebas con Vitest y Testing Library |
| `npm run build` | Compilación de producción en `dist/` |
| `npm run tipos` | Regenera los tipos TypeScript desde `src/api/openapi.yaml` |
