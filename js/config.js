// Dónde se guardan las respuestas. Son los dos datos PÚBLICOS de Supabase (la
// dirección del proyecto y la clave publicable): los mismos que ya lleva
// cualquier navegador que abre bastia.es. Con ellos solo se puede llamar a las
// funciones que la base de datos abre a visitantes (encuesta_responder y
// encuesta_baja); no dan acceso de lectura a nada.
window.ENCUESTA_CONFIG = {
  url: "https://npybixlfkaavlonsqnka.supabase.co",
  key: "sb_publishable_8Wy8cxTSv4ZKrGgld60nsQ_EhNXMZcM",
};
