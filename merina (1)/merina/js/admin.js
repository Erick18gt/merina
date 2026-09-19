/* MERINA · panel de administración
   Guarda los cambios directamente en el repositorio de GitHub (data/catalogo.js
   y la carpeta img/) usando la API de GitHub y un token personal. */
(function () {
  "use strict";

  var API = "https://api.github.com";
  var RUTA_DATOS = "data/catalogo.js";
  var LS_KEY = "merina_admin_sesion";

  var $ = function (s) { return document.querySelector(s); };

  /* Estado en memoria */
  var S = {
    owner: "", repo: "", token: "", branch: "main",
    sha: "",            // versión actual de catalogo.js en GitHub
    data: null,         // { config, productos }
    pend: {},           // fotos nuevas por subir: ruta -> base64
    prev: {},           // vista previa de fotos nuevas: ruta -> base64
    sucio: false        // hay cambios sin publicar
  };
  var editando = null;  // índice del perfume que se edita (null = nuevo)
  var fotoNueva = null; // base64 de la foto elegida en el formulario
  var fotoQuitada = false;

  /* ---------- Utilidades ---------- */
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slug(t) {
    return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "perfume";
  }
  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function aviso(txt, mal) {
    var a = $("#aviso");
    a.textContent = txt;
    a.className = "aviso" + (mal ? " mal" : "");
    a.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(function () { a.hidden = true; }, mal ? 7000 : 4500);
  }
  function traducirError(e) {
    if (e.status === 401) return "El token no es válido o ya venció. Genera uno nuevo en GitHub.";
    if (e.status === 403) return "El token no tiene permiso para escribir. Revisa que tenga “Contents: Read and write”.";
    if (e.status === 404) return "No se encontró el repositorio (o el token no tiene acceso a él). Revisa la cuenta, el nombre y el token.";
    if (e.status === 409 || e.status === 422) return "El catálogo cambió mientras editabas. Vuelve a intentarlo.";
    if (e instanceof TypeError) return "No hay conexión con GitHub. Revisa tu internet.";
    return e.message || "Ocurrió un error inesperado.";
  }

  /* ---------- API de GitHub ---------- */
  function gh(metodo, ruta, cuerpo) {
    var headers = {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + S.token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (cuerpo) headers["Content-Type"] = "application/json";
    return fetch(API + "/repos/" + S.owner + "/" + S.repo + ruta, {
      method: metodo, headers: headers, cache: "no-store",
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.message || ("Error " + r.status));
          e.status = r.status;
          throw e;
        }
        return j;
      });
    });
  }
  function rutaContenido(ruta) {
    return "/contents/" + ruta + "?ref=" + encodeURIComponent(S.branch);
  }

  function cargar() {
    return gh("GET", rutaContenido(RUTA_DATOS)).then(function (f) {
      S.sha = f.sha;
      var txt = b64ToUtf8(f.content);
      var i = txt.indexOf("=", txt.indexOf("window.CATALOGO"));
      var d = JSON.parse(txt.slice(txt.indexOf("{", i), txt.lastIndexOf("}") + 1));
      d.config = d.config || {};
      d.productos = d.productos || [];
      S.data = d; S.pend = {}; S.sucio = false;
    });
  }

  function serializar() {
    return "/* Archivo generado por el panel de administración (admin.html). No lo edites a mano. */\n" +
      "window.CATALOGO = " + JSON.stringify(S.data, null, 2) + ";\n";
  }

  function guardarDatos(reintento) {
    return gh("PUT", "/contents/" + RUTA_DATOS, {
      message: "Actualizar catálogo desde el panel",
      content: utf8ToB64(serializar()),
      sha: S.sha,
      branch: S.branch
    }).then(function (r) {
      S.sha = r.content.sha;
    }).catch(function (e) {
      if ((e.status === 409 || e.status === 422) && !reintento) {
        return gh("GET", rutaContenido(RUTA_DATOS)).then(function (f) {
          S.sha = f.sha;
          return guardarDatos(true);
        });
      }
      throw e;
    });
  }

  function publicar() {
    var btn = $("#btn-publicar");
    btn.disabled = true; btn.textContent = "Publicando…";

    var usadas = {};
    S.data.productos.forEach(function (p) { if (p.imagen) usadas[p.imagen] = true; });
    var rutas = Object.keys(S.pend).filter(function (r) { return usadas[r]; });

    var cadena = Promise.resolve();
    rutas.forEach(function (r) {
      cadena = cadena.then(function () {
        return gh("PUT", "/contents/" + r, {
          message: "Agregar foto " + r, content: S.pend[r], branch: S.branch
        }).then(function () { delete S.pend[r]; });
      });
    });
    cadena.then(function () { return guardarDatos(false); })
      .then(function () {
        S.pend = {}; S.sucio = false;
        $("#barra").hidden = true;
        aviso("Publicado. En 1 o 2 minutos se verá en la página.");
      })
      .catch(function (e) { aviso(traducirError(e), true); })
      .then(function () { btn.disabled = false; btn.textContent = "Publicar cambios"; });
  }

  /* ---------- Sesión ---------- */
  function guardarSesion() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ owner: S.owner, repo: S.repo, token: S.token })); } catch (e) {}
  }
  function borrarSesion() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }
  function leerSesion() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { return null; }
  }

  function entrar(owner, repo, token, recordar) {
    S.owner = owner.trim(); S.repo = repo.trim(); S.token = token.trim();
    return gh("GET", "").then(function (info) {
      S.branch = info.default_branch || "main";
      return cargar();
    }).then(function () {
      if (recordar) guardarSesion();
      $("#login").hidden = true;
      $("#panel").hidden = false;
      pintarTodo();
    });
  }

  function salir() {
    if (S.sucio && !confirm("Tienes cambios sin publicar. ¿Cerrar sesión y perderlos?")) return;
    S.sucio = false;
    borrarSesion();
    location.reload();
  }

  /* ---------- Marcar cambios ---------- */
  function marcarSucio() {
    S.sucio = true;
    $("#barra").hidden = false;
  }

  /* ---------- Lista de perfumes ---------- */
  function srcFoto(ruta) {
    if (!ruta) return "";
    return S.prev[ruta] ? "data:image/jpeg;base64," + S.prev[ruta] : ruta;
  }

  function pintarLista() {
    var l = S.data.productos;
    var moneda = S.data.config.moneda || "";
    $("#total").textContent = l.length === 1 ? "1 perfume" : l.length + " perfumes";

    if (!l.length) {
      $("#lista").innerHTML = '<p class="vacio">Aún no hay perfumes. Toca “Nuevo perfume” para agregar el primero.</p>';
      return;
    }
    $("#lista").innerHTML = l.map(function (p, i) {
      var disp = p.disponible !== false;
      var detalle = [p.categoria, p.ml ? p.ml + " ml" : "", p.precio ? moneda + p.precio : "Sin precio"]
        .filter(Boolean).join(" · ");
      return '<article class="item' + (p.oculto ? " oculto" : "") + '" data-i="' + i + '">' +
        '<div class="mini">' + (p.imagen ? '<img src="' + esc(srcFoto(p.imagen)) + '" alt="">' : esc((p.nombre || "?").charAt(0))) + '</div>' +
        '<div class="dato"><strong>' + esc(p.nombre) + (p.oculto ? '<span class="etq">Oculto</span>' : "") + '</strong>' +
          '<span>' + esc(detalle) + '</span></div>' +
        '<button type="button" class="estado ' + (disp ? "ok" : "no") + '" data-acc="estado" ' +
          'aria-label="Cambiar entre disponible y agotado">' + (disp ? "Disponible" : "Agotado") + '</button>' +
        '<div class="acc">' +
          '<button type="button" class="mover" data-acc="subir" aria-label="Subir en la lista"' + (i === 0 ? " disabled" : "") + '>▲</button>' +
          '<button type="button" class="mover" data-acc="bajar" aria-label="Bajar en la lista"' + (i === l.length - 1 ? " disabled" : "") + '>▼</button>' +
          '<button type="button" data-acc="editar">Editar</button>' +
          '<button type="button" class="borrar" data-acc="borrar">Eliminar</button>' +
        '</div>' +
      '</article>';
    }).join("");
  }

  function pintarNegocio() {
    document.querySelectorAll("[data-cfg]").forEach(function (inp) {
      inp.value = S.data.config[inp.getAttribute("data-cfg")] || "";
    });
  }
  function pintarTodo() {
    pintarLista();
    pintarNegocio();
    $("#barra").hidden = !S.sucio;
  }

  /* ---------- Acciones de la lista ---------- */
  $("#lista").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-acc]");
    if (!b) return;
    var i = Number(b.closest(".item").getAttribute("data-i"));
    var l = S.data.productos, p = l[i];
    var acc = b.getAttribute("data-acc");

    if (acc === "estado") {
      p.disponible = p.disponible === false;
    } else if (acc === "editar") {
      return abrirFormulario(i);
    } else if (acc === "borrar") {
      if (!confirm("¿Eliminar “" + p.nombre + "”? Esta acción se publica al tocar “Publicar cambios”.")) return;
      l.splice(i, 1);
    } else if (acc === "subir" && i > 0) {
      var t1 = l[i - 1]; l[i - 1] = l[i]; l[i] = t1;
    } else if (acc === "bajar" && i < l.length - 1) {
      var t2 = l[i + 1]; l[i + 1] = l[i]; l[i] = t2;
    }
    marcarSucio();
    pintarLista();
  });

  /* ---------- Formulario de perfume ---------- */
  var dlg = $("#dlg");

  function mostrarPrev(ruta, b64) {
    var caja = $("#foto-prev");
    var src = b64 ? "data:image/jpeg;base64," + b64 : srcFoto(ruta);
    caja.innerHTML = src ? '<img src="' + esc(src) + '" alt="">' : "<span>Sin foto</span>";
    $("#btn-quitar-foto").hidden = !src;
  }

  function abrirFormulario(i) {
    editando = i;
    fotoNueva = null; fotoQuitada = false;
    var p = i == null ? { categoria: "Mujer", ml: 100, precio: "", disponible: true, oculto: false, marca: S.data.config.nombre || "" } : S.data.productos[i];

    $("#dlg-titulo").textContent = i == null ? "Nuevo perfume" : "Editar perfume";
    $("#f-nombre").value = p.nombre || "";
    $("#f-marca").value = p.marca || "";
    $("#f-categoria").value = p.categoria || "Mujer";
    $("#f-ml").value = p.ml || "";
    $("#f-precio").value = p.precio || "";
    $("#f-notas").value = p.notas || "";
    $("#f-disponible").checked = p.disponible !== false;
    $("#f-visible").checked = !p.oculto;
    $("#f-foto").value = "";
    $("#f-error").hidden = true;
    mostrarPrev(p.imagen, null);
    dlg.showModal();
    $("#f-nombre").focus();
  }

  function redimensionar(file) {
    return new Promise(function (ok, fallo) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1000, r = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.round(img.width * r), h = Math.round(img.height * r);
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        var x = c.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); fallo(new Error("No se pudo leer esa imagen. Prueba con un JPG o PNG.")); };
      img.src = url;
    });
  }

  $("#f-foto").addEventListener("change", function (e) {
    var f = e.target.files[0];
    if (!f) return;
    redimensionar(f).then(function (b64) {
      fotoNueva = b64; fotoQuitada = false;
      mostrarPrev(null, b64);
    }).catch(function (err) { aviso(err.message, true); });
  });

  $("#btn-quitar-foto").addEventListener("click", function () {
    fotoNueva = null; fotoQuitada = true;
    $("#f-foto").value = "";
    $("#foto-prev").innerHTML = "<span>Sin foto</span>";
    $("#btn-quitar-foto").hidden = true;
  });

  $("#btn-nuevo").addEventListener("click", function () { abrirFormulario(null); });
  $("#btn-cancelar").addEventListener("click", function () { dlg.close(); });

  $("#form-perfume").addEventListener("submit", function (e) {
    e.preventDefault();
    var nombre = $("#f-nombre").value.trim();
    if (!nombre) { $("#f-error").textContent = "Escribe el nombre del perfume."; $("#f-error").hidden = false; return; }

    var l = S.data.productos;
    var p = editando == null ? { id: l.reduce(function (m, x) { return Math.max(m, Number(x.id) || 0); }, 0) + 1, imagen: "" } : l[editando];

    p.nombre = nombre;
    p.marca = $("#f-marca").value.trim();
    p.categoria = $("#f-categoria").value;
    p.ml = Number($("#f-ml").value) || 0;
    p.precio = Number($("#f-precio").value) || 0;
    p.notas = $("#f-notas").value.trim();
    p.disponible = $("#f-disponible").checked;
    p.oculto = !$("#f-visible").checked;

    if (fotoNueva) {
      var ruta = "img/" + slug(nombre) + "-" + Date.now().toString(36) + ".jpg";
      S.pend[ruta] = fotoNueva;
      S.prev[ruta] = fotoNueva;
      p.imagen = ruta;
    } else if (fotoQuitada) {
      p.imagen = "";
    }

    if (editando == null) l.unshift(p);
    marcarSucio();
    pintarLista();
    dlg.close();
    aviso("Listo. Toca “Publicar cambios” para que se vea en la página.");
  });

  /* ---------- Datos del negocio ---------- */
  document.querySelectorAll("[data-cfg]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      S.data.config[inp.getAttribute("data-cfg")] = inp.value.trim();
      marcarSucio();
    });
  });

  /* ---------- Pestañas ---------- */
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      var nombre = t.getAttribute("data-tab");
      document.querySelectorAll(".tab").forEach(function (o) {
        o.setAttribute("aria-selected", String(o === t));
      });
      $("#tab-perfumes").hidden = nombre !== "perfumes";
      $("#tab-negocio").hidden = nombre !== "negocio";
    });
  });

  /* ---------- Barra de publicar ---------- */
  $("#btn-publicar").addEventListener("click", publicar);
  $("#btn-descartar").addEventListener("click", function () {
    if (!confirm("¿Descartar todos los cambios sin publicar?")) return;
    cargar().then(pintarTodo).catch(function (e) { aviso(traducirError(e), true); });
  });
  $("#btn-salir").addEventListener("click", salir);

  window.addEventListener("beforeunload", function (e) {
    if (S.sucio) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- Formulario de entrada ---------- */
  var host = location.hostname, path = location.pathname.split("/").filter(Boolean);
  if (/\.github\.io$/.test(host)) {
    $("#l-owner").value = host.split(".")[0];
    if (path.length && !/\.html$/.test(path[0])) $("#l-repo").value = path[0];
    else $("#l-repo").value = host;
  }

  function intentar(owner, repo, token, recordar, esAuto) {
    var btn = $("#l-btn"), err = $("#l-error");
    err.hidden = true; btn.disabled = true; btn.textContent = "Entrando…";
    return entrar(owner, repo, token, recordar).catch(function (e) {
      if (esAuto) borrarSesion();
      err.textContent = traducirError(e); err.hidden = false;
    }).then(function () { btn.disabled = false; btn.textContent = "Entrar"; });
  }

  $("#form-login").addEventListener("submit", function (e) {
    e.preventDefault();
    intentar($("#l-owner").value, $("#l-repo").value, $("#l-token").value, $("#l-recordar").checked, false);
  });

  var guardada = leerSesion();
  if (guardada && guardada.token) {
    $("#l-owner").value = guardada.owner; $("#l-repo").value = guardada.repo;
    intentar(guardada.owner, guardada.repo, guardada.token, true, true);
  }
})();
