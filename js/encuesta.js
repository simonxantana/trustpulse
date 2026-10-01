/*
 * La encuesta de trustpulse.es
 *
 * Aquí llega una clínica al tocar una respuesta en el correo
 * (trustpulse.es/?c=CODIGO&r=1). La primera pregunta ya viene contestada;
 * quedan cinco, una por pantalla, de tocar. Al terminar ve «vuestra cuenta»:
 * cuántas citas al mes se le van por el teléfono, con sus propios números.
 *
 * No se pide ningún dato personal ni de clientes. Las respuestas se guardan
 * con la función encuesta_responder de la base de datos, que solo acepta el
 * código del enlace; sin código válido la encuesta funciona igual pero no
 * guarda nada. Las claves de cada respuesta son las mismas que valida la
 * base de datos: si se cambia una aquí hay que cambiarla allí.
 *
 * El sitio no lleva marca ni logotipo a propósito: es una encuesta, no un
 * anuncio. La única mención al servicio es la casilla del final, y quien la
 * marca está pidiendo que se lo enseñen (por eso la base de datos guarda la
 * fecha y la hora de ese toque).
 */
(function () {
  "use strict";

  var PREGUNTAS = [
    { clave: "r1", texto: "Cuando estáis en consulta, ¿quién coge el teléfono?", opciones: [
      ["recepcion", "Recepción o auxiliar"], ["quien_pueda", "El veterinario o quien esté libre"], ["nadie", "Nadie: salta el contestador"]] },
    { clave: "r2", texto: "Ayer, ¿cuántas llamadas se os quedaron sin coger?", ayuda: "A ojo vale. Si ayer no abristeis, el último día que sí.", opciones: [
      ["ninguna", "Ninguna"], ["una_dos", "Una o dos"], ["tres_cinco", "De tres a cinco"], ["mas_cinco", "Más de cinco"], ["no_se", "No lo sé"]] },
    { clave: "r3", texto: "Para pedir cita, ¿la gente os llama o os escribe?", opciones: [
      ["llaman", "Casi todos llaman"], ["mitad", "Mitad y mitad"], ["whatsapp", "Casi todos por WhatsApp"]] },
    { clave: "r4", texto: "¿Dónde apuntáis las citas, sobre todo?", ayuda: "Si usáis dos sitios, el que manda.", opciones: [
      ["programa", "En un programa de gestión"], ["google", "En Google Calendar"], ["papel", "En papel o en una agenda"], ["otro", "De otra forma"]] },
    { clave: "r5", texto: "Cuando os piden una cita por WhatsApp, ¿cuándo se apunta?", opciones: [
      ["al_momento", "En el momento"], ["luego", "Luego, cuando hay un rato"], ["a_veces_no", "A veces se queda sin apuntar"], ["no_whatsapp", "No damos citas por WhatsApp"]] },
    { clave: "r6", texto: "Las llamadas de noche o en domingo, ¿qué pasa con ellas?", opciones: [
      ["movil_guardia", "Suena un móvil de guardia nuestro"], ["hospital", "Se mandan a un hospital de urgencias"], ["contestador", "Salta un contestador y nada más"], ["no_se_atienden", "Suena y nadie lo coge"]] },
  ];
  // Los programas que se ofrecen para tocar, por orden alfabético.
  var PROGRAMAS = [["ark", "ARK"], ["provet", "Provet"], ["qvet", "QVet"], ["wakyma", "Wakyma"], ["otro", "Otro"], ["no_se", "No lo sé"]];
  var R1_DESDE_CORREO = { "1": "recepcion", "2": "quien_pueda", "3": "nadie" };
  // De «ayer se quedaron sin coger…» a llamadas al día: el extremo bajo de cada
  // tramo, para que la cuenta se quede corta antes que larga.
  var PERDIDAS_AL_DIA = { ninguna: 0, una_dos: 1, tres_cinco: 3, mas_cinco: 6, no_se: 1 };
  // Supuestos prudentes: mejor quedarse corto que largo con la cuenta de otro.
  var SUPUESTOS = { noVuelven: 40, sonCita: 50, dias: 22 };
  var TICKET = { inicial: 45, min: 25, max: 150, paso: 5 };
  var PERDIDAS = { min: 0, max: 15, paso: 1 };

  var parametros = new URLSearchParams(window.location.search);
  var codigo = /^[a-z0-9]{12}$/.test(parametros.get("c") || "") ? parametros.get("c") : "";
  var r1DelCorreo = R1_DESDE_CORREO[parametros.get("r") || ""] || "";

  var e = {
    respuestas: r1DelCorreo ? { r1: r1DelCorreo } : {},
    r1SinTocar: !!r1DelCorreo,          // la respuesta del correo aún no se ha cambiado aquí
    pantalla: r1DelCorreo ? 2 : 1,       // 1..6, "programa", "cuenta" o "gracias"
    perdidasAjuste: null,
    ticket: TICKET.inicial,
    quiereEstudio: null,
    quiereVer: null,
    guardado: "sin_guardar",            // sin_guardar | ok | fallo | desconocido (el código no existe)
    yaEstaba: false,                    // la clínica ya había contestado antes de esta visita
    guardados: 0,
  };
  var app = document.getElementById("app");
  var primeraPintada = true;
  var cola = Promise.resolve();          // los guardados van en fila, uno detrás de otro
  var ultimoCambio = 0;                  // para descartar el segundo toque de un doble toque

  // --- utilidades -----------------------------------------------------------
  function el(etiqueta, atributos) {
    var nodo = document.createElement(etiqueta);
    for (var k in atributos || {}) {
      var v = atributos[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "texto") nodo.textContent = v;
      else if (k === "clase") nodo.className = v;
      else if (/^al[A-Z]/.test(k)) nodo.addEventListener(k.slice(2).toLowerCase(), v);
      else nodo.setAttribute(k, v === true ? "" : v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var hijo = arguments[i];
      if (hijo === null || hijo === undefined || hijo === false) continue;
      nodo.appendChild(typeof hijo === "string" ? document.createTextNode(hijo) : hijo);
    }
    return nodo;
  }
  function miles(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function perdidasAlDia() {
    if (e.perdidasAjuste !== null) return e.perdidasAjuste;
    var v = PERDIDAS_AL_DIA[e.respuestas.r2 || "no_se"];
    return v === undefined ? 0 : v;
  }
  function cuenta() {
    // Se redondea una sola vez y hacia abajo: la cuenta, antes corta que larga.
    var perdidasMes = perdidasAlDia() * SUPUESTOS.dias;
    var citasMes = Math.floor(perdidasMes * SUPUESTOS.noVuelven / 100 * SUPUESTOS.sonCita / 100);
    return { perdidasMes: perdidasMes, citasMes: citasMes, eurosMes: citasMes * e.ticket };
  }
  function textoDe(pregunta, valor) {
    for (var i = 0; i < pregunta.opciones.length; i++) if (pregunta.opciones[i][0] === valor) return pregunta.opciones[i][1];
    return "";
  }

  // --- guardar ----------------------------------------------------------------
  function guardar(conFinal) {
    var r = e.respuestas;
    // Sin código no se guarda. Y tampoco antes de la segunda respuesta: los
    // programas de correo abren el enlace solos para revisarlo.
    if (!codigo || !r.r1 || !r.r2) return;
    var c = cuenta();
    // Quien dijo «no lo sé» y no movió el deslizador no tiene una cifra suya.
    var sinDato = r.r2 === "no_se" && e.perdidasAjuste === null;
    var args = {
      p_codigo: codigo,
      p_r1: r.r1, p_r2: r.r2, p_r3: r.r3 || null, p_r4: r.r4 || null,
      p_programa: r.r4 === "programa" ? r.programa || null : null,
      p_programa_otro: r.r4 === "programa" && r.programa === "otro" ? r.programaOtro || null : null,
      p_r5: r.r5 || null, p_r6: r.r6 || null,
      p_ticket: conFinal ? e.ticket : null,
      p_citas_mes: conFinal && !sinDato ? c.citasMes : null,
      p_euros_mes: conFinal && !sinDato ? c.eurosMes : null,
      p_quiere_estudio: conFinal ? e.quiereEstudio : null,
      p_quiere_ver: conFinal ? e.quiereVer : null,
    };
    var config = window.ENCUESTA_CONFIG || {};
    cola = cola.then(function () {
      return fetch(config.url + "/rest/v1/rpc/encuesta_responder", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.key, Authorization: "Bearer " + config.key },
        body: JSON.stringify(args),
      }).then(function (respuesta) {
        if (!respuesta.ok) throw new Error("no se pudo guardar");
        return respuesta.json();
      }).then(function (resultado) {
        // Un código que no existe no es un fallo que el visitante pueda arreglar.
        if (resultado && resultado.ok) {
          if (e.guardados === 0 && resultado.ya_respondida) e.yaEstaba = true;
          e.guardados++; e.guardado = "ok";
        } else {
          e.guardado = resultado && resultado.motivo === "codigo" ? "desconocido" : "fallo";
        }
      }).catch(function () {
        e.guardado = "fallo";
      }).then(function () {
        if (e.pantalla === "gracias") pintar(true);
      });
    });
  }

  // --- moverse --------------------------------------------------------------------
  function ir(pantalla) { ultimoCambio = Date.now(); e.pantalla = pantalla; pintar(); }
  function demasiadoPronto() { return Date.now() - ultimoCambio < 400; }

  function elegir(indice, valor) {
    if (demasiadoPronto()) return;
    var clave = PREGUNTAS[indice].clave;
    e.respuestas[clave] = valor;
    if (clave === "r1") e.r1SinTocar = false;
    if (clave === "r2") e.perdidasAjuste = null;
    if (clave === "r4" && valor !== "programa") { delete e.respuestas.programa; delete e.respuestas.programaOtro; }
    if (clave === "r4" && valor === "programa") { ir("programa"); return; }
    guardar(false);
    ir(indice === 5 ? "cuenta" : indice + 2);
  }
  function elegirPrograma(valor) {
    if (demasiadoPronto()) return;
    e.respuestas.programa = valor;
    if (valor !== "otro") { delete e.respuestas.programaOtro; guardar(false); ir(5); return; }
    pintar();
    var campo = document.getElementById("programa-otro");
    if (campo) campo.focus();
  }
  function atras() {
    var p = e.pantalla;
    if (p === "programa") ir(4);
    else if (p === "cuenta") ir(6);
    else if (p === 5 && e.respuestas.r4 === "programa") ir("programa");
    else if (typeof p === "number" && p > 1) ir(p - 1);
  }

  // --- pintar ------------------------------------------------------------------------
  function opcion(texto, marcada, alTocar) {
    return el("button", { type: "button", clase: "encuesta-opcion" + (marcada ? " marcada" : ""), "aria-pressed": marcada ? "true" : "false", alClick: alTocar, texto: texto });
  }
  // Un sí/no de la pantalla de la cuenta. La «ayuda» (opcional) va debajo de
  // la pregunta y dice en llano qué pasa al marcar sí: la casilla del servicio
  // es una petición de la clínica, y tiene que entenderse antes de tocarla.
  function siNo(pregunta, campo, si, no, ayuda) {
    function boton(texto, valor) {
      var b = el("button", { type: "button", clase: e[campo] === valor ? "marcada" : "", "aria-pressed": e[campo] === valor ? "true" : "false", texto: texto });
      b.addEventListener("click", function () {
        e[campo] = valor;
        var hermanos = b.parentNode.querySelectorAll("button");
        for (var i = 0; i < hermanos.length; i++) { hermanos[i].className = ""; hermanos[i].setAttribute("aria-pressed", "false"); }
        b.className = "marcada"; b.setAttribute("aria-pressed", "true");
        guardar(true);
      });
      return b;
    }
    return el("div", { clase: "encuesta-sino" }, el("p", { texto: pregunta }),
      ayuda ? el("p", { clase: "encuesta-sino-ayuda", texto: ayuda }) : null,
      el("div", { role: "group", "aria-label": pregunta }, boton(si, true), boton(no, false)));
  }

  function pintarPregunta(cuerpo, numero) {
    var pregunta = PREGUNTAS[numero - 1];
    if (numero === 2 && e.r1SinTocar) {
      cuerpo.appendChild(el("p", { clase: "encuesta-apuntada" }, "Primera respuesta apuntada: ", el("b", { texto: textoDe(PREGUNTAS[0], e.respuestas.r1) }), ". ",
        el("button", { type: "button", texto: "Cambiarla", alClick: function () { ir(1); } })));
    }
    cuerpo.appendChild(el("h1", { tabindex: "-1", texto: pregunta.texto }));
    if (pregunta.ayuda) cuerpo.appendChild(el("p", { clase: "encuesta-ayuda", texto: pregunta.ayuda }));
    var lista = el("div", { clase: "encuesta-opciones" });
    pregunta.opciones.forEach(function (o) {
      lista.appendChild(opcion(o[1], e.respuestas[pregunta.clave] === o[0], function () { elegir(numero - 1, o[0]); }));
    });
    cuerpo.appendChild(lista);
  }

  function pintarPrograma(cuerpo) {
    cuerpo.appendChild(el("h1", { tabindex: "-1", texto: "¿Qué programa usáis?" }));
    var lista = el("div", { clase: "encuesta-opciones dos" });
    PROGRAMAS.forEach(function (p) {
      lista.appendChild(opcion(p[1], e.respuestas.programa === p[0], function () { elegirPrograma(p[0]); }));
    });
    cuerpo.appendChild(lista);
    if (e.respuestas.programa === "otro") {
      var campo = el("input", { id: "programa-otro", type: "text", maxlength: "40", autocomplete: "off", enterkeyhint: "next" });
      campo.value = e.respuestas.programaOtro || "";
      campo.addEventListener("input", function () { e.respuestas.programaOtro = campo.value; });
      var formulario = el("form", { clase: "encuesta-otro" }, el("label", { for: "programa-otro", texto: "¿Cómo se llama?" }), campo,
        el("button", { type: "submit", clase: "encuesta-boton", texto: "Seguir" }));
      formulario.addEventListener("submit", function (ev) { ev.preventDefault(); guardar(false); ir(5); });
      cuerpo.appendChild(formulario);
    }
  }

  function pintarCuenta(cuerpo) {
    var titulo = el("h1", { tabindex: "-1" });
    var nPerdidas = el("strong"), nCitas = el("strong"), nEuros = el("strong");
    var vPerdidas = el("b"), vTicket = el("b");
    var supuestos = el("p", { clase: "cuenta-supuestos" });
    var rPerdidas = el("input", { type: "range", min: PERDIDAS.min, max: PERDIDAS.max, step: PERDIDAS.paso });
    var rTicket = el("input", { type: "range", min: TICKET.min, max: TICKET.max, step: TICKET.paso });

    function refrescar() {
      var c = cuenta(), dia = perdidasAlDia();
      titulo.textContent = "";
      if (e.respuestas.r2 === "no_se" && e.perdidasAjuste === null) {
        titulo.appendChild(document.createTextNode("No lo sabéis. Si fuera una al día, serían "));
        titulo.appendChild(el("em", { texto: "unas " + miles(c.citasMes) + " citas al mes." }));
      } else if (c.citasMes === 0) {
        titulo.appendChild(document.createTextNode("Con esas llamadas, "));
        titulo.appendChild(el("em", { texto: "no se os escapa ninguna cita." }));
      } else {
        titulo.appendChild(document.createTextNode("Se os van unas "));
        titulo.appendChild(el("em", { texto: miles(c.citasMes) + (c.citasMes === 1 ? " cita al mes" : " citas al mes") }));
        titulo.appendChild(document.createTextNode(" por el teléfono."));
      }
      nPerdidas.textContent = miles(Math.round(c.perdidasMes)); nCitas.textContent = miles(c.citasMes); nEuros.textContent = miles(c.eurosMes) + " €";
      vPerdidas.textContent = String(dia); vTicket.textContent = e.ticket + " €";
      rPerdidas.value = String(dia); rPerdidas.setAttribute("aria-valuetext", dia + " al día");
      rTicket.value = String(e.ticket); rTicket.setAttribute("aria-valuetext", e.ticket + " euros");
      supuestos.textContent = (e.respuestas.r2 === "no_se" && e.perdidasAjuste === null ? "Moved el primer deslizador a lo que os parezca. " : "") +
        "Contamos, siendo prudentes, que de las llamadas sin coger 4 de cada 10 no vuelven a llamar, que la mitad eran para pedir cita y que abrís " + SUPUESTOS.dias + " días al mes.";
    }
    rPerdidas.addEventListener("input", function () { e.perdidasAjuste = Number(rPerdidas.value); refrescar(); });
    rTicket.addEventListener("input", function () { e.ticket = Number(rTicket.value); refrescar(); });
    rPerdidas.addEventListener("change", function () { guardar(true); });
    rTicket.addEventListener("change", function () { guardar(true); });

    cuerpo.appendChild(el("p", { clase: "encuesta-eyebrow", texto: "Vuestra cuenta" }));
    cuerpo.appendChild(titulo);
    cuerpo.appendChild(el("div", { clase: "cuenta-tarjeta" },
      el("div", { clase: "cuenta-resultado", "aria-live": "polite" },
        el("div", {}, nPerdidas, el("span", { texto: "llamadas sin coger al mes" })),
        el("div", {}, nCitas, el("span", { texto: "citas que se van a otra clínica" })),
        el("div", { clase: "cuenta-euros" }, nEuros, el("span", { texto: "al mes que no entran, solo en primeras visitas" }))),
      el("div", { clase: "cuenta-controles" },
        el("label", { clase: "cuenta-control" }, el("span", { clase: "cuenta-etiqueta" }, "Llamadas sin coger en un día normal", vPerdidas), rPerdidas),
        el("label", { clase: "cuenta-control" }, el("span", { clase: "cuenta-etiqueta" }, "Lo que deja una cita, de media", vTicket), rTicket)),
      supuestos));
    refrescar();

    cuerpo.appendChild(el("h2", { texto: "Dos cosas más, si queréis" }));
    cuerpo.appendChild(siNo("En diciembre tendré lo que han contestado las demás clínicas de Andalucía. ¿Os lo mando?", "quiereEstudio", "Sí, mándanoslo", "No hace falta"));
    // La casilla: la única mención al servicio en todo el sitio. Se dice claro
    // qué se pide para que el sí sea una petición de verdad (y la prueba legal
    // de que la clínica quiso que se le llamara).
    cuerpo.appendChild(siNo("Estoy montando un servicio de recepción telefónica para clínicas pequeñas. ¿Queréis que os lo enseñe?", "quiereVer", "Sí, enseñádnoslo", "Ahora no",
      "Si decís que sí, me pedís que os llame o os escriba para enseñároslo. Nada más."));
    cuerpo.appendChild(el("button", { type: "button", clase: "encuesta-boton", texto: "Terminar", alClick: function () { guardar(true); ir("gracias"); } }));
  }

  function pintarGracias(cuerpo) {
    var caja = el("div", { clase: "encuesta-gracias" });
    caja.appendChild(el("h1", { tabindex: "-1" }, "Gracias. ", el("em", { texto: "Eso era todo." })));
    var guardada = !!codigo && e.guardado === "ok";
    var texto = (guardada ? (e.yaEstaba ? "Vuestra clínica ya había contestado antes; gracias por repasarlo. " : "Vuestras respuestas ya están apuntadas. ") : "Gracias por el rato. ") +
      (guardada && e.quiereEstudio ? "En diciembre os llegará lo que han dicho las demás clínicas. " : "") +
      (guardada ? "Os mandaré vuestra cuenta por correo, por si queréis guardarla; nada más que no hayáis pedido." : "No os escribiré para nada que no hayáis pedido.");
    caja.appendChild(el("p", { texto: texto }));
    if (e.quiereVer === true) {
      // Solo a quien lo ha pedido con la casilla: el número de la clínica de
      // prueba para oír el servicio ahora mismo, sin esperar a nadie. Si la
      // petición no ha llegado a la base de datos (sin código, código
      // desconocido o fallo), el aviso no saltará, así que se da el correo.
      var sinAviso = !codigo || e.guardado === "fallo" || e.guardado === "desconocido";
      caja.appendChild(el("div", { clase: "encuesta-demo", role: "status" },
        el("p", {}, "Como habéis pedido verlo: lo más rápido es llamar ahora al ", el("a", { href: "tel:+34951791054", texto: "951 79 10 54" }),
          " y pedir cita para vuestro perro como si fuerais un cliente. Es la recepción de una clínica de prueba; no pasa nada."),
        el("p", {}, "Simón os llama en menos de una hora en horario de clínica y, si no cogéis, os escribe." +
          (sinAviso ? " Si no os llama nadie, escribidle a simon@encuesta.trustpulse.es." : ""))));
    }
    if (e.guardado === "fallo") {
      caja.appendChild(el("p", { clase: "encuesta-aviso", role: "status" }, "No hemos podido guardar vuestras respuestas. ",
        el("button", { type: "button", texto: "Volver a intentarlo", alClick: function () { guardar(true); } })));
    } else if (!codigo || e.guardado === "desconocido") {
      caja.appendChild(el("p", { clase: "encuesta-aviso", role: "status" }, "Con este enlace no reconocemos vuestra clínica, así que no se ha guardado nada. Abrid la encuesta desde el correo o escribidme a ",
        el("a", { href: "mailto:simon@encuesta.trustpulse.es", texto: "simon@encuesta.trustpulse.es" }), "."));
    }
    caja.appendChild(el("p", { clase: "encuesta-firma" }, "Simón · ", el("a", { href: "mailto:simon@encuesta.trustpulse.es", texto: "simon@encuesta.trustpulse.es" })));
    cuerpo.appendChild(caja);
  }

  function pintar(sinMoverFoco) {
    var p = e.pantalla;
    var enPreguntas = p !== "cuenta" && p !== "gracias";
    var numero = typeof p === "number" ? p : p === "programa" ? 4 : 6;
    app.textContent = "";

    // Sin marca ni enlace en la cabecera: solo el nombre de la encuesta.
    var cabecera = el("header", { clase: "encuesta-cabecera" }, el("span", { clase: "encuesta-marca", texto: "Encuesta del teléfono" }));
    if (enPreguntas) cabecera.appendChild(el("span", { clase: "encuesta-paso", texto: "Pregunta " + numero + " de 6" }));
    app.appendChild(cabecera);
    if (enPreguntas) {
      var barra = el("span"); barra.style.width = ((numero - 1) / 6 * 100) + "%";
      app.appendChild(el("div", { clase: "encuesta-progreso", role: "progressbar", "aria-label": "Avance de la encuesta", "aria-valuemin": "0", "aria-valuemax": "6", "aria-valuenow": String(numero - 1) }, barra));
    }

    var cuerpo = el("section", { clase: "encuesta-cuerpo" });
    if (p !== "gracias" && p !== 1) cuerpo.appendChild(el("button", { type: "button", clase: "encuesta-atras", texto: "← Atrás", alClick: atras }));
    if (typeof p === "number") pintarPregunta(cuerpo, p);
    else if (p === "programa") pintarPrograma(cuerpo);
    else if (p === "cuenta") pintarCuenta(cuerpo);
    else pintarGracias(cuerpo);
    app.appendChild(cuerpo);

    app.appendChild(el("p", { clase: "encuesta-pie" }, "No pedimos nombres ni datos de clientes: solo vuestras respuestas. ",
      el("a", { href: "/privacidad/", texto: "Privacidad" })));

    // Al cambiar de pantalla, arriba del todo y con el foco en la pregunta
    // (teclado y lectores de pantalla). En la primera carga no se toca nada.
    if (!primeraPintada && !sinMoverFoco) {
      window.scrollTo(0, 0);
      var titulo = cuerpo.querySelector("h1");
      if (titulo) titulo.focus({ preventScroll: true });
    }
    primeraPintada = false;
  }

  pintar();
})();
