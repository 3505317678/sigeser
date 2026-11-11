from django.contrib.auth import password_validation
from rest_framework import serializers

from .models import Permiso, Rol, Usuario


class PermisoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permiso
        fields = ["id", "codigo", "descripcion"]


class RolSerializer(serializers.ModelSerializer):
    permisos = serializers.SlugRelatedField(slug_field="codigo", many=True, queryset=Permiso.objects.all())
    total_usuarios = serializers.IntegerField(source="usuarios.count", read_only=True)

    class Meta:
        model = Rol
        fields = ["id", "nombre", "descripcion", "permisos", "total_usuarios"]

    PERMISO_CRITICO = "usuarios.gestionar"

    def validate_permisos(self, permisos):
        """Evita dejar el sistema sin nadie que pueda gestionar usuarios (bloqueo administrativo)."""
        rol = self.instance
        if rol is None or any(p.codigo == self.PERMISO_CRITICO for p in permisos):
            return permisos
        if not rol.permisos.filter(codigo=self.PERMISO_CRITICO).exists():
            return permisos
        otros = Usuario.objects.filter(activo=True, rol__permisos__codigo=self.PERMISO_CRITICO).exclude(rol=rol)
        if not otros.exists():
            raise serializers.ValidationError(
                "No se puede quitar la gestión de usuarios a este rol: ningún otro usuario activo podría administrar el sistema.")
        return permisos


class PerfilSerializer(serializers.ModelSerializer):
    rol = serializers.CharField(source="rol.nombre")
    permisos = serializers.SerializerMethodField()
    tecnico_id = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = ["id", "nombre_completo", "correo", "rol", "permisos", "tecnico_id", "last_login"]

    def get_permisos(self, obj) -> list[str]:
        return sorted(obj.permisos())

    def get_tecnico_id(self, obj) -> int | None:
        return obj.tecnico.pk if hasattr(obj, "tecnico") else None


class LoginSerializer(serializers.Serializer):
    correo = serializers.EmailField(max_length=254)
    contrasena = serializers.CharField(max_length=128, trim_whitespace=False)


class CambioContrasenaSerializer(serializers.Serializer):
    contrasena_actual = serializers.CharField(trim_whitespace=False)
    contrasena_nueva = serializers.CharField(trim_whitespace=False, min_length=12, max_length=128)

    def validate(self, attrs):
        usuario = self.context["request"].user
        if not usuario.check_password(attrs["contrasena_actual"]):
            raise serializers.ValidationError({"contrasena_actual": "La contraseña actual no es correcta."})
        password_validation.validate_password(attrs["contrasena_nueva"], usuario)
        return attrs


class UsuarioSerializer(serializers.ModelSerializer):
    rol = serializers.PrimaryKeyRelatedField(queryset=Rol.objects.all())
    rol_nombre = serializers.CharField(source="rol.nombre", read_only=True)
    contrasena = serializers.CharField(write_only=True, required=False, min_length=12, max_length=128, trim_whitespace=False)
    es_tecnico = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = ["id", "nombre_completo", "correo", "rol", "rol_nombre", "activo", "es_tecnico",
                  "bloqueado_hasta", "last_login", "creado_en", "contrasena"]
        read_only_fields = ["activo", "bloqueado_hasta", "last_login", "creado_en"]

    def get_es_tecnico(self, obj) -> bool:
        return hasattr(obj, "tecnico")

    def validate_correo(self, value):
        return value.lower()

    def validate(self, attrs):
        if self.instance is None and not attrs.get("contrasena"):
            raise serializers.ValidationError({"contrasena": "La contraseña inicial es obligatoria."})
        if attrs.get("contrasena"):
            candidato = Usuario(correo=attrs.get("correo", getattr(self.instance, "correo", "")),
                                nombre_completo=attrs.get("nombre_completo", getattr(self.instance, "nombre_completo", "")))
            password_validation.validate_password(attrs["contrasena"], candidato)
        return attrs

    def create(self, validated):
        contrasena = validated.pop("contrasena")
        return Usuario.objects.create_user(password=contrasena, **validated)

    def update(self, instance, validated):
        contrasena = validated.pop("contrasena", None)
        for campo, valor in validated.items():
            setattr(instance, campo, valor)
        if contrasena:
            instance.set_password(contrasena)
        instance.save()
        return instance
