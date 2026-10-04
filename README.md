# Planilla de meseros

App para celular donde la dueña del restaurante marca, cada semana, qué días trabajó cada mesero
y a qué hora entró cuando no hizo el día completo. Con eso se reparten las propinas.

## Reglas

Así se reparte la propina de cada día (método de la dueña):

1. Se toma `PROPINA_TOTAL` de cada cuenta del archivo de ventas.
2. **Día = todo el día + la madrugada siguiente hasta antes de las 5:00 a. m.** Una cuenta del lunes
   a la 01:25 suma al domingo.
3. Se suma y se divide entre los meseros que trabajaron ese día.
4. **Quien entra tarde** recibe solo de las propinas facturadas desde su hora de entrada.
   Si todos hicieron el día completo, el resultado es igual a dividir el total entre todos.

Las dos horas se cambian en la pestaña **Propinas**. La lógica está en `src/lib/turnos.ts`.

## Tecnología

- Next.js 16 (App Router, Server Actions) desplegado en Vercel
- Postgres en Neon, conectado desde Vercel → Storage
- Acceso con usuario y contraseña, sesión de 90 días en el celular
  - `admin` + `APP_PASSWORD` (variable de Vercel) siempre puede entrar
  - Los demás usuarios se crean en **Configuración**. Cambiar `APP_PASSWORD` cierra todas las sesiones

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
| `staff` | Personas: nombre, tipo, días libres habituales, salario por día y nombre en el sistema |
| `shifts` | Un registro por persona y día trabajado: completo o desde una hora. Un día libre no tiene registro |
| `tickets` | Cuentas con propina del archivo de ventas (una por folio) |
| `users` | Usuarios que pueden entrar (contraseña cifrada con scrypt) |
| `settings` | Hora de apertura, hora de corte y códigos compartidos |

El esquema está en `src/lib/schema.ts`.

## Uso semanal

1. Durante la semana, en **Meseros**, se marca quién trabajó cada día y la hora de entrada de quien llegó tarde.
2. Se exporta del sistema el reporte **Cuentas con propina** de **lunes a lunes** y se sube en **Propinas**.
   Se toma la columna `PROPINA_TOTAL`. Volver a subir un archivo no duplica nada: cada cuenta se identifica por su folio.
3. La app muestra la propina por día, los avisos para revisar y la planilla. Tocando a una persona se ve su
   boleta (salario + propina por día) y se puede enviar por WhatsApp.

Cada persona tiene su **salario por día** (₡15,000 por defecto) y, si en el sistema aparece con otro nombre
(ej. "SHAI"), su **nombre en el sistema** para cruzar las cuentas.
