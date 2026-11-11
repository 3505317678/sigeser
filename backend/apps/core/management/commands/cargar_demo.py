"""Carga datos de demostración realistas recorriendo el flujo real de las órdenes (servicios de dominio)."""
import os
import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.clientes.models import Cliente, Equipo
from apps.core.models import RegistroAuditoria
from apps.inventario import servicios as inv
from apps.inventario.models import MovimientoInventario, Repuesto, RepuestoUtilizado, TipoMovimiento
from apps.ordenes import servicios as srv
from apps.ordenes.models import EstadoOrden as E
from apps.ordenes.models import HistorialEstado, OrdenServicio
from apps.reparacion.models import ActividadReparacion, Diagnostico
from apps.tecnicos.models import Tecnico
from apps.usuarios.models import Rol, Usuario

PERSONAL = [
    ("recepcion@sigeser.local", "Laura Gómez Pardo", "Recepcionista", None),
    ("carlos.rodriguez@sigeser.local", "Carlos Rodríguez León", "Técnico", "Computadores y portátiles"),
    ("andrea.martinez@sigeser.local", "Andrea Martínez Ríos", "Técnico", "Celulares y tabletas"),
    ("julian.herrera@sigeser.local", "Julián Herrera Castro", "Técnico", "Impresoras y redes"),
]

REPUESTOS = [
    ("SSD-480", "Unidad SSD 480 GB SATA", "Almacenamiento", 165000, 12, 4),
    ("SSD-1TB", "Unidad SSD 1 TB NVMe", "Almacenamiento", 310000, 6, 2),
    ("RAM-8D4", "Memoria RAM 8 GB DDR4", "Memoria", 120000, 15, 5),
    ("RAM-16D4", "Memoria RAM 16 GB DDR4", "Memoria", 210000, 4, 3),
    ("BAT-LEN", "Batería para portátil Lenovo", "Baterías", 185000, 5, 2),
    ("BAT-CEL", "Batería para celular gama media", "Baterías", 75000, 14, 5),
    ("PAN-156", "Pantalla LED 15,6 pulgadas", "Pantallas", 380000, 3, 2),
    ("PAN-CEL", "Pantalla táctil para celular", "Pantallas", 240000, 7, 3),
    ("PIN-CAR", "Pin de carga USB-C", "Conectores", 25000, 30, 10),
    ("TEC-PORT", "Teclado para portátil en español", "Periféricos", 95000, 6, 2),
    ("VEN-PORT", "Ventilador para portátil", "Refrigeración", 60000, 8, 3),
    ("PAS-TER", "Pasta térmica 4 g", "Refrigeración", 18000, 25, 8),
    ("FUE-650", "Fuente de poder 650 W", "Energía", 260000, 2, 2),
    ("CAR-65W", "Cargador para portátil 65 W", "Energía", 110000, 9, 3),
    ("TON-HP", "Tóner para impresora HP 85A", "Impresión", 145000, 4, 2),
    ("ROD-IMP", "Rodillo de arrastre para impresora", "Impresión", 55000, 1, 2),
]

NOMBRES = ["María Fernanda Castillo", "José Luis Ramírez", "Diana Patricia Moreno", "Andrés Felipe Ruiz",
           "Sandra Milena Torres", "Luis Eduardo Vargas", "Paola Andrea Suárez", "Jorge Iván Ortiz",
           "Claudia Marcela Rojas", "Héctor Fabio Mejía", "Natalia Gutiérrez", "Óscar Javier Peña",
           "Ferretería El Llanero S.A.S.", "Colegio Los Centauros", "Juliana Cárdenas", "Ricardo Alfonso Díaz",
           "Valentina Ospina", "Camilo Andrés Beltrán", "Droguería La Esperanza", "Martha Lucía Arango"]

EQUIPOS = [
    ("Portátil", "Lenovo", "IdeaPad 3", "No enciende; el cargador muestra luz", "computadores"),
    ("Portátil", "HP", "Pavilion 15", "Se calienta y se apaga solo", "computadores"),
    ("Portátil", "Asus", "VivoBook 14", "Muy lento al iniciar Windows", "computadores"),
    ("Computador de escritorio", "Dell", "OptiPlex 3080", "No da video al encender", "computadores"),
    ("Celular", "Samsung", "Galaxy A54", "Pantalla rota después de una caída", "celulares"),
    ("Celular", "Xiaomi", "Redmi Note 12", "No carga; hay que mover el cable", "celulares"),
    ("Tableta", "Apple", "iPad 9", "La batería dura menos de una hora", "celulares"),
    ("Impresora", "HP", "LaserJet Pro M402", "Atasca el papel en cada impresión", "impresoras"),
    ("Impresora", "Epson", "L3250", "Imprime con rayas", "impresoras"),
]

SOLUCION = {
    "computadores": [("Falla en la unidad de almacenamiento", "Reemplazar el disco por una SSD y reinstalar el sistema", ["SSD-480"], 90000),
                     ("Ventilador obstruido y pasta térmica seca", "Limpieza interna, cambio de ventilador y pasta térmica", ["VEN-PORT", "PAS-TER"], 70000),
                     ("Memoria insuficiente para el uso actual", "Ampliar la memoria RAM a 16 GB", ["RAM-8D4"], 50000),
                     ("Puerto de carga dañado", "Cambiar el cargador y revisar el circuito de carga", ["CAR-65W"], 60000)],
    "celulares": [("Pantalla y táctil fracturados", "Reemplazar el módulo de pantalla", ["PAN-CEL"], 80000),
                  ("Pin de carga desgastado", "Cambiar el pin de carga USB-C", ["PIN-CAR"], 45000),
                  ("Batería degradada al 61 %", "Reemplazar la batería", ["BAT-CEL"], 40000)],
    "impresoras": [("Rodillo de arrastre gastado", "Reemplazar el rodillo y limpiar el recorrido del papel", ["ROD-IMP"], 50000),
                   ("Cabezal obstruido", "Limpieza profunda del cabezal y purga de tinta", [], 65000)],
}


class Command(BaseCommand):
    help = "Carga datos de demostración (usuarios por rol, clientes, inventario y órdenes en todos los estados)."

    def add_arguments(self, parser):
        parser.add_argument("--ordenes", type=int, default=70)
        parser.add_argument("--forzar", action="store_true", help="Cargar aunque ya existan órdenes")

    def handle(self, *args, **opts):
        contrasena = os.environ.get("SIGESER_DEMO_CONTRASENA")
        if not contrasena or len(contrasena) < 12:
            raise CommandError("Defina SIGESER_DEMO_CONTRASENA (mínimo 12 caracteres) para los usuarios de demostración.")
        if OrdenServicio.objects.exists() and not opts["forzar"]:
            self.stdout.write("Ya hay órdenes registradas: no se cargan datos de demostración.")
            return
        admin = Usuario.objects.filter(rol__nombre="Administrador").first()
        if not admin:
            raise CommandError("Primero cree el administrador (python manage.py crear_admin).")
        # Semilla fija para que la demo sea reproducible; no se usa con fines criptográficos.
        self.rng = random.Random(2026)  # nosec B311
        with transaction.atomic():
            self._personal(contrasena)
            self._inventario(admin)
            clientes = self._clientes()
            self._ordenes(clientes, opts["ordenes"])
        self.stdout.write(self.style.SUCCESS(
            f"Demo cargada: {Cliente.objects.count()} clientes, {Repuesto.objects.count()} repuestos, "
            f"{OrdenServicio.objects.count()} órdenes."))

    def _personal(self, contrasena):
        self.recepcion = None
        self.tecnicos = {}
        for correo, nombre, rol, especialidad in PERSONAL:
            u = Usuario.objects.filter(correo=correo).first() or Usuario.objects.create_user(
                correo, nombre, Rol.objects.get(nombre=rol), contrasena)
            if rol == "Recepcionista":
                self.recepcion = u
            else:
                t, _ = Tecnico.objects.get_or_create(usuario=u, defaults={"especialidad": especialidad,
                                                                           "telefono": f"310{self.rng.randint(1000000, 9999999)}"})
                clave = {"Computadores y portátiles": "computadores", "Celulares y tabletas": "celulares"}.get(especialidad, "impresoras")
                self.tecnicos[clave] = t

    def _inventario(self, admin):
        for codigo, nombre, cat, precio, stock, minimo in REPUESTOS:
            r, creado = Repuesto.objects.get_or_create(codigo=codigo, defaults={
                "nombre": nombre, "categoria": cat, "precio_unitario": Decimal(precio), "stock_minimo": minimo})
            if creado:
                inv.registrar_movimiento(r.pk, TipoMovimiento.ENTRADA, stock + 6, admin, "Inventario inicial")

    def _clientes(self):
        clientes = []
        for i, nombre in enumerate(NOMBRES):
            es_empresa = "S.A.S." in nombre or "Colegio" in nombre or "Droguería" in nombre
            c, _ = Cliente.objects.get_or_create(
                tipo_documento="NIT" if es_empresa else "CC", numero_documento=str(900100200 + i * 37 if es_empresa else 40100200 + i * 7919),
                defaults={"nombre": nombre, "telefono": f"3{self.rng.randint(10, 23)}{self.rng.randint(1000000, 9999999)}",
                          "correo": f"cliente{i + 1}@correo-demo.co", "direccion": f"Calle {self.rng.randint(1, 45)} # {self.rng.randint(1, 40)}-{self.rng.randint(1, 99)}, Villavicencio",
                          "autoriza_datos": True, "fecha_autorizacion": timezone.now()})
            clientes.append(c)
        return clientes

    def _ordenes(self, clientes, total):
        # Distribución de estados finales para que el dashboard y los reportes tengan datos de todos los casos.
        # Se mezcla antes de recortar para que, con pocas órdenes, sigan apareciendo todos los estados.
        en_curso = ([E.LISTA_PARA_ENTREGA] * 4 + [E.EN_VERIFICACION] * 3 + [E.EN_REPARACION] * 5 +
                    [E.EN_ESPERA_REPUESTOS] * 3 + [E.PENDIENTE_APROBACION] * 3 + [E.EN_DIAGNOSTICO] * 2 +
                    [E.RECIBIDA] * 4 + [E.CANCELADA] * 2)
        plan = en_curso + [E.ENTREGADA] * max(total - len(en_curso), int(total * 0.55))
        self.rng.shuffle(plan)
        plan = plan[:total]
        ahora = timezone.now()
        for i, destino in enumerate(plan):
            cerrada = destino in (E.ENTREGADA, E.CANCELADA)
            dias_atras = self.rng.randint(1, 60) if cerrada else self.rng.randint(0, 12)
            inicio = ahora - timedelta(days=dias_atras, hours=self.rng.randint(0, 8))
            self._una_orden(self.rng.choice(clientes), destino, inicio, rechazada=(destino == E.ENTREGADA and i % 13 == 0))

    def _una_orden(self, cliente, destino, inicio, rechazada=False):
        tipo, marca, modelo, falla, area = self.rng.choice(EQUIPOS)
        equipo = cliente.equipos.filter(marca=marca, modelo=modelo).first() or Equipo.objects.create(
            cliente=cliente, tipo=tipo, marca=marca, modelo=modelo, serial=f"SN{self.rng.randint(10**7, 10**8 - 1)}")
        tecnico = self.tecnicos[area]
        rec, tec_u = self.recepcion, tecnico.usuario
        estimada = (inicio + timedelta(days=self.rng.randint(2, 6))).date()
        orden = srv.crear_orden({"cliente": cliente, "equipo": equipo, "falla_reportada": falla,
                                 "accesorios": self.rng.choice(["Cargador", "Ninguno", "Estuche y cargador", "Cable USB"]),
                                 "estado_fisico": self.rng.choice(["Rayones leves en la carcasa", "Buen estado", "Golpe en una esquina"]),
                                 "prioridad": self.rng.choice(["BAJA", "MEDIA", "MEDIA", "ALTA"]),
                                 "fecha_estimada_entrega": None}, rec)
        orden.fecha_estimada_entrega = estimada
        orden.save(update_fields=["fecha_estimada_entrega"])
        pasos = [inicio]

        def paso(horas):
            pasos.append(pasos[-1] + timedelta(hours=horas))

        if destino == E.CANCELADA:
            srv.cancelar(orden, "El cliente retiró el equipo antes del diagnóstico", rec)
            paso(5)
            return self._fechar(orden, pasos)
        if destino == E.RECIBIDA:
            if self.rng.random() < 0.7:
                srv.asignar_tecnico(orden, tecnico, rec)
            return self._fechar(orden, pasos)
        srv.asignar_tecnico(orden, tecnico, rec)
        srv.iniciar_diagnostico(orden, tec_u)
        paso(self.rng.randint(2, 20))
        if destino == E.EN_DIAGNOSTICO:
            return self._fechar(orden, pasos)
        causa, solucion, codigos, mano_obra = self.rng.choice(SOLUCION[area])
        srv.registrar_diagnostico(orden, {"descripcion": f"Revisión técnica: {causa.lower()}.", "causa_probable": causa,
                                          "solucion_propuesta": solucion, "costo_estimado": Decimal(mano_obra)}, tec_u)
        paso(self.rng.randint(1, 6))
        if destino == E.PENDIENTE_APROBACION:
            return self._fechar(orden, pasos)
        if rechazada:
            srv.registrar_aprobacion(orden, False, rec, "El cliente decidió no reparar por el costo")
            paso(self.rng.randint(4, 30))
            srv.registrar_entrega(orden, cliente.nombre, rec)
            paso(1)
            return self._fechar(orden, pasos)
        espera = destino == E.EN_ESPERA_REPUESTOS
        srv.registrar_aprobacion(orden, True, rec, esperar_repuestos=espera)
        paso(self.rng.randint(2, 24))
        if espera:
            return self._fechar(orden, pasos)
        srv.registrar_actividad(orden, {"descripcion": f"Desarme y {solucion[0].lower() + solucion[1:]}",
                                        "horas_empleadas": Decimal(self.rng.choice(["1.5", "2", "2.5", "3", "4"]))}, tec_u)
        for codigo in codigos:
            rep = Repuesto.objects.get(codigo=codigo)
            if rep.stock_actual > 0:
                srv.agregar_repuesto(orden, rep.pk, 1, tec_u)
        paso(self.rng.randint(3, 30))
        if destino == E.EN_REPARACION:
            return self._fechar(orden, pasos)
        srv.registrar_actividad(orden, {"descripcion": "Pruebas de funcionamiento y limpieza final",
                                        "horas_empleadas": Decimal("0.5")}, tec_u)
        srv.enviar_a_verificacion(orden, tec_u)
        paso(self.rng.randint(1, 8))
        if destino == E.EN_VERIFICACION:
            return self._fechar(orden, pasos)
        srv.verificar(orden, True, tec_u, "Funciona correctamente")
        paso(self.rng.randint(4, 48))
        if destino == E.LISTA_PARA_ENTREGA:
            return self._fechar(orden, pasos)
        srv.registrar_entrega(orden, cliente.nombre, rec)
        paso(1)
        return self._fechar(orden, pasos)

    def _fechar(self, orden, pasos):
        """Ubica en el pasado las fechas de la orden simulada, conservando el orden de los hechos."""
        orden.refresh_from_db(fields=["estado"])
        historial = list(HistorialEstado.objects.filter(orden=orden).order_by("id"))
        for k, h in enumerate(historial):
            h.fecha = pasos[min(k, len(pasos) - 1)] if k < len(pasos) else pasos[-1]
            HistorialEstado.objects.filter(pk=h.pk).update(fecha=h.fecha)
        ultimo = historial[-1].fecha if historial else pasos[0]
        campos = {"fecha_recepcion": pasos[0]}
        if orden.estado == E.ENTREGADA:
            campos["fecha_entrega"] = ultimo
        OrdenServicio.objects.filter(pk=orden.pk).update(**campos)
        Diagnostico.objects.filter(orden=orden).update(fecha=pasos[min(2, len(pasos) - 1)],
                                                        fecha_respuesta=pasos[min(3, len(pasos) - 1)] if len(pasos) > 3 else None)
        ActividadReparacion.objects.filter(orden=orden).update(fecha_inicio=pasos[min(3, len(pasos) - 1)])
        RepuestoUtilizado.objects.filter(orden=orden).update(fecha=pasos[min(3, len(pasos) - 1)])
        MovimientoInventario.objects.filter(orden=orden).update(fecha=pasos[min(3, len(pasos) - 1)])
        RegistroAuditoria.objects.filter(entidad="orden", entidad_id=orden.pk).update(fecha=ultimo)
