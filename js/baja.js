/*
 * La baja — trustpulse.es/baja/?c=CODIGO
 *
 * La baja no se hace al abrir la página sino al tocar el botón: los programas
 * de correo abren los enlaces solos para revisarlos, y darían de baja a media
 * lista sin que nadie lo pidiera. Vale para el buzón entero.
 */
(function () {
  "use strict";
  var c = new URLSearchParams(window.location.search).get("c") || "";
  var codigo = /^[a-z0-9]{12}$/.test(c) ? c : "";
  var boton = document.getElementById("boton-baja");
  var fallo = document.getElementById("fallo");
  if (!codigo) { document.getElementById("sin-codigo").hidden = false; return; }
  boton.hidden = false;
  boton.addEventListener("click", function () {
    var config = window.ENCUESTA_CONFIG || {};
    boton.disabled = true; boton.textContent = "Un momento…"; fallo.hidden = true;
    fetch(config.url + "/rest/v1/rpc/encuesta_baja", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.key, Authorization: "Bearer " + config.key },
      body: JSON.stringify({ p_codigo: codigo }),
    }).then(function (r) {
      if (!r.ok) throw new Error("no se pudo dar de baja");
      document.getElementById("pregunta").hidden = true;
      var hecho = document.getElementById("hecho"); hecho.hidden = false;
      hecho.querySelector("h1").focus();
    }).catch(function () {
      boton.disabled = false; boton.textContent = "Darme de baja"; fallo.hidden = false;
    });
  });
})();
