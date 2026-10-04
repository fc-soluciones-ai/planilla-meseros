# Planilla de meseros

App para celular donde la dueña del restaurante marca, cada semana, qué días trabajó cada mesero
y a qué hora entró cuando no hizo el día completo. Con eso se reparten las propinas.

## Reglas

1. **La propina corre desde la hora de entrada.** Quien entró a las 15:00 no recibe de lo facturado antes.
2. **La madrugada pertenece al turno anterior.** El turno va de la hora de apertura (07:00) a la hora
   de corte del día siguiente (06:00). Una factura del domingo 01:25 suma al sábado.

Las dos horas se cambian en la pestaña **Propinas**. La lógica está en `src/lib/turnos.ts`.

## Tecnología

- Next.js 16 (App Router, Server Actions) desplegado en Vercel
- Postgres en Neon, conectado desde Vercel → Storage
- Acceso con una contraseña (`APP_PASSWORD`), sesión de 90 días en el celular

## Puesta en marcha en Vercel

1. En Vercel: **Add New → Project** e importe este repositorio de GitHub.
2. En el proyecto: **Storage → Create Database → Neon (Postgres)** y conéctela al proyecto.
   Vercel crea `DATABASE_URL` sola.
3. En **Settings → Environment Variables** agregue:
   - `APP_PASSWORD`: la contraseña de la dueña
   - `RESTAURANT_TZ`: `America/Costa_Rica` (u otra zona horaria)
4. **Deployments → Redeploy** para que tome las variables nuevas.

Las tablas se crean solas la primera vez que se abre la app. Si falta alguna variable,
la app lo dice en pantalla en lugar de mostrar un error.

## Desarrollo local

```bash
npm install
vercel env pull .env.local   # o copie .env.example a .env.local y complete
npm run dev
```

## Base de datos

| Tabla | Qué guarda |
|---|---|
| `staff` | Personas: nombre, tipo (fijo, ocasional, propietario) y días libres habituales |
| `shifts` | Un registro por persona y día trabajado: completo o desde una hora. Un día libre no tiene registro |
| `settings` | Hora de apertura y hora de corte |

El esquema está en `src/lib/schema.ts`.

## Pendiente

- Importar el archivo de propinas del sistema de facturación.
- Calcular el reparto como lo hace hoy el Excel de planilla.
