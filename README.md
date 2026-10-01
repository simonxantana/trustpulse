# trustpulse.es

La encuesta del teléfono para clínicas veterinarias pequeñas: seis preguntas
de tocar y, al terminar, «vuestra cuenta». Sitio estático (HTML, CSS y un
guion), alojado en GitHub Pages con el dominio trustpulse.es.

Es una encuesta, no un anuncio, y el sitio lo cumple a rajatabla: sin
logotipo, sin marca comercial, sin enlaces a ninguna web de producto. La
cabecera solo dice «Encuesta del teléfono» y el único contacto es
`simon@encuesta.trustpulse.es`. La única mención al servicio es la casilla del final
de la cuenta («¿Queréis que os lo enseñe?»): quien la marca está pidiendo que
se le llame o se le escriba, y la base de datos guarda la fecha y la hora de
ese toque. Solo a esa clínica se le enseña, en la pantalla de gracias, el
número de la clínica de prueba para oír el servicio al momento.

- `/?c=CODIGO&r=1|2|3` — la encuesta. El código identifica a la clínica y `r`
  es la primera respuesta, que ya viene tocada desde el correo. Sin código la
  encuesta funciona igual, pero no guarda nada.
- `/baja/?c=CODIGO` — no recibir más correos (vale para el buzón entero).
- `/privacidad/` — quién es el responsable, de dónde sale la dirección de la
  clínica, qué se guarda y cómo pedir la baja. Página estática sin JavaScript.
- `404.html` es una copia de la portada: GitHub Pages la sirve en cualquier
  ruta que no exista, así que un enlace mal copiado sigue abriendo la encuesta.

Las respuestas se guardan en la base de datos del proyecto (Supabase) con las
funciones `encuesta_responder` y `encuesta_baja`. `js/config.js` lleva solo
la dirección y la clave publicable, que son públicas por diseño.

Para verlo en local, desde esta carpeta: `python -m http.server 8765` y abrir
`http://localhost:8765/?c=abcdefghijkl&r=1` (el guardado fallará sin un código
real; el resto funciona igual).
