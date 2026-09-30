# trustpulse.es

La encuesta de Bastia para clínicas veterinarias: seis preguntas de tocar y, al
terminar, «vuestra cuenta». Sitio estático (HTML, CSS y un guion), alojado en
GitHub Pages con el dominio trustpulse.es.

- `/?c=CODIGO&r=1|2|3` — la encuesta. El código identifica a la clínica y `r`
  es la primera respuesta, que ya viene tocada desde el correo.
- `/baja/?c=CODIGO` — no recibir más correos.

Las respuestas se guardan en la base de datos de Bastia (Supabase) con las
funciones `encuesta_responder` y `encuesta_baja`. `js/config.js` lleva solo
la dirección y la clave publicable, que son públicas por diseño.
