
import argparse
import asyncio
import csv
import json
import os
import random
import statistics
import time
from datetime import date, timedelta
from pathlib import Path

import httpx

UMBRAL_MS = 2000
PERCENTIL_OBJETIVO = 95


def percentil(valores, p):
    if not valores:
        return None
    ordenados = sorted(valores)
    k = (len(ordenados) - 1) * p / 100
    i, f = int(k), min(int(k) + 1, len(ordenados) - 1)
    return ordenados[i] + (ordenados[f] - ordenados[i]) * (k - i)


async def iniciar_sesion(url, correo, contrasena):
    cliente = httpx.AsyncClient(base_url=url, timeout=30)
    await cliente.get("/api/v1/auth/csrf")
    r = await cliente.post("/api/v1/auth/login", json={"correo": correo, "contrasena": contrasena},
                           headers={"X-CSRFToken": cliente.cookies.get("sigeser_csrf", "")})
    r.raise_for_status()
    return cliente


async def muestras(cliente, ruta, campo, paginas=3, **params):
    valores = []
    for pagina in range(1, paginas + 1):
        r = await cliente.get(ruta, params={"page": pagina, "tamano": 100, **params})
        if r.status_code != 200:
            break
        valores += [o[campo] for o in r.json()["results"]]
    return valores


def operaciones(rol, datos):
    """Devuelve una función que elige la siguiente operación (nombre, ruta, parámetros) según el rol."""
    hoy = date.today()
    periodo = {"desde": (hoy - timedelta(days=29)).isoformat(), "hasta": hoy.isoformat()}
    trimestre = {"desde": (hoy - timedelta(days=89)).isoformat(), "hasta": hoy.isoformat()}

    if rol == "administrador":
        mezcla = [
            (30, lambda: ("panel", "/api/v1/reportes/dashboard", {})),
            (15, lambda: ("reporte 30 días", "/api/v1/reportes/periodo", periodo)),
            (5, lambda: ("reporte 90 días", "/api/v1/reportes/periodo", trimestre)),
            (25, lambda: ("listado de órdenes", "/api/v1/ordenes", {"page": random.randint(1, 50)})),
            (25, lambda: ("detalle de orden", f"/api/v1/ordenes/{random.choice(datos['ordenes'])}", {})),
        ]
    elif rol == "recepcion":
        mezcla = [
            (25, lambda: ("órdenes activas", "/api/v1/ordenes", {"activas": "true", "ordering": "fecha_estimada_entrega"})),
            (25, lambda: ("búsqueda de órdenes", "/api/v1/ordenes", {"search": random.choice(datos["terminos"])})),
            (25, lambda: ("detalle de orden", f"/api/v1/ordenes/{random.choice(datos['ordenes'])}", {})),
            (25, lambda: ("búsqueda de clientes", "/api/v1/clientes", {"search": random.choice(datos["terminos"])})),
        ]
    else:
        mezcla = [
            (40, lambda: ("mis órdenes", "/api/v1/ordenes", {"activas": "true"})),
            (40, lambda: ("detalle de orden", f"/api/v1/ordenes/{random.choice(datos['ordenes_tecnico'])}", {})),
            (20, lambda: ("inventario", "/api/v1/repuestos", {"activo": "true", "tamano": 100})),
        ]
    pesos = [p for p, _ in mezcla]
    funciones = [f for _, f in mezcla]
    return lambda: random.choices(funciones, weights=pesos)[0]()


async def usuario_virtual(sesion, siguiente, fin, registros):
    while time.monotonic() < fin:
        nombre, ruta, params = siguiente()
        inicio = time.perf_counter()
        try:
            r = await sesion.get(ruta, params=params)
            estado = r.status_code
        except httpx.HTTPError:
            estado = 0
        registros.append((time.time(), nombre, estado, (time.perf_counter() - inicio) * 1000))
        await asyncio.sleep(random.uniform(0.3, 1.0))


async def principal(args):
    clave_admin = os.environ.get("SIGESER_ADMIN_CONTRASENA")
    clave_demo = os.environ.get("SIGESER_DEMO_CONTRASENA")
    if not clave_admin or not clave_demo:
        raise SystemExit("Defina SIGESER_ADMIN_CONTRASENA y SIGESER_DEMO_CONTRASENA en el entorno.")
    random.seed(2026)

    sesiones = {
        "administrador": await iniciar_sesion(args.url, os.environ.get("SIGESER_ADMIN_CORREO", "admin@sigeser.local"), clave_admin),
        "recepcion": await iniciar_sesion(args.url, "recepcion@sigeser.local", clave_demo),
        "tecnico": await iniciar_sesion(args.url, "carlos.rodriguez@sigeser.local", clave_demo),
    }
    total = (await sesiones["administrador"].get("/api/v1/ordenes", params={"tamano": 1})).json()["count"]
    datos = {
        "ordenes": await muestras(sesiones["administrador"], "/api/v1/ordenes", "id", paginas=5, ordering="?"),
        "ordenes_tecnico": await muestras(sesiones["tecnico"], "/api/v1/ordenes", "id", paginas=1),
        "terminos": [n.split()[0] for n in await muestras(sesiones["recepcion"], "/api/v1/clientes", "nombre", paginas=2)]
        + ["OS-2026", "Lenovo", "SN", "3101"],
    }
    roles = ["administrador", "recepcion", "tecnico"]
    print(f"Órdenes en la base: {total}. Usuarios virtuales: {args.usuarios}. Duración: {args.duracion} s.")

    registros = []
    fin = time.monotonic() + args.duracion
    inicio = time.time()
    tareas = [usuario_virtual(sesiones[roles[i % 3]], operaciones(roles[i % 3], datos), fin, registros)
              for i in range(args.usuarios)]
    await asyncio.gather(*tareas)
    duracion = time.time() - inicio
    for s in sesiones.values():
        await s.aclose()

    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    with open(salida / "latencias.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["marca_tiempo", "operacion", "estado_http", "latencia_ms"])
        w.writerows((f"{t:.3f}", n, e, f"{ms:.1f}") for t, n, e, ms in registros)

    def resumen(filas):
        lat = [ms for _, _, _, ms in filas]
        errores = sum(1 for _, _, e, _ in filas if e != 200)
        return {
            "peticiones": len(filas), "errores": errores,
            "p50_ms": round(percentil(lat, 50), 1), "p95_ms": round(percentil(lat, 95), 1),
            "p99_ms": round(percentil(lat, 99), 1), "max_ms": round(max(lat), 1), "media_ms": round(statistics.mean(lat), 1),
            "bajo_umbral_pct": round(100 * sum(1 for x in lat if x <= UMBRAL_MS) / len(lat), 2),
        }

    por_operacion = {}
    for fila in registros:
        por_operacion.setdefault(fila[1], []).append(fila)
    general = resumen(registros)
    cumple = general["bajo_umbral_pct"] >= PERCENTIL_OBJETIVO and general["errores"] / general["peticiones"] < 0.01
    informe = {
        "criterio": f"{PERCENTIL_OBJETIVO} % de las consultas en <= {UMBRAL_MS} ms con {args.usuarios} usuarios concurrentes",
        "ordenes_en_base": total, "usuarios_concurrentes": args.usuarios, "duracion_s": round(duracion, 1),
        "rendimiento_peticiones_por_s": round(len(registros) / duracion, 1),
        "general": general, "cumple_rnf10": cumple,
        "por_operacion": {k: resumen(v) for k, v in sorted(por_operacion.items())},
    }
    (salida / "resumen.json").write_text(json.dumps(informe, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(informe, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    analizador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analizador.add_argument("--url", default="http://localhost:8080")
    analizador.add_argument("--usuarios", type=int, default=15)
    analizador.add_argument("--duracion", type=int, default=120)
    analizador.add_argument("--salida", default="resultados-carga")
    asyncio.run(principal(analizador.parse_args()))
