# Etapa 1: compila la SPA de React con las versiones exactas del package-lock.json.
FROM node:22-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Etapa 2: Nginx sirve los archivos estáticos y actúa como proxy inverso de la API.
# La imagen final no contiene Node, el código fuente ni las dependencias de compilación.
FROM nginx:1.30-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/sigeser.conf /etc/nginx/conf.d/sigeser.conf
COPY nginx/cabeceras-seguridad.conf /etc/nginx/snippets/cabeceras-seguridad.conf
COPY nginx/proxy-api.conf /etc/nginx/snippets/proxy-api.conf
COPY --from=compilacion /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=4s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1/salud-web || exit 1
