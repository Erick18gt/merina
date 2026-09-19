/* MERINA · lógica del catálogo. No hace falta editar este archivo. */
(function () {
  "use strict";

  var CONFIG = (window.CATALOGO && window.CATALOGO.config) || { nombre: "Merina", moneda: "Q" };
  var PRODUCTOS = (window.CATALOGO && window.CATALOGO.productos) || [];

  var $ = function (s) { return document.querySelector(s); };

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(t) {
    return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  function precioTxt(n) {
    var v = Number(n);
    if (!v) return "Consultar precio";
    return CONFIG.moneda + v.toLocaleString("es-GT", { maximumFractionDigits: 2 });
  }
  function waLink(msg) {
    var num = String(CONFIG.whatsapp || "").replace(/\D/g, "");
    return "https://wa.me/" + num + "?text=" + encodeURIComponent(msg);
  }

  /* ---------- Frasco dibujado (cuando no hay foto) ---------- */
  function botellaSVG(p, i) {
    var forma = i % 3;
    var colores = { Mujer: "#c98f7a", Hombre: "#7a5a22", Unisex: "#d4ad55" };
    var liquido = colores[p.categoria] || "#d4ad55";
    var cid = "clip" + i;
    var cuerpo, cuello, tapa, nivel;

    if (forma === 0) {
      cuerpo = '<rect x="28" y="52" width="64" height="86" rx="9"/>';
      cuello = '<rect x="53" y="42" width="14" height="10"/>';
      tapa = '<rect x="46" y="20" width="28" height="22" rx="3"/>';
      nivel = 84;
    } else if (forma === 1) {
      cuerpo = '<circle cx="60" cy="100" r="40"/>';
      cuello = '<rect x="53" y="46" width="14" height="16"/>';
      tapa = '<rect x="46" y="22" width="28" height="24" rx="3"/>';
      nivel = 92;
    } else {
      cuerpo = '<rect x="38" y="44" width="44" height="98" rx="6"/>';
      cuello = '<rect x="54" y="34" width="12" height="10"/>';
      tapa = '<circle cx="60" cy="24" r="11"/>';
      nivel = 76;
    }

    return '<svg viewBox="0 0 120 160" role="img" aria-label="Frasco ' + esc(p.nombre) + '">' +
      '<defs><clipPath id="' + cid + '">' + cuerpo + '</clipPath></defs>' +
      '<g clip-path="url(#' + cid + ')">' +
        '<rect width="120" height="160" fill="rgba(241,235,221,.08)"/>' +
        '<rect y="' + nivel + '" width="120" height="90" fill="' + liquido + '"/>' +
      '</g>' +
      '<g fill="none" stroke="#cfa84e" stroke-width="1.5">' + cuerpo + '</g>' +
      '<g fill="#cfa84e">' + cuello + tapa + '</g>' +
      '<rect x="40" y="100" width="40" height="16" rx="2" fill="#f1ebdd"/>' +
      '<text x="60" y="111.5" text-anchor="middle" font-size="7" letter-spacing=".8" ' +
        'font-family="Italiana, Georgia, serif" fill="#0b0b0a">MERINA</text>' +
    '</svg>';
  }

  /* ---------- Estado ---------- */
  var visibles = PRODUCTOS.filter(function (p) { return !p.oculto; });
  var estado = { categoria: "Todos", texto: "", orden: "recomendado" };

  var categorias = ["Todos"];
  visibles.forEach(function (p) {
    if (p.categoria && categorias.indexOf(p.categoria) === -1) categorias.push(p.categoria);
  });

  /* ---------- Pestañas ---------- */
  function pintarTabs() {
    $("#tabs").innerHTML = categorias.map(function (c) {
      return '<button class="tab" role="tab" data-cat="' + esc(c) + '" aria-selected="' +
        (c === estado.categoria) + '">' + esc(c) + '</button>';
    }).join("");
  }

  /* ---------- Filtrar y ordenar ---------- */
  function lista() {
    var q = norm(estado.texto);
    var l = visibles.filter(function (p) {
      var okCat = estado.categoria === "Todos" || p.categoria === estado.categoria;
      var okTxt = !q || norm([p.nombre, p.marca, p.notas, p.categoria].join(" ")).indexOf(q) !== -1;
      return okCat && okTxt;
    });
    if (estado.orden === "precio-asc") l.sort(function (a, b) { return (a.precio || 0) - (b.precio || 0); });
    if (estado.orden === "precio-desc") l.sort(function (a, b) { return (b.precio || 0) - (a.precio || 0); });
    if (estado.orden === "nombre") l.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, "es"); });
    return l;
  }

  /* ---------- Pintar productos ---------- */
  function pintar() {
    var l = lista();
    var grid = $("#grid");

    grid.innerHTML = l.map(function (p) {
      var i = PRODUCTOS.indexOf(p);
      var disponible = p.disponible !== false;
      var msg = disponible
        ? 'Hola ' + CONFIG.nombre + ', me interesa el perfume "' + p.nombre + '" (' + p.ml + ' ml). ¿Está disponible?'
        : 'Hola ' + CONFIG.nombre + ', ¿cuándo tendrán de nuevo el perfume "' + p.nombre + '"?';
      var foto = p.imagen
        ? '<img src="' + esc(p.imagen) + '" alt="' + esc(p.nombre) + '" loading="lazy">'
        : botellaSVG(p, i);

      return '<article class="item">' +
        '<div class="foto cat-' + norm(p.categoria || "") + '" data-i="' + i + '">' + foto +
          (disponible ? "" : '<span class="tag-agotado">Agotado</span>') +
        '</div>' +
        '<div class="info">' +
          (p.marca ? '<p class="marca">' + esc(p.marca) + '</p>' : "") +
          '<h3>' + esc(p.nombre) + '</h3>' +
          (p.notas ? '<p class="notas">' + esc(p.notas) + '</p>' : "") +
          '<div class="fila"><span class="precio">' + esc(precioTxt(p.precio)) + '</span>' +
            (p.ml ? '<span class="ml">' + esc(p.ml) + ' ml</span>' : "") + '</div>' +
          '<a class="pedir' + (disponible ? "" : " consulta") + '" href="' + waLink(msg) +
            '" target="_blank" rel="noopener">' +
            (disponible ? "Pedir por WhatsApp" : "Preguntar por WhatsApp") + '</a>' +
        '</div>' +
      '</article>';
    }).join("");

    // Si una foto no carga (nombre mal escrito), se muestra el frasco dibujado.
    grid.querySelectorAll(".foto img").forEach(function (img) {
      img.addEventListener("error", function () {
        var caja = img.parentElement;
        var p = PRODUCTOS[Number(caja.getAttribute("data-i"))];
        img.outerHTML = botellaSVG(p, Number(caja.getAttribute("data-i")));
      });
    });

    $("#vacio").hidden = l.length !== 0;
    $("#contador").textContent = l.length === 1 ? "1 perfume" : l.length + " perfumes";
  }

  /* ---------- Eventos ---------- */
  $("#tabs").addEventListener("click", function (e) {
    var b = e.target.closest(".tab");
    if (!b) return;
    estado.categoria = b.getAttribute("data-cat");
    pintarTabs();
    pintar();
  });
  $("#buscar").addEventListener("input", function (e) { estado.texto = e.target.value; pintar(); });
  $("#orden").addEventListener("change", function (e) { estado.orden = e.target.value; pintar(); });

  /* ---------- Contacto y WhatsApp ---------- */
  var hola = "Hola " + CONFIG.nombre + ", quisiera información sobre sus perfumes.";
  document.querySelectorAll("[data-wa]").forEach(function (a) {
    a.href = waLink(hola);
    a.target = "_blank";
    a.rel = "noopener";
  });

  var datos = [];
  var num = String(CONFIG.whatsapp || "").replace(/\D/g, "");
  if (num) datos.push(["WhatsApp", '<a href="' + waLink(hola) + '" target="_blank" rel="noopener">+' + esc(num) + "</a>"]);
  if (CONFIG.instagram) datos.push(["Instagram", '<a href="https://instagram.com/' + esc(CONFIG.instagram) + '" target="_blank" rel="noopener">@' + esc(CONFIG.instagram) + "</a>"]);
  if (CONFIG.facebook) datos.push(["Facebook", '<a href="https://facebook.com/' + esc(CONFIG.facebook) + '" target="_blank" rel="noopener">' + esc(CONFIG.facebook) + "</a>"]);
  if (CONFIG.email) datos.push(["Correo", '<a href="mailto:' + esc(CONFIG.email) + '">' + esc(CONFIG.email) + "</a>"]);
  if (CONFIG.horario) datos.push(["Horario", esc(CONFIG.horario)]);
  if (CONFIG.ciudad) datos.push(["Ciudad", esc(CONFIG.ciudad)]);

  $("#datos").innerHTML = datos.map(function (d) {
    return "<li><small>" + d[0] + "</small>" + d[1] + "</li>";
  }).join("");

  $("#pie").textContent = "© " + new Date().getFullYear() + " " + CONFIG.nombre + " · Perfumería";

  pintarTabs();
  pintar();
})();
