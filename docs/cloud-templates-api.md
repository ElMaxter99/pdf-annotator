# API REST de plantillas en la nube

## Visión general

- **Base URL**: `https://api.pdf-annotator.example.com/api/v1`
- **Versionado**: todas las rutas se versionan con el prefijo `/v1`. Cambios incompatibles crearán nuevas versiones (`/v2`, `/v3`, ...).
- **Formato**: JSON UTF-8. Las marcas de tiempo se serializan en ISO 8601 (`2025-01-10T12:00:00Z`).
- **Autenticación**: Bearer JWT generado por el endpoint de sesión. Todos los endpoints protegidos exigen `Authorization: Bearer <token>`.
- **Seguridad**: los tokens expiran en 15 minutos. Se entrega un `refreshToken` con caducidad de 30 días para renovar la sesión.

## Autenticación

### POST `/auth/sessions`

Inicia una sesión de usuario.

**Request**
```json
{
  "email": "editor@acme.com",
  "password": "StrongPassw0rd!",
  "projectKey": "pdf-annotator"
}
```

**Response** `201 Created`
```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "expiresIn": 900,
  "user": {
    "id": "usr_123",
    "name": "Ana Campos",
    "email": "editor@acme.com",
    "avatarUrl": "https://cdn.example.com/avatars/usr_123.png"
  },
  "workspaces": [
    {
      "id": "wrk_001",
      "name": "Demo",
      "role": "editor"
    }
  ],
  "defaultWorkspaceId": "wrk_001"
}
```

### POST `/auth/refresh`

Renueva el `accessToken` usando un `refreshToken` válido.

**Request**
```json
{ "refreshToken": "jwt-refresh-token" }
```

**Response** `200 OK`
```json
{
  "accessToken": "new-access-token",
  "refreshToken": "new-refresh-token",
  "expiresIn": 900
}
```

### DELETE `/auth/sessions/current`

Revoca la sesión activa. Invalida el `refreshToken` asociado.

**Response** `204 No Content`

## Espacios de trabajo / Proyectos

Los espacios de trabajo representan proyectos colaborativos. Cada plantilla pertenece a un único workspace.

### GET `/workspaces`

Lista los espacios accesibles para el usuario autenticado.

**Response** `200 OK`
```json
[
  {
    "id": "wrk_001",
    "name": "Demo",
    "role": "owner",
    "updatedAt": "2025-01-05T10:15:00Z"
  },
  {
    "id": "wrk_002",
    "name": "Marketing",
    "role": "viewer",
    "updatedAt": "2024-12-18T09:02:00Z"
  }
]
```

### POST `/workspaces`

Crea un nuevo workspace. Solo disponible para usuarios con rol `owner`.

**Request**
```json
{
  "name": "Cliente ACME",
  "slug": "cliente-acme"
}
```

**Response** `201 Created`
```json
{
  "id": "wrk_010",
  "name": "Cliente ACME",
  "slug": "cliente-acme",
  "role": "owner"
}
```

### POST `/workspaces/{workspaceId}/members`

Invita a un miembro utilizando su correo electrónico y rol deseado.

```json
{
  "email": "designer@acme.com",
  "role": "editor"
}
```

## Plantillas de anotación

### Modelo `AnnotationTemplate`

```json
{
  "id": "tpl_001",
  "name": "Facturas",
  "version": 3,
  "workspaceId": "wrk_001",
  "createdAt": "2024-11-30T08:00:00Z",
  "updatedAt": "2025-01-09T17:41:00Z",
  "guidesEnabled": true,
  "guideSettings": {
    "showGrid": true,
    "snapToGrid": true,
    "gridSize": 12
  },
  "pages": [
    {
      "num": 1,
      "fields": [
        {
          "id": "fld_1",
          "type": "text",
          "x": 120,
          "y": 250,
          "width": 320,
          "height": 48,
          "rotation": 0,
          "fontFamily": "Helvetica",
          "fontSize": 14,
          "opacity": 1,
          "textAlign": "left",
          "content": "Nombre del cliente"
        }
      ]
    }
  ]
}
```

### GET `/workspaces/{workspaceId}/templates`

Devuelve todas las plantillas accesibles para el workspace. El servidor siempre devuelve la última versión persistida.

**Response** `200 OK`
```json
[
  { "id": "tpl_001", "name": "Facturas", "version": 3, "workspaceId": "wrk_001", "createdAt": "2024-11-30T08:00:00Z", "updatedAt": "2025-01-09T17:41:00Z", "guidesEnabled": true, "guideSettings": {"showGrid": true, "snapToGrid": true, "gridSize": 12}, "pages": [] }
]
```

### PUT `/workspaces/{workspaceId}/templates/{templateId}`

Crea o sustituye una plantilla. El cliente debe enviar siempre la versión esperada.

**Headers**
- `If-Match: W/"3"` para realizar control de concurrencia optimista (el valor debe coincidir con `version`).

**Request**
```json
{
  "name": "Facturas",
  "version": 3,
  "guidesEnabled": true,
  "guideSettings": {
    "showGrid": true,
    "snapToGrid": true,
    "gridSize": 12
  },
  "pages": [
    {
      "num": 1,
      "fields": []
    }
  ]
}
```

**Response** `200 OK`
```json
{
  "id": "tpl_001",
  "name": "Facturas",
  "version": 4,
  "workspaceId": "wrk_001",
  "createdAt": "2024-11-30T08:00:00Z",
  "updatedAt": "2025-01-09T17:42:10Z",
  "guidesEnabled": true,
  "guideSettings": {
    "showGrid": true,
    "snapToGrid": true,
    "gridSize": 12
  },
  "pages": [
    {
      "num": 1,
      "fields": []
    }
  ]
}
```

Si el `If-Match` no coincide el servidor responderá `409 Conflict` con la versión actual:
```json
{
  "error": "version_conflict",
  "message": "La plantilla fue modificada por otro usuario.",
  "currentVersion": 5
}
```

### DELETE `/workspaces/{workspaceId}/templates/{templateId}`

Elimina la plantilla indicada. Devuelve `204 No Content` si la operación tiene éxito.

### POST `/workspaces/{workspaceId}/templates/{templateId}/versions`

Crea una rama histórica adicional sin afectar a la versión publicada. Útil para auditoría o restauración.

```json
{
  "sourceVersion": 5,
  "label": "Pre-ajustes 2025-01"
}
```

**Response** `201 Created`
```json
{
  "id": "tpl_001:v6",
  "templateId": "tpl_001",
  "version": 6,
  "label": "Pre-ajustes 2025-01",
  "createdAt": "2025-01-10T09:10:00Z"
}
```

### Sincronización en tiempo real (opcional)

Para colaboración simultánea puede abrirse un canal WebSocket en `wss://api.pdf-annotator.example.com/ws/templates`. El cliente debe enviar el token JWT en la query (`?token=...`). Eventos relevantes:

- `template.updated`: notifica cambios en una plantilla (`id`, `workspaceId`, `version`).
- `template.deleted`: notifica eliminaciones.
- `workspace.joined` / `workspace.left`: eventos de miembros.

## Esquema `PageAnnotations`

Un `PageAnnotations` replica el modelo de la app:

```json
{
  "num": 1,
  "fields": [
    {
      "id": "fld_1",
      "type": "text",
      "x": 120,
      "y": 250,
      "width": 320,
      "height": 48,
      "rotation": 0,
      "fontFamily": "Helvetica",
      "fontSize": 14,
      "opacity": 1,
      "textAlign": "left",
      "content": "Nombre del cliente",
      "backgroundColor": "rgba(255,255,255,0)"
    }
  ]
}
```

Los clientes deben enviar la estructura completa para garantizar consistencia entre dispositivos. Cada actualización incrementa el campo `version` en el backend.
