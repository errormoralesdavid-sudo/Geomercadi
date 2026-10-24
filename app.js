import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, initializeFirestore, persistentLocalCache } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAsBnD8C_E_o5oHzmw7bWmKrmW2JAjdcaU",
    authDomain: "geomercado-9d642.firebaseapp.com",
    projectId: "geomercado-9d642",
    storageBucket: "geomercado-9d642.firebasestorage.app",
    messagingSenderId: "521126834575",
    appId: "1:521126834575:web:4c847dec3dd57d9a439bfa"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
const auth = getAuth(app);

// VARIABLES MULTI-TIENDA Y ESTADO GLOBAL
window.tiendaActivaID = localStorage.getItem('geomercado_tienda_id') || "datos_globales";
window.unsubscribeSnapshot = null;

window.tasaDia = parseFloat(localStorage.getItem('geomercado_tasa_v19')) || 623.02;
window.subtotalVentaUSD = 0.00;
window.montoIGTF_USD = 0.00;
window.totalVentaUSD = 0.00;
window.totalVentaVES = 0.00; 

window.rolActual = "Cajero 👤"; 
window.usuarioActivoNombre = "Sin Seleccionar";
window.categoriaCajaActiva = "Todas";

window.carrito = [];
window.productos = [];
window.ventasHistorico = [];
window.gastosCaja = [];
window.facturasEnEspera = [];
window.fiados = [];
window.usuariosCajeros = [{ id: 1, nombre: "Caja Principal", clave: "1234" }];
window.fondoCaja = { usd: 0, ves: 0 };
window.perfilNegocio = { 
    nombre: "GeoMercado", rif: "", dir: "", tlf: "", 
    pmBanco: "0102", pmCedula: "V12345678", pmTlf: "04121234567",
    cobrarIGTF: false
};

window.productoEnEdicion = null;
window.productoBalanzaTemp = null;
window.imagenComprimidaTemp = null;
window.ingredientesComboTemp = [];
window.fiadoEnAbonoIdx = null;
window.html5QrScannerInstancia = null;

// SONIDO BEEP PARA PISTOLA LÁSER Y CAJA
window.reproducirBeep = function(exito = true) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = exito ? "sine" : "sawtooth";
        osc.frequency.value = exito ? 1150 : 280;
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (exito ? 0.09 : 0.25));
    } catch(e) {}
};

function iniciarSistema() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    let codGuardado = localStorage.getItem('geomercado_codigo_corto') || "";
    let inputCod = document.getElementById('login-codigo-tienda');
    if (inputCod && codGuardado) inputCod.value = codGuardado;

    let inputAbono = document.getElementById('abono-monto-usd');
    if (inputAbono) {
        inputAbono.addEventListener('input', function() {
            let m = parseFloat(this.value) || 0;
            document.getElementById('abono-equiv-bs').innerText = "Equivalente: " + window.formatVE(m * window.tasaDia);
        });
    }

    let inputBalanza = document.getElementById('balanza-input-kg');
    if (inputBalanza) {
        inputBalanza.addEventListener('input', window.actualizarCalculoBalanza);
    }

    // ATAJOS DE TECLADO FÍSICO PARA PC / LAPTOP
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            window.cerrarCamaraEnVivo();
            return;
        }
        let enCaja = document.getElementById('modulo-caja') && document.getElementById('modulo-caja').style.display === 'flex';
        if (!enCaja) return;

        if (e.key === 'F2') {
            e.preventDefault();
            let busc = document.getElementById('buscador-caja');
            if (busc) { busc.focus(); busc.select(); }
        } else if (e.key === 'F4') {
            e.preventDefault();
            window.aparcarFactura();
        } else if (e.key === 'F8') {
            e.preventDefault();
            window.llenarMaximo('ptv');
        } else if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) {
            e.preventDefault();
            window.procesarCobro(false);
        }
    });

    window.suscribirTiendaFirebase(window.tiendaActivaID);
    if (navigator.onLine) window.obtenerTasaBCV(true);
}

document.addEventListener('DOMContentLoaded', iniciarSistema);

// CONEXIÓN DINÁMICA MULTI-TIENDA EN FIREBASE
window.suscribirTiendaFirebase = function(docId) {
    if (window.unsubscribeSnapshot) window.unsubscribeSnapshot();
    window.tiendaActivaID = docId;
    localStorage.setItem('geomercado_tienda_id', docId);

    let codMostrar = docId === "datos_globales" ? "GLOBAL" : docId.replace("tienda_", "");
    let elTxtCod = document.getElementById('txt-cod-tienda');
    let elAdminCod = document.getElementById('admin-box-codigo');
    if (elTxtCod) elTxtCod.innerText = codMostrar;
    if (elAdminCod) elAdminCod.innerText = codMostrar;

    window.unsubscribeSnapshot = onSnapshot(doc(db, "geomercado_tienda", docId), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            window.productos = data.productos || [];
            window.ventasHistorico = data.ventasHistorico || [];
            window.gastosCaja = data.gastosCaja || [];
            window.facturasEnEspera = data.facturasEnEspera || [];
            window.fiados = data.fiados || [];
            window.perfilNegocio = data.perfilNegocio || { nombre: "GeoMercado", pmBanco: "0102", pmCedula: "V12345678", pmTlf: "04121234567", cobrarIGTF: false };
            window.usuariosCajeros = data.usuariosCajeros || [{ id: 1, nombre: "Caja Principal", clave: "1234" }];
            window.fondoCaja = data.fondoCaja || { usd: 0, ves: 0 };
            if (data.tasaDia) window.tasaDia = data.tasaDia;

            window.sincronizarCamposAdminUI();
            window.actualizarOpcionesLogin();
            window.renderizarListaCajerosAdmin();
            window.verificarAlertasStock();
            window.actualizarBadgeRecuperar();

            if (document.getElementById('modulo-inventario').style.display === 'flex') window.renderizarInventario(document.getElementById('buscador-inventario').value);
            if (document.getElementById('modulo-cierre').style.display === 'flex') window.renderizarCierreDeCaja();
            if (document.getElementById('modulo-fiados').style.display === 'flex') window.renderizarFiados();
            if (document.getElementById('modulo-caja').style.display === 'flex') window.filtrarBuscadorCaja(document.getElementById('buscador-caja').value);
        } else {
            window.guardarEstructuraFirebase();
        }
    });
};

window.conectarCodigoTienda = function() {
    let raw = document.getElementById('login-codigo-tienda').value.trim().toUpperCase();
    if (!raw) { window.mostrarFeedbackAnimado('error', 'Ingresa un Código'); return; }
    localStorage.setItem('geomercado_codigo_corto', raw);
    let docId = (raw === "GLOBAL") ? "datos_globales" : "tienda_" + raw;
    window.suscribirTiendaFirebase(docId);
    window.mostrarToast("🔗 Conectado a tienda: " + raw);
};

window.guardarEstructuraFirebase = async function() {
    try {
        await setDoc(doc(db, "geomercado_tienda", window.tiendaActivaID), {
            productos: window.productos || [],
            ventasHistorico: window.ventasHistorico || [],
            gastosCaja: window.gastosCaja || [],
            facturasEnEspera: window.facturasEnEspera || [],
            fiados: window.fiados || [],
            perfilNegocio: window.perfilNegocio || {},
            usuariosCajeros: window.usuariosCajeros || [],
            fondoCaja: window.fondoCaja || { usd: 0, ves: 0 },
            tasaDia: window.tasaDia || 623.02
        });
    } catch (e) {
        console.warn("Guardado en caché local:", e);
    }
};

window.sincronizarConNube = async function() { await window.guardarEstructuraFirebase(); };

window.sincronizarCamposAdminUI = function() {
    document.getElementById('lbl-titulo-negocio').innerText = window.perfilNegocio.nombre || "GeoMercado";
    document.getElementById('cfg-nombre').value = window.perfilNegocio.nombre || "";
    document.getElementById('cfg-rif').value = window.perfilNegocio.rif || "";
    document.getElementById('cfg-tlf').value = window.perfilNegocio.tlf || "";
    document.getElementById('cfg-dir').value = window.perfilNegocio.dir || "";
    document.getElementById('cfg-pm-banco').value = window.perfilNegocio.pmBanco || "0102";
    document.getElementById('cfg-pm-cedula').value = window.perfilNegocio.pmCedula || "V12345678";
    document.getElementById('cfg-pm-tlf').value = window.perfilNegocio.pmTlf || "04121234567";
    let chkIgtf = document.getElementById('cfg-igtf');
    if (chkIgtf) chkIgtf.checked = !!window.perfilNegocio.cobrarIGTF;
    document.getElementById('input-fondo-usd').value = window.fondoCaja.usd || "";
    document.getElementById('input-fondo-ves').value = window.fondoCaja.ves || "";
    document.getElementById('input-tasa-global').value = window.tasaDia.toFixed(2);
};

// ALERTAS DE STOCK BAJO
window.verificarAlertasStock = function() {
    let bajos = window.productos.filter(p => p.tipo === 'unidad' && p.qty <= 5);
    let banner = document.getElementById('alerta-stock-menu');
    if (!banner) return;
    if (bajos.length > 0) {
        banner.style.display = 'block';
        banner.innerText = `⚠️ ALERTA DE STOCK: Tienes ${bajos.length} producto(s) agotándose (${bajos.slice(0,2).map(x=>x.nombre).join(', ')}...)`;
    } else {
        banner.style.display = 'none';
    }
};

// LOGIN Y GESTIÓN DE CAJEROS
window.toggleLoginMode = function(modo) {
    document.getElementById('form-login-cajero').style.display = (modo === 'admin') ? 'none' : 'block';
    document.getElementById('form-login-admin').style.display = (modo === 'admin') ? 'block' : 'none';
};

window.actualizarOpcionesLogin = function() {
    let selectC = document.getElementById('login-cajero-usuario');
    if(!selectC) return;
    selectC.innerHTML = "";
    window.usuariosCajeros.forEach(c => {
        let opt = document.createElement('option');
        opt.value = c.nombre; opt.innerText = c.nombre; selectC.appendChild(opt);
    });
};

window.ejecutarLoginCajero = function() {
    let cNom = document.getElementById('login-cajero-usuario').value;
    let pin = document.getElementById('login-pin').value.trim();
    let cajeroObj = window.usuariosCajeros.find(u => u.nombre === cNom);
    
    if(cajeroObj && cajeroObj.clave === pin) {
        window.rolActual = "Cajero 👤";
        window.usuarioActivoNombre = cNom;
        window.iniciarSesionExitosa();
    } else {
        window.reproducirBeep(false);
        window.mostrarFeedbackAnimado('error', 'PIN Incorrecto');
    }
};

window.ejecutarLoginAdmin = function() {
    let email = document.getElementById('login-email').value.trim();
    let pass = document.getElementById('login-pass-admin').value.trim();
    if(!email || !pass) { window.mostrarFeedbackAnimado('error', 'Faltan datos'); return; }

    window.mostrarToast("Autenticando negocio...");
    signInWithEmailAndPassword(auth, email, pass)
    .then((userCredential) => {
        let uidCorto = userCredential.user.uid.substring(0, 6).toUpperCase();
        localStorage.setItem('geomercado_codigo_corto', uidCorto);
        let inputCod = document.getElementById('login-codigo-tienda');
        if (inputCod) inputCod.value = uidCorto;

        window.suscribirTiendaFirebase("tienda_" + uidCorto);
        window.rolActual = "Administrador 👑";
        window.usuarioActivoNombre = "Administrador";
        window.iniciarSesionExitosa();
    })
    .catch(() => {
        window.reproducirBeep(false);
        window.mostrarFeedbackAnimado('error', 'Credenciales Inválidas');
    });
};

window.iniciarSesionExitosa = function() {
    window.reproducirBeep(true);
    document.getElementById('section-login').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    document.getElementById('txt-rol').innerText = window.usuarioActivoNombre + " (" + window.rolActual + ")";
    document.getElementById('login-pin').value = "";
    document.getElementById('login-pass-admin').value = "";
    window.volverAlMenu();
};

window.cerrarSesion = function() {
    if(window.rolActual === "Administrador 👑") signOut(auth).catch(() => {});
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('section-login').style.display = 'block';
};

window.guardarNuevoCajero = function() {
    let nom = document.getElementById('nuevo-cajero-nombre').value.trim();
    let clav = document.getElementById('nuevo-cajero-clave').value.trim();
    if(nom && clav) {
        window.usuariosCajeros.push({ id: Date.now(), nombre: nom, clave: clav });
        document.getElementById('nuevo-cajero-nombre').value = "";
        document.getElementById('nuevo-cajero-clave').value = "";
        window.actualizarOpcionesLogin();
        window.renderizarListaCajerosAdmin();
        window.sincronizarConNube();
        window.mostrarToast("✓ Cajero Agregado");
    } else {
        window.mostrarFeedbackAnimado('error', 'Ingresa Nombre y PIN');
    }
};

window.eliminarCajeroAdmin = function(id) {
    if (window.usuariosCajeros.length <= 1) { window.mostrarToast("Debe existir al menos 1 cajero"); return; }
    window.usuariosCajeros = window.usuariosCajeros.filter(u => u.id !== id);
    window.actualizarOpcionesLogin();
    window.renderizarListaCajerosAdmin();
    window.sincronizarConNube();
};

window.renderizarListaCajerosAdmin = function() {
    let box = document.getElementById('lista-cajeros-admin');
    if (!box) return;
    box.innerHTML = window.usuariosCajeros.map(u => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#0b0e14; padding:6px 10px; border-radius:6px; font-size:12px;">
            <span>👤 <strong>${window.escapeHTML(u.nombre)}</strong> (PIN: ${window.escapeHTML(u.clave)})</span>
            <button class="btn-remove-item" onclick="window.eliminarCajeroAdmin(${u.id})">X</button>
        </div>
    `).join('');
};

// TASA BCV
window.obtenerTasaBCV = function(silencioso) {
    if (!navigator.onLine) return;
    if(!silencioso) window.mostrarToast("📡 Consultando BCV...");

    fetch('https://ve.dolarapi.com/v1/dolares/oficial').then(res => res.json()).then(data => {
        if (data && data.promedio) {
            let valorBcv = parseFloat(data.promedio);
            if (!isNaN(valorBcv) && valorBcv > 0) return window.aplicarNuevaTasaBCV(valorBcv, silencioso);
        }
    }).catch(() => {});
};

window.aplicarNuevaTasaBCV = function(valor, silencioso) {
    window.tasaDia = valor;
    let inputTasa = document.getElementById('input-tasa-global');
    if (inputTasa) inputTasa.value = window.tasaDia.toFixed(2);
    localStorage.setItem('geomercado_tasa_v19', window.tasaDia);
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
    window.sincronizarConNube();
    if (!silencioso) window.mostrarFeedbackAnimado('exito', window.tasaDia.toFixed(2) + ' Bs');
};

// UTILIDADES UI
window.mostrarToast = function(mensaje) {
    let toast = document.getElementById('toast');
    if(!toast) return;
    toast.innerText = mensaje;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
};

window.mostrarFeedbackAnimado = function(tipo, msj) {
    let overlay = document.getElementById('scan-feedback');
    let box = document.getElementById('scan-feedback-box');
    let msgEl = document.getElementById('scan-feedback-msg');
    if(!overlay || !box || !msgEl) return;
    if(tipo === 'exito') { box.className = 'scan-feedback-box scan-feedback-success'; box.innerText = '✔'; } 
    else {
        box.className = 'scan-feedback-box scan-feedback-error'; box.innerText = '✖';
        document.body.classList.add('shake-effect');
        setTimeout(() => document.body.classList.remove('shake-effect'), 400);
    }
    msgEl.innerText = msj;
    overlay.style.display = 'flex';
    setTimeout(() => overlay.style.display = 'none', 1300);
};

window.mostrarConfirmacion = function(titulo, mensaje, accionAceptar) {
    let modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').innerText = titulo;
    document.getElementById('confirm-msg').innerText = mensaje;
    modal.style.display = 'flex';
    document.getElementById('confirm-btn-accept').onclick = function() {
        modal.style.display = 'none';
        if(typeof accionAceptar === 'function') accionAceptar();
    };
    document.getElementById('confirm-btn-cancel').onclick = () => modal.style.display = 'none';
};

window.escapeHTML = function(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

window.cambiarModulo = function(idModulo) {
    if((idModulo === 'modulo-admin' || idModulo === 'modulo-cierre') && window.rolActual !== "Administrador 👑") {
        window.mostrarFeedbackAnimado('error', 'Solo Administrador'); return;
    }
    document.getElementById('menu-principal').style.display = 'none';
    document.querySelectorAll('.modulo-app').forEach(m => m.style.display = 'none');
    
    let target = document.getElementById(idModulo);
    if(target) target.style.display = 'flex';
    
    if(idModulo === 'modulo-inventario') {
        document.getElementById('buscador-inventario').value = "";
        window.cancelarEdicion();
        window.renderizarInventario("");
    }
    if(idModulo === 'modulo-caja') {
        let busc = document.getElementById('buscador-caja');
        busc.value = "";
        window.categoriaCajaActiva = "Todas";
        window.filtrarBuscadorCaja(""); 
        window.renderizarCarritoCaja();
        window.actualizarBadgeRecuperar();
        setTimeout(() => busc.focus(), 200);
    }
    if(idModulo === 'modulo-cierre') window.renderizarCierreDeCaja();
    if(idModulo === 'modulo-fiados') window.renderizarFiados();
};

window.volverAlMenu = function() {
    document.querySelectorAll('.modulo-app').forEach(m => m.style.display = 'none');
    document.getElementById('menu-principal').style.display = 'flex';
    window.verificarAlertasStock();
};

window.mascaraMoneda = function(input) {
    let valor = input.value.replace(/\D/g, "");
    if(valor === "") { input.value = ""; return; }
    let numero = (parseFloat(valor) / 100).toFixed(2);
    let partes = numero.split('.');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    input.value = partes.join(',');
};

window.extraerNumeroLimpio = function(idInput) {
    let el = document.getElementById(idInput);
    if(!el || !el.value) return 0;
    return parseFloat(el.value.replace(/\./g, '').replace(',', '.')) || 0;
};

window.formatVE = function(monto) { return Number(monto || 0).toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' Bs'; };
window.formatUSD = function(monto) { return "$" + Number(monto || 0).toFixed(2); };

window.guardarFondoCaja = function() {
    window.fondoCaja.usd = parseFloat(document.getElementById('input-fondo-usd').value) || 0;
    window.fondoCaja.ves = parseFloat(document.getElementById('input-fondo-ves').value) || 0;
    window.sincronizarConNube();
    window.mostrarToast("Fondo guardado");
};

window.guardarPerfil = function() {
    window.perfilNegocio.nombre = document.getElementById('cfg-nombre').value || "GeoMercado";
    window.perfilNegocio.rif = document.getElementById('cfg-rif').value || "";
    window.perfilNegocio.tlf = document.getElementById('cfg-tlf').value || "";
    window.perfilNegocio.dir = document.getElementById('cfg-dir').value || "";
    window.perfilNegocio.pmBanco = (document.getElementById('cfg-pm-banco').value || "0102").replace(/\D/g, '');
    window.perfilNegocio.pmCedula = (document.getElementById('cfg-pm-cedula').value || "V12345678").toUpperCase().replace(/\s/g, '');
    window.perfilNegocio.pmTlf = (document.getElementById('cfg-pm-tlf').value || "04121234567").replace(/\D/g, '');
    let chkIgtf = document.getElementById('cfg-igtf');
    if (chkIgtf) window.perfilNegocio.cobrarIGTF = chkIgtf.checked;
    
    document.getElementById('lbl-titulo-negocio').innerText = window.perfilNegocio.nombre;
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
    window.sincronizarConNube();
    window.mostrarToast("Ajustes actualizados");
};

window.cambiarTasaManual = function(nuevaTasa) {
    window.tasaDia = parseFloat(nuevaTasa) || 623.02;
    localStorage.setItem('geomercado_tasa_v19', window.tasaDia);
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
    window.sincronizarConNube();
};

window.exportarProductosJSON = function() {
    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.productos, null, 2));
    let downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "inventario_geomercado.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
};

window.importarProductosJSON = function(event) {
    let fileReader = new FileReader();
    fileReader.onload = function(e) {
        try {
            let parsed = JSON.parse(e.target.result);
            if(Array.isArray(parsed)) {
                window.productos = parsed;
                window.renderizarInventario("");
                window.sincronizarConNube();
                window.mostrarToast("✓ Inventario cargado");
            }
        } catch(err) { window.mostrarFeedbackAnimado('error', 'Error archivo'); }
    };
    if(event.target.files && event.target.files[0]) fileReader.readAsText(event.target.files[0]);
};

window.calcularGanancia = function() {
    let costo = parseFloat(document.getElementById('prod-costo').value) || 0;
    let margen = parseFloat(document.getElementById('prod-margen').value) || 0;
    document.getElementById('lbl-precio-calc').innerText = "$" + (costo + (costo * (margen / 100))).toFixed(2);
};

// CONSTRUCTOR DE COMBOS E INVENTARIO
window.conmutarCampoCantidad = function(tipo) {
    let eQty = document.getElementById('prod-qty');
    let boxCombo = document.getElementById('box-constructor-combo');
    if(eQty) eQty.style.display = (tipo === 'unidad') ? 'block' : 'none';
    if(boxCombo) {
        if (tipo === 'combo') {
            boxCombo.style.display = 'block';
            window.llenarSelectIngredientesCombo();
        } else {
            boxCombo.style.display = 'none';
        }
    }
};

window.llenarSelectIngredientesCombo = function() {
    let sel = document.getElementById('combo-select-prod');
    if (!sel) return;
    sel.innerHTML = window.productos.filter(p => p.tipo === 'unidad').map(p => `<option value="${p.id}">${window.escapeHTML(p.nombre)} (Stock: ${p.qty})</option>`).join('');
};

window.agregarIngredienteCombo = function() {
    let idProd = parseInt(document.getElementById('combo-select-prod').value);
    let qty = parseInt(document.getElementById('combo-input-qty').value) || 1;
    let p = window.productos.find(x => x.id === idProd);
    if (!p || qty <= 0) return;

    let existente = window.ingredientesComboTemp.find(i => i.id === idProd);
    if (existente) existente.qty += qty;
    else window.ingredientesComboTemp.push({ id: p.id, nombre: p.nombre, qty: qty });
    window.renderizarIngredientesComboTemp();
};

window.quitarIngredienteCombo = function(idx) {
    window.ingredientesComboTemp.splice(idx, 1);
    window.renderizarIngredientesComboTemp();
};

window.renderizarIngredientesComboTemp = function() {
    let cont = document.getElementById('lista-ingredientes-combo');
    if (!cont) return;
    cont.innerHTML = window.ingredientesComboTemp.map((it, idx) => `
        <div style="display:flex; justify-content:space-between; background:#161a23; padding:4px 8px; border-radius:4px;">
            <span>• ${it.qty}x ${window.escapeHTML(it.nombre)}</span>
            <span style="color:#ff5252; cursor:pointer; font-weight:bold;" onclick="window.quitarIngredienteCombo(${idx})">✕</span>
        </div>
    `).join('');
};

// COMPRESOR DE IMÁGENES EN CANVAS
window.previsualizarImagenRegistro = function(event) {
    let file = event.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function(e) {
        let img = new Image();
        img.onload = function() {
            let canvas = document.createElement('canvas');
            let MAX_SIZE = 320;
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }
            canvas.width = width;
            canvas.height = height;
            let ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            window.imagenComprimidaTemp = canvas.toDataURL('image/jpeg', 0.72);
            
            let preview = document.getElementById('preview-img-upload');
            preview.src = window.imagenComprimidaTemp;
            preview.style.display = 'block';
            document.getElementById('lbl-img-upload').innerText = '✓ Foto Optimizada Lista';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

// VISOR DE IMAGEN EN GRANDE AL TOCAR
window.verImagenProducto = function(idProd) {
    let p = window.productos.find(x => x.id === idProd);
    if (!p) return;
    let precioFinalUSD = p.iva ? (p.precio * 1.16) : p.precio;
    document.getElementById('zoom-title').innerText = p.nombre;
    let imgEl = document.getElementById('zoom-img-src');
    imgEl.src = p.imagenUrl || "https://cdn-icons-png.flaticon.com/512/3081/3081559.png";
    
    let infoExtra = p.tipo === 'combo' && p.componentes ? `<br><small style="color:#00ff66;">Incluye: ${p.componentes.map(c=>c.qty+'x '+c.nombre).join(', ')}</small>` : '';
    document.getElementById('zoom-details').innerHTML = `
        <div style="font-size:18px; color:#00ff66; font-weight:bold;">${window.formatUSD(precioFinalUSD)} (${window.formatVE(precioFinalUSD * window.tasaDia)})</div>
        <div style="color:#8fa0b7; margin-top:4px;">Código/Serial: ${window.escapeHTML(p.serial || 'N/A')} | Stock: ${p.tipo === 'peso' ? 'Al Peso' : (p.tipo === 'combo' ? 'Combo' : p.qty + ' unds')}</div>
        ${infoExtra}
    `;
    let btnAdd = document.getElementById('zoom-btn-add');
    btnAdd.onclick = function() {
        window.agregarAlCarritoDesdeCaja(p.id);
        document.getElementById('modal-zoom-img').style.display = 'none';
    };
    document.getElementById('modal-zoom-img').style.display = 'flex';
};

window.editarProducto = function(id) {
    let p = window.productos.find(x => x.id === id);
    if(!p) return;
    
    window.productoEnEdicion = p.id;
    window.imagenComprimidaTemp = p.imagenUrl || null;
    window.ingredientesComboTemp = p.componentes ? p.componentes.slice() : [];

    document.getElementById('prod-name').value = p.nombre;
    document.getElementById('prod-costo').value = p.costo || 0;
    document.getElementById('prod-margen').value = p.margen || 0;
    document.getElementById('prod-cat').value = p.categoria || "Víveres";
    document.getElementById('prod-type').value = p.tipo || "unidad";
    document.getElementById('prod-qty').value = p.qty || 0;
    document.getElementById('prod-serial').value = p.serial || "";
    document.getElementById('prod-iva').checked = p.iva || false;
    
    let preview = document.getElementById('preview-img-upload');
    if (p.imagenUrl) {
        document.getElementById('lbl-img-upload').innerText = "📸 Cambiar Foto";
        preview.src = p.imagenUrl;
        preview.style.display = 'block';
    } else {
        document.getElementById('lbl-img-upload').innerText = "📸 Subir Foto";
        preview.style.display = 'none';
    }

    window.conmutarCampoCantidad(p.tipo);
    window.renderizarIngredientesComboTemp();
    window.calcularGanancia();
    
    document.getElementById('btn-guardar-prod').innerText = "Actualizar Producto";
    document.getElementById('btn-cancelar-edicion').style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.eliminarProductoCat = function(id) {
    window.mostrarConfirmacion("🗑️ Eliminar", "¿Borrar este producto del catálogo?", function() {
        window.productos = window.productos.filter(p => p.id !== id);
        window.renderizarInventario(document.getElementById('buscador-inventario').value);
        window.sincronizarConNube();
    });
};

window.cancelarEdicion = function() {
    window.productoEnEdicion = null;
    window.imagenComprimidaTemp = null;
    window.ingredientesComboTemp = [];
    document.getElementById('prod-name').value = "";
    document.getElementById('prod-costo').value = "";
    document.getElementById('prod-margen').value = "";
    document.getElementById('lbl-precio-calc').innerText = "$0.00";
    document.getElementById('prod-serial').value = "";
    document.getElementById('prod-qty').value = "";
    document.getElementById('prod-iva').checked = false;
    document.getElementById('prod-cat').value = "Víveres";
    document.getElementById('prod-type').value = "unidad";
    document.getElementById('prod-imagen-file').value = "";
    document.getElementById('lbl-img-upload').innerText = "📸 Subir Foto (Opcional)";
    document.getElementById('preview-img-upload').style.display = 'none';

    window.conmutarCampoCantidad("unidad");
    window.renderizarIngredientesComboTemp();
    document.getElementById('btn-guardar-prod').innerText = "Guardar Producto";
    document.getElementById('btn-cancelar-edicion').style.display = "none";
};

window.renderizarInventario = function(filtro) {
    let contenedor = document.getElementById('lista-productos');
    let formBox = document.getElementById('form-registro-prod');
    if(formBox) formBox.style.display = (window.rolActual === "Administrador 👑") ? "flex" : "none";
    if(!contenedor) return;

    let html = "";
    let textoFiltro = filtro ? filtro.toLowerCase() : "";

    window.productos.forEach(p => {
        if(textoFiltro && !p.nombre.toLowerCase().includes(textoFiltro) && !(p.serial && p.serial.includes(textoFiltro))) return;

        let esStockBajo = (p.tipo === 'unidad' && p.qty <= 5);
        let indicadorStock = p.tipo === 'peso' ? '<span class="badge-peso">⚖️ Al Peso</span>' : (p.tipo === 'combo' ? '<span style="color:#00ff66; font-size:11px;">🎁 Combo</span>' : `<span style="font-size:11px; color:${esStockBajo ? '#ff5252' : '#8fa0b7'}; font-weight:bold;">Stock: ${p.qty} unds ${esStockBajo ? '⚠️' : ''}</span>`);
        
        let iconoRender = p.imagenUrl 
            ? `<img src="${p.imagenUrl}" class="product-img" onclick="window.verImagenProducto(${p.id})" alt="IMG">` 
            : `<div class="product-emoji-placeholder" onclick="window.verImagenProducto(${p.id})">${p.tipo === 'peso' ? '🍎' : (p.tipo === 'combo' ? '🎁' : '📦')}</div>`;
            
        let stringIva = p.iva ? ' <span style="font-size:10px; color:#ff5252;">(+IVA)</span>' : '';
        let precioFinalUSD = p.iva ? (p.precio * 1.16) : p.precio;
        
        html += `<div class="product-card ${esStockBajo ? 'low-stock' : ''}">
            <div class="tag-cat">${window.escapeHTML(p.categoria || "General")}</div>
            ${iconoRender}
            <h4 onclick="window.verImagenProducto(${p.id})" style="cursor:pointer;">${window.escapeHTML(p.nombre)}${stringIva}</h4>
            <p style="color:#00ff66; margin:2px 0; font-weight:bold;">${window.formatUSD(precioFinalUSD)}</p>
            <p style="font-size:11px; color:#8fa0b7; margin-bottom:4px;">${window.formatVE(precioFinalUSD * window.tasaDia)}</p>
            ${indicadorStock}
            <div style="display:flex; gap:6px; margin-top:6px;">`;
            
        if(window.rolActual === "Administrador 👑") {
            html += `<button style="flex:1; background:#313c52; color:#fff; border:none; padding:6px; border-radius:6px; cursor:pointer;" onclick="window.editarProducto(${p.id})">✏️</button>
                     <button style="flex:1; background:#ff5252; color:#fff; border:none; padding:6px; border-radius:6px; cursor:pointer;" onclick="window.eliminarProductoCat(${p.id})">🗑️</button>`;
        }
        html += `<button style="flex:3; background:#00ff66; border:none; padding:6px; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="window.agregarAlCarritoDesdeCaja(${p.id})">➕ Facturar</button></div></div>`;
    });
    contenedor.innerHTML = html || '<div style="grid-column:1/-1; text-align:center; color:#8fa0b7; padding:20px;">No hay productos registrados en esta tienda.</div>';
};

window.agregarProductoNuevo = async function() {
    let name = document.getElementById('prod-name').value.trim();
    let costo = parseFloat(document.getElementById('prod-costo').value) || 0;
    let margen = parseFloat(document.getElementById('prod-margen').value) || 0;
    let price = costo + (costo * (margen / 100));
    let serial = document.getElementById('prod-serial').value.trim() || "";
    let type = document.getElementById('prod-type').value;
    let cat = document.getElementById('prod-cat').value;
    let qty = parseInt(document.getElementById('prod-qty').value) || 0;
    let aplicaIva = document.getElementById('prod-iva').checked;

    if(!name || price <= 0) { window.mostrarFeedbackAnimado('error', 'Ingresa Nombre y Costo'); return; }

    let objProd = {
        nombre: name, costo, margen, precio: price, tipo: type, categoria: cat,
        qty: type === 'unidad' ? qty : 0, serial, iva: aplicaIva,
        imagenUrl: window.imagenComprimidaTemp || null,
        componentes: type === 'combo' ? window.ingredientesComboTemp.slice() : []
    };

    if(window.productoEnEdicion !== null) {
        let p = window.productos.find(x => x.id === window.productoEnEdicion);
        if(p) Object.assign(p, objProd);
        window.mostrarToast("✓ Producto Actualizado");
    } else {
        objProd.id = Date.now();
        window.productos.push(objProd);
        window.mostrarToast("✓ Producto Guardado");
    }
    
    window.cancelarEdicion();
    window.renderizarInventario("");
    await window.sincronizarConNube();
};

// DETECTOR DE PISTOLA LÁSER Y CATEGORÍAS TÁCTILES EN CAJA
window.seleccionarCategoriaCaja = function(cat, btnEl) {
    window.categoriaCajaActiva = cat;
    document.querySelectorAll('.cat-tab-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    window.filtrarBuscadorCaja(document.getElementById('buscador-caja').value);
};

window.detectarPistolaLaser = function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        let codigo = event.target.value.trim();
        if (!codigo) return;

        let matchExacto = window.productos.find(p => p.serial && p.serial.toLowerCase() === codigo.toLowerCase());
        if (matchExacto) {
            window.agregarAlCarritoDesdeCaja(matchExacto.id);
            event.target.value = "";
            window.filtrarBuscadorCaja("");
        } else {
            let coincidencias = window.productos.filter(p => p.nombre.toLowerCase().includes(codigo.toLowerCase()));
            if (coincidencias.length === 1) {
                window.agregarAlCarritoDesdeCaja(coincidencias[0].id);
                event.target.value = "";
                window.filtrarBuscadorCaja("");
            } else {
                window.reproducirBeep(false);
                window.mostrarFeedbackAnimado('error', 'Serial no encontrado');
                event.target.select();
            }
        }
    }
};

window.filtrarBuscadorCaja = function(texto) {
    let contenedor = document.getElementById('resultados-busqueda-caja');
    if (!contenedor) return;
    let html = ""; let encontrados = 0;
    let textoFiltro = texto ? texto.toLowerCase().trim() : "";

    window.productos.forEach(p => {
        let disponible = (p.tipo === 'peso' || p.qty > 0 || p.tipo === 'combo');
        if (!disponible) return;

        if (window.categoriaCajaActiva !== "Todas") {
            if (window.categoriaCajaActiva === "Combos" && p.tipo !== "combo") return;
            if (window.categoriaCajaActiva !== "Combos" && p.categoria !== window.categoriaCajaActiva) return;
        }

        if(!textoFiltro || p.nombre.toLowerCase().includes(textoFiltro) || (p.serial && p.serial.toLowerCase().includes(textoFiltro))) {
            let precioFinalUSD = p.iva ? (p.precio * 1.16) : p.precio;
            let miniatura = p.imagenUrl 
                ? `<img src="${p.imagenUrl}" onclick="event.stopPropagation(); window.verImagenProducto(${p.id})" class="pos-item-thumb">` 
                : `<div onclick="event.stopPropagation(); window.verImagenProducto(${p.id})" class="pos-item-emoji">${p.tipo==='combo'?'🎁':(p.tipo==='peso'?'⚖️':'📦')}</div>`;
            
            html += `<div class="btn-search-result" onclick="window.agregarAlCarritoDesdeCaja(${p.id})">
                <div class="pos-card-inner">${miniatura} <span class="pos-item-title">${window.escapeHTML(p.nombre)}</span></div>
                <div class="pos-item-price">${window.formatUSD(precioFinalUSD)} <small style="color:#8fa0b7; font-weight:normal; display:block; font-size:9px;">${window.formatVE(precioFinalUSD * window.tasaDia)}</small></div>
            </div>`;
            encontrados++;
        }
    });
    contenedor.innerHTML = encontrados === 0 ? '<div style="grid-column:1/-1; color:#8fa0b7; font-size:12px; text-align:center; padding:12px;">Sin productos en esta vista</div>' : html;
};

// BALANZA DIGITAL PROPIA (SIN PROMPT DEL NAVEGADOR)
window.abrirModalBalanza = function(prodObj) {
    window.productoBalanzaTemp = prodObj;
    let precioFinalUSD = prodObj.iva ? (prodObj.precio * 1.16) : prodObj.precio;
    document.getElementById('balanza-prod-nombre').innerText = `⚖️ ${prodObj.nombre} (${window.formatUSD(precioFinalUSD)} / Kg)`;
    let inputKg = document.getElementById('balanza-input-kg');
    inputKg.value = "1.00";
    window.actualizarCalculoBalanza();
    document.getElementById('modal-balanza').style.display = 'flex';
    setTimeout(() => { inputKg.focus(); inputKg.select(); }, 150);
};

window.fijarPesoRapido = function(kg) {
    document.getElementById('balanza-input-kg').value = kg.toFixed(3);
    window.actualizarCalculoBalanza();
};

window.actualizarCalculoBalanza = function() {
    if (!window.productoBalanzaTemp) return;
    let kg = parseFloat(document.getElementById('balanza-input-kg').value) || 0;
    let precioUnitario = window.productoBalanzaTemp.iva ? (window.productoBalanzaTemp.precio * 1.16) : window.productoBalanzaTemp.precio;
    let subUSD = precioUnitario * kg;
    document.getElementById('balanza-subtotal-calc').innerText = `Total: ${window.formatUSD(subUSD)} (${window.formatVE(subUSD * window.tasaDia)})`;
};

window.confirmarPesoBalanza = function() {
    let p = window.productoBalanzaTemp;
    if (!p) return;
    let kilos = parseFloat(document.getElementById('balanza-input-kg').value);
    if (isNaN(kilos) || kilos <= 0) { window.mostrarFeedbackAnimado('error', 'Peso inválido'); return; }

    let precioUnitarioCalculado = p.iva ? (p.precio * 1.16) : p.precio;
    let costoUnitarioCalculado = p.costo || 0;

    window.carrito.push({ 
        id: p.id, nombre: p.nombre, 
        totalUSD: precioUnitarioCalculado * kilos, 
        costoTotalUSD: costoUnitarioCalculado * kilos, 
        detalle: kilos + ' kg', tipo: p.tipo, qtyVenta: kilos, 
        precioUnitario: precioUnitarioCalculado, costoUnitario: costoUnitarioCalculado, 
        imagenUrl: p.imagenUrl 
    });

    document.getElementById('modal-balanza').style.display = 'none';
    window.productoBalanzaTemp = null;
    window.reproducirBeep(true);
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
};

window.agregarAlCarritoDesdeCaja = function(idProd) {
    let p = window.productos.find(x => x.id == idProd);
    if(!p) return;

    let precioUnitarioCalculado = p.iva ? (p.precio * 1.16) : p.precio;
    let costoUnitarioCalculado = p.costo || 0;

    if(p.tipo === 'peso') {
        window.abrirModalBalanza(p);
        return;
    } else if (p.tipo === 'combo') {
        if (p.componentes && p.componentes.length > 0) {
            for (let comp of p.componentes) {
                let prodReal = window.productos.find(x => x.id === comp.id);
                if (!prodReal || prodReal.qty < comp.qty) {
                    window.reproducirBeep(false);
                    window.mostrarFeedbackAnimado('error', 'Falta Stock de: ' + comp.nombre);
                    return;
                }
            }
            p.componentes.forEach(comp => {
                let prodReal = window.productos.find(x => x.id === comp.id);
                if (prodReal) prodReal.qty -= comp.qty;
            });
            window.sincronizarConNube();
        }
        let item = window.carrito.find(c => c.id === p.id);
        if (item) {
            item.qtyVenta += 1; item.totalUSD += precioUnitarioCalculado; item.costoTotalUSD += costoUnitarioCalculado; item.detalle = item.qtyVenta + ' unds';
        } else {
            window.carrito.push({ id: p.id, nombre: p.nombre, totalUSD: precioUnitarioCalculado, costoTotalUSD: costoUnitarioCalculado, detalle: '1 unds', tipo: 'combo', qtyVenta: 1, precioUnitario: precioUnitarioCalculado, costoUnitario: costoUnitarioCalculado, imagenUrl: p.imagenUrl, componentes: p.componentes });
        }
    } else {
        if(p.qty < 1) { window.reproducirBeep(false); window.mostrarFeedbackAnimado('error', 'Sin Stock'); return; }
        let item = window.carrito.find(c => c.id === p.id && c.tipo === 'unidad');
        p.qty -= 1;
        window.sincronizarConNube();

        if(item) {
            item.qtyVenta += 1; item.totalUSD += precioUnitarioCalculado; item.costoTotalUSD += costoUnitarioCalculado; item.detalle = item.qtyVenta + ' unds';
        } else {
            window.carrito.push({ id: p.id, nombre: p.nombre, totalUSD: precioUnitarioCalculado, costoTotalUSD: costoUnitarioCalculado, detalle: '1 unds', tipo: p.tipo, qtyVenta: 1, precioUnitario: precioUnitarioCalculado, costoUnitario: costoUnitarioCalculado, imagenUrl: p.imagenUrl });
        }
    }
    
    window.reproducirBeep(true);
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
};

window.sumarItem = function(index) {
    let item = window.carrito[index];
    if(item.tipo === 'peso') return; 
    window.agregarAlCarritoDesdeCaja(item.id);
};

window.restarItem = function(index) {
    let item = window.carrito[index];
    if(item.tipo === 'peso') return;

    if(item.tipo === 'unidad') {
        let p = window.productos.find(x => x.id === item.id);
        if(p) p.qty += 1;
    } else if (item.tipo === 'combo' && item.componentes) {
        item.componentes.forEach(comp => {
            let prodReal = window.productos.find(x => x.id === comp.id);
            if(prodReal) prodReal.qty += comp.qty;
        });
    }
    window.sincronizarConNube();

    item.qtyVenta -= 1;
    item.totalUSD -= item.precioUnitario;
    item.costoTotalUSD -= item.costoUnitario;
    item.detalle = item.qtyVenta + ' unds';

    if(item.qtyVenta <= 0) window.carrito.splice(index, 1);
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
};

window.eliminarDelCarrito = function(index) {
    let item = window.carrito[index];
    if(item.tipo === 'unidad') {
        let p = window.productos.find(x => x.id === item.id);
        if(p) p.qty += item.qtyVenta;
    } else if (item.tipo === 'combo' && item.componentes) {
        item.componentes.forEach(comp => {
            let prodReal = window.productos.find(x => x.id === comp.id);
            if(prodReal) prodReal.qty += (comp.qty * item.qtyVenta);
        });
    }
    window.sincronizarConNube();
    window.carrito.splice(index, 1);
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
};

window.recalcularTotalesCarrito = function() {
    window.subtotalVentaUSD = window.carrito.reduce((sum, item) => sum + item.totalUSD, 0);
    let usdFisico = parseFloat(document.getElementById('pay-usd')?.value) || 0;
    
    if (window.perfilNegocio.cobrarIGTF && usdFisico > 0) {
        let baseImponible = Math.min(usdFisico, window.subtotalVentaUSD);
        window.montoIGTF_USD = baseImponible * 0.03;
    } else {
        window.montoIGTF_USD = 0.00;
    }

    window.totalVentaUSD = window.subtotalVentaUSD + window.montoIGTF_USD;
    window.totalVentaVES = window.totalVentaUSD * window.tasaDia;
};

window.renderizarCarritoCaja = function() {
    let container = document.getElementById('items-carrito-factura');
    if(!container) return;
    
    if(window.carrito.length === 0) {
        container.innerHTML = '<div style="color:#57687e; text-align:center; font-size:12px; padding:8px;">Ningún artículo en cuenta.</div>';
    } else {
        let html = "";
        window.carrito.forEach((item, i) => {
            let miniatura = item.imagenUrl 
                ? `<img src="${item.imagenUrl}" class="cart-item-img" onclick="window.verImagenProducto(${item.id})" alt="IMG">` 
                : `<div class="cart-item-emoji" onclick="window.verImagenProducto(${item.id})">${item.tipo === 'peso' ? '🍎' : (item.tipo === 'combo' ? '🎁' : '📦')}</div>`;

            html += `<div class="cart-item">
                <div style="display:flex; align-items:center; gap:8px; flex:1;">
                    ${miniatura}
                    <div>
                        <div style="line-height:1.2;">${window.escapeHTML(item.nombre)}</div>
                        <small style="color:#8fa0b7;">${window.formatVE(item.totalUSD * window.tasaDia)}</small>
                    </div>
                </div>`;
            
            if (item.tipo === 'unidad' || item.tipo === 'combo') {
                html += `<div style="display:flex; align-items:center; gap:6px; margin-right:10px;">
                    <button class="btn-qty" onclick="window.restarItem(${i})">-</button>
                    <span style="font-weight:bold; font-size:14px;">${item.qtyVenta}</span>
                    <button class="btn-qty" onclick="window.sumarItem(${i})">+</button>
                </div>`;
            } else {
                html += `<div style="margin-right:10px; color:#8fa0b7; font-size:11px;">${window.escapeHTML(item.detalle)}</div>`;
            }
            html += `<div style="display:flex; align-items:center;">
                <strong>${window.formatUSD(item.totalUSD)}</strong>
                <button class="btn-remove-item" onclick="window.eliminarDelCarrito(${i})">X</button>
            </div></div>`;
        });
        container.innerHTML = html;
    }

    window.calcularCaja();
};

window.toggleMetodoPago = function(idContenedor, btn) {
    let el = document.getElementById(idContenedor);
    if(!el) return;
    el.classList.toggle('show');
    btn.classList.toggle('active');
};

window.actualizarEtiquetasPago = function() {
    document.getElementById('label-monto-ptv').innerText = window.formatVE(window.extraerNumeroLimpio('pay-ptv'));
    document.getElementById('label-monto-pm').innerText = window.formatVE(window.extraerNumeroLimpio('pay-pm'));
    document.getElementById('label-monto-usd').innerText = "$" + (parseFloat(document.getElementById('pay-usd').value) || 0).toFixed(2);
    document.getElementById('label-monto-ves').innerText = window.formatVE(window.extraerNumeroLimpio('pay-ves'));
};

window.llenarMaximo = function(tipo) {
    let ptv = window.extraerNumeroLimpio('pay-ptv');
    let pm = window.extraerNumeroLimpio('pay-pm');
    let usd = parseFloat(document.getElementById('pay-usd').value) || 0; 
    let ves = window.extraerNumeroLimpio('pay-ves');

    let ingresadoActual = ptv + pm + (usd * window.tasaDia) + ves;
    if(tipo === 'ptv') ingresadoActual -= ptv;
    if(tipo === 'pm') ingresadoActual -= pm;
    if(tipo === 'ves') ingresadoActual -= ves;
    if(tipo === 'usd') ingresadoActual -= (usd * window.tasaDia);

    let faltanteVES = Math.max(0, (window.subtotalVentaUSD * window.tasaDia) - ingresadoActual);

    if(tipo === 'usd') {
        document.getElementById('pay-usd').value = Math.ceil(faltanteVES / window.tasaDia);
    } else {
        let input = document.getElementById('pay-' + tipo);
        input.value = Math.round(faltanteVES * 100).toString();
        window.mascaraMoneda(input);
    }
    window.actualizarEtiquetasPago();
    window.calcularCaja();
};

window.calcularCaja = function() {
    window.recalcularTotalesCarrito();

    document.getElementById('grand-total-usd').innerText = window.formatUSD(window.totalVentaUSD);
    let vesEl = document.getElementById('grand-total-ves');
    if(vesEl) vesEl.innerText = window.formatVE(window.totalVentaVES);

    let rowIgtf = document.getElementById('row-igtf-info');
    if (rowIgtf) {
        if (window.montoIGTF_USD > 0) {
            rowIgtf.style.display = 'flex';
            document.getElementById('val-igtf-ves').innerText = `+ ${window.formatVE(window.montoIGTF_USD * window.tasaDia)} (${window.formatUSD(window.montoIGTF_USD)})`;
        } else {
            rowIgtf.style.display = 'none';
        }
    }

    let ptv = window.extraerNumeroLimpio('pay-ptv');
    let pm = window.extraerNumeroLimpio('pay-pm');
    let usd = parseFloat(document.getElementById('pay-usd').value) || 0; 
    let ves = window.extraerNumeroLimpio('pay-ves');

    let totalRec = ptv + pm + (usd * window.tasaDia) + ves;
    let dif = window.totalVentaVES - totalRec;

    document.getElementById('total-recibido-ves').innerText = window.formatVE(totalRec);
    let eRestante = document.getElementById('total-restante-ves');
    
    if (dif > 0.01) {
        eRestante.innerText = window.formatVE(dif) + ' Restante';
        eRestante.style.color = '#ff5252';
    } else if (dif < -0.01) {
        let vueltoUSD = Math.abs(dif) / window.tasaDia;
        let dEntregar = Math.min(Math.floor(vueltoUSD), Math.floor(usd));
        let bsRestante = (vueltoUSD - dEntregar) * window.tasaDia;
        eRestante.innerText = dEntregar > 0 ? `Vuelto: $ ${dEntregar} + ${bsRestante.toLocaleString('es-VE', {maximumFractionDigits:2})} Bs` : `Vuelto: ${bsRestante.toLocaleString('es-VE', {maximumFractionDigits:2})} Bs`;
        eRestante.style.color = '#00ff66';
    } else {
        eRestante.innerText = '0,00 Bs Completo';
        eRestante.style.color = '#00ff66';
    }
};

window.procesarCobro = function(imprimirTicket) {
    if(window.carrito.length === 0) { window.mostrarFeedbackAnimado('error', 'Carrito Vacío'); return; }
    
    let venta = {
        id: Date.now(),
        fecha: new Date().toLocaleString(),
        items: window.carrito.slice(),
        subtotalUSD: window.subtotalVentaUSD,
        igtfUSD: window.montoIGTF_USD,
        totalUSD: window.totalVentaUSD,
        totalVES: window.totalVentaVES,
        costoUSD: window.carrito.reduce((sum, c) => sum + (c.costoTotalUSD || 0), 0),
        ptv: window.extraerNumeroLimpio('pay-ptv'), 
        pm: window.extraerNumeroLimpio('pay-pm'), 
        usd: parseFloat(document.getElementById('pay-usd').value) || 0, 
        ves: window.extraerNumeroLimpio('pay-ves'),
        cajero: window.usuarioActivoNombre,
        cliente: document.getElementById('cliente-nombre').value, 
        cedula: document.getElementById('cliente-cedula').value, 
        dir: document.getElementById('cliente-dir').value, 
        tlf: document.getElementById('pm-phone').value
    };
    
    window.ventasHistorico.push(venta);
    window.sincronizarConNube();
    window.reproducirBeep(true);
    window.mostrarFeedbackAnimado('exito', 'Venta Cobrada');
    if(imprimirTicket) window.imprimirTicket(window.ventasHistorico.length - 1);
    window.limpiarCaja(true); 
};

window.limpiarCaja = function(silencioso) {
    if(!silencioso) {
        window.carrito.forEach(c => {
            if(c.tipo === 'unidad') {
                let p = window.productos.find(x => x.id === c.id);
                if(p) p.qty += c.qtyVenta;
            } else if (c.tipo === 'combo' && c.componentes) {
                c.componentes.forEach(comp => {
                    let prodReal = window.productos.find(x => x.id === comp.id);
                    if(prodReal) prodReal.qty += (comp.qty * c.qtyVenta);
                });
            }
        });
        window.sincronizarConNube();
        window.mostrarToast("Venta cancelada, stock devuelto");
    }

    window.subtotalVentaUSD = 0; window.montoIGTF_USD = 0; window.totalVentaUSD = 0; window.totalVentaVES = 0; window.carrito = [];
    ['pay-ptv','pay-pm','pay-usd','pay-ves','cliente-nombre','cliente-cedula','cliente-dir','pm-phone','pm-ref'].forEach(id => {
        let el = document.getElementById(id);
        if(el) el.value = '';
    });
    document.getElementById('modal-cliente').style.display='none';
    let banner = document.getElementById('pm-status-banner');
    if(banner) banner.style.display = 'none';

    window.actualizarEtiquetasPago();
    window.renderizarCarritoCaja();
};

// FACTURAS EN ESPERA CON MODAL VISUAL PROPIO
window.actualizarBadgeRecuperar = function() {
    let btn = document.getElementById('btn-top-recuperar');
    if (btn) {
        let cant = window.facturasEnEspera.length;
        btn.innerHTML = cant > 0 ? `📂 Recuperar <span style="background:#ffc107; color:#000; padding:1px 5px; border-radius:8px; margin-left:3px;">${cant}</span>` : `📂 Recuperar`;
    }
};

window.aparcarFactura = function() {
    if(window.carrito.length === 0) { window.mostrarFeedbackAnimado('error', 'Carrito Vacío'); return; }
    window.facturasEnEspera.push({
        id: Date.now(),
        hora: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        cliente: document.getElementById('cliente-nombre').value || "Cliente Mostrador",
        items: window.carrito.slice(),
        totalUSD: window.totalVentaUSD,
        totalVES: window.totalVentaVES,
        cajero: window.usuarioActivoNombre
    });
    window.sincronizarConNube();
    window.limpiarCaja(true);
    window.actualizarBadgeRecuperar();
    window.mostrarToast("⏸️ Factura Pausada");
};

window.recuperarFactura = function() {
    if(window.facturasEnEspera.length === 0) { window.mostrarFeedbackAnimado('error', 'No hay cuentas pausadas'); return; }
    let cont = document.getElementById('lista-facturas-pausadas');
    cont.innerHTML = window.facturasEnEspera.map((f, i) => `
        <div class="cierre-card" style="margin-bottom:4px; border-color:#313c52;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:#00ff66; font-size:13px;">👤 ${window.escapeHTML(f.cliente)}</strong>
                <small style="color:#8fa0b7;">🕒 ${f.hora || ''} | 🏷️ ${window.escapeHTML(f.cajero)}</small>
            </div>
            <div style="font-size:11px; color:#8fa0b7; margin:4px 0;">${f.items.map(x=>x.qtyVenta+'x '+x.nombre).join(', ')}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <strong style="color:#fff; font-size:14px;">${window.formatVE(f.totalVES)} (${window.formatUSD(f.totalUSD)})</strong>
                <div style="display:flex; gap:6px;">
                    <button class="btn-remove-item" onclick="window.descartarFacturaPausada(${i})">🗑️</button>
                    <button class="btn-charge" style="padding:6px 12px;" onclick="window.cargarFacturaPausadaEnCaja(${i})">Retomar</button>
                </div>
            </div>
        </div>
    `).join('');
    document.getElementById('modal-recuperar').style.display = 'flex';
};

window.cargarFacturaPausadaEnCaja = function(idx) {
    if(window.carrito.length > 0) { window.mostrarFeedbackAnimado('error', 'Limpia o cobra la cuenta actual primero'); return; }
    let rec = window.facturasEnEspera.splice(idx, 1)[0];
    if (rec) {
        window.carrito = rec.items;
        document.getElementById('cliente-nombre').value = rec.cliente !== "Cliente Mostrador" ? rec.cliente : "";
        document.getElementById('modal-recuperar').style.display = 'none';
        window.recalcularTotalesCarrito();
        window.renderizarCarritoCaja();
        window.actualizarBadgeRecuperar();
        window.sincronizarConNube();
        window.mostrarToast("📂 Cuenta Retomada");
    }
};

window.descartarFacturaPausada = function(idx) {
    let rec = window.facturasEnEspera.splice(idx, 1)[0];
    if (rec && rec.items) {
        rec.items.forEach(c => {
            if(c.tipo === 'unidad') {
                let p = window.productos.find(x => x.id === c.id);
                if(p) p.qty += c.qtyVenta;
            }
        });
    }
    window.actualizarBadgeRecuperar();
    window.sincronizarConNube();
    if (window.facturasEnEspera.length === 0) document.getElementById('modal-recuperar').style.display = 'none';
    else window.recuperarFactura();
    window.mostrarToast("Cuenta descartada y stock devuelto");
};

// CONTROL DE GASTOS MENORES / SALIDAS DE CAJA CHICA
window.abrirModalGasto = function() {
    document.getElementById('gasto-motivo').value = "";
    document.getElementById('gasto-monto').value = "";
    document.getElementById('modal-gasto').style.display = 'flex';
};

window.confirmarGastoCaja = function() {
    let motivo = document.getElementById('gasto-motivo').value.trim();
    let moneda = document.getElementById('gasto-moneda').value;
    let monto = parseFloat(document.getElementById('gasto-monto').value) || 0;

    if (!motivo || monto <= 0) { window.mostrarFeedbackAnimado('error', 'Ingresa motivo y monto'); return; }

    window.gastosCaja.push({
        id: Date.now(),
        fecha: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        motivo: motivo,
        moneda: moneda,
        monto: monto,
        cajero: window.usuarioActivoNombre
    });

    document.getElementById('modal-gasto').style.display = 'none';
    window.sincronizarConNube();
    window.mostrarToast("💸 Salida de caja registrada");
};

window.eliminarGastoCaja = function(idx) {
    window.gastosCaja.splice(idx, 1);
    window.sincronizarConNube();
    window.renderizarCierreDeCaja();
};

// FIADOS CON MODAL PROPIO Y ABONOS PARCIALES
window.registrarFiado = function() {
    if(window.carrito.length === 0) { window.mostrarFeedbackAnimado('error', 'Carrito Vacío'); return; }
    document.getElementById('fiado-input-nombre').value = document.getElementById('cliente-nombre').value || "";
    document.getElementById('fiado-input-tlf').value = document.getElementById('pm-phone').value || "";
    document.getElementById('fiado-lbl-total').innerText = `Monto a Fiar: ${window.formatUSD(window.totalVentaUSD)} (${window.formatVE(window.totalVentaVES)})`;
    document.getElementById('modal-nuevo-fiado').style.display = 'flex';
};

window.confirmarNuevoFiado = function() {
    let nom = document.getElementById('fiado-input-nombre').value.trim();
    let tlf = document.getElementById('fiado-input-tlf').value.trim();
    if (!nom) { window.mostrarFeedbackAnimado('error', 'Escribe el nombre del cliente'); return; }

    window.fiados.push({
        id: Date.now(), cliente: nom, tlf: tlf,
        montoUSD: window.totalVentaUSD, items: window.carrito.slice(), fecha: new Date().toLocaleString(),
        abonos: []
    });
    document.getElementById('modal-nuevo-fiado').style.display = 'none';
    window.sincronizarConNube();
    window.limpiarCaja(true);
    window.mostrarToast("✓ Cuenta guardada en Fiados");
};

window.renderizarFiados = function() {
    let cont = document.getElementById('lista-fiados-container');
    if(!cont) return;
    if(window.fiados.length === 0) {
        cont.innerHTML = "<div style='text-align:center; color:#8fa0b7; font-size:12px; padding:10px;'>No hay deudas pendientes.</div>";
        return;
    }

    cont.innerHTML = window.fiados.map((f, idx) => {
        let histAbonos = (f.abonos && f.abonos.length) 
            ? `<div style="font-size:10px; color:#8fa0b7; background:#0b0e14; padding:6px; border-radius:6px; margin-top:4px;">Abonos: ${f.abonos.map(a=>`$${a.usd.toFixed(2)} (${a.fecha})`).join(' | ')}</div>` 
            : '';
        return `
        <div class="cierre-card">
            <h4 style="color:#ffc107; margin:0; border-color:#ffc107;">👤 ${window.escapeHTML(f.cliente)}</h4>
            <div class="cierre-item">Fecha: <span>${f.fecha}</span></div>
            <div class="cierre-item">Deuda Restante ($): <span>$${f.montoUSD.toFixed(2)}</span></div>
            <div class="cierre-item" style="color:#00ff66; font-size:13px;">Al Dólar Hoy: <span style="color:#00ff66;">${window.formatVE(f.montoUSD * window.tasaDia)}</span></div>
            ${histAbonos}
            <div style="display:flex; gap:6px; margin-top:8px;">
                <button class="btn-fiar" onclick="window.abrirModalAbono(${idx})">💵 ABONAR PARTE</button>
                <button class="btn-charge" onclick="window.cobrarFiado(${idx})">✓ SALDAR TODO</button>
            </div>
        </div>`;
    }).join('');
};

window.abrirModalAbono = function(idx) {
    let f = window.fiados[idx];
    if (!f) return;
    window.fiadoEnAbonoIdx = idx;
    document.getElementById('abono-cliente-info').innerText = `Cliente: ${f.cliente} | Deuda Actual: $${f.montoUSD.toFixed(2)}`;
    document.getElementById('abono-monto-usd').value = "";
    document.getElementById('abono-equiv-bs').innerText = "Equivalente: 0,00 Bs";
    document.getElementById('modal-abono').style.display = 'flex';
};

window.confirmarAbonoFiado = function() {
    let f = window.fiados[window.fiadoEnAbonoIdx];
    if (!f) return;
    let abonoUSD = parseFloat(document.getElementById('abono-monto-usd').value) || 0;
    let metodo = document.getElementById('abono-metodo').value;

    if (abonoUSD <= 0 || abonoUSD > f.montoUSD + 0.01) {
        window.mostrarFeedbackAnimado('error', 'Monto inválido');
        return;
    }

    let abonoVES = abonoUSD * window.tasaDia;
    f.montoUSD -= abonoUSD;
    if (!f.abonos) f.abonos = [];
    f.abonos.push({ usd: abonoUSD, fecha: new Date().toLocaleDateString() });

    window.ventasHistorico.push({
        id: Date.now(),
        fecha: new Date().toLocaleString(),
        items: [{ nombre: `Abono Deuda (${f.cliente})`, qtyVenta: 1, precioUnitario: abonoUSD, totalUSD: abonoUSD }],
        totalUSD: abonoUSD,
        totalVES: abonoVES,
        costoUSD: 0,
        ptv: metodo === 'ptv' ? abonoVES : 0,
        pm: metodo === 'pm' ? abonoVES : 0,
        ves: metodo === 'ves' ? abonoVES : 0,
        usd: metodo === 'usd' ? abonoUSD : 0,
        cajero: window.usuarioActivoNombre,
        cliente: f.cliente
    });

    if (f.montoUSD <= 0.01) {
        window.fiados.splice(window.fiadoEnAbonoIdx, 1);
        window.mostrarToast("✓ Deuda Saldada por Completo");
    } else {
        window.mostrarToast("✓ Abono registrado en Caja");
    }

    document.getElementById('modal-abono').style.display = 'none';
    window.sincronizarConNube();
    window.renderizarFiados();
};

window.cobrarFiado = function(idx) {
    let f = window.fiados[idx];
    if (!f) return;
    window.fiadoEnAbonoIdx = idx;
    document.getElementById('abono-monto-usd').value = f.montoUSD.toFixed(2);
    window.confirmarAbonoFiado();
};

// CÁMARA Y ESCÁNER
window.abrirCamaraEnVivo = function(modo) {
    if (typeof Html5Qrcode === 'undefined') { window.mostrarFeedbackAnimado('error', 'Cargando escáner...'); return; }
    document.getElementById('modal-camara').style.display = 'flex';
    
    if(window.html5QrScannerInstancia) {
        window.html5QrScannerInstancia.stop().then(() => {
            window.html5QrScannerInstancia.clear();
            window.iniciarCamaraInstancia(modo);
        }).catch(() => window.iniciarCamaraInstancia(modo));
    } else {
        window.iniciarCamaraInstancia(modo);
    }
};

window.iniciarCamaraInstancia = function(modo) {
    window.html5QrScannerInstancia = new Html5Qrcode("interactive-scanner");
    window.html5QrScannerInstancia.start(
        { facingMode: "environment" }, { fps: 12, qrbox: { width: 230, height: 130 } },
        text => {
            window.cerrarCamaraEnVivo();
            if(modo === 'registro') {
                window.reproducirBeep(true);
                document.getElementById('prod-serial').value = text;
                window.mostrarFeedbackAnimado('exito', 'Código Leído');
            } else {
                let match = window.productos.find(p => p.serial === text);
                if(match) { window.mostrarFeedbackAnimado('exito', match.nombre); window.agregarAlCarritoDesdeCaja(match.id); }
                else { window.reproducirBeep(false); window.mostrarFeedbackAnimado('error', 'No Registrado'); }
            }
        }, err => {}
    ).catch(() => {
        window.cerrarCamaraEnVivo();
        document.getElementById(modo === 'registro' ? 'file-barcode-reg' : 'file-barcode-caja').click();
    });
};

window.cerrarCamaraEnVivo = function() {
    if(window.html5QrScannerInstancia) {
        try {
            window.html5QrScannerInstancia.stop().then(() => {
                window.html5QrScannerInstancia.clear();
                window.html5QrScannerInstancia = null;
            }).catch(()=>{});
        } catch(e){}
    }
    document.getElementById('modal-camara').style.display = 'none';
};

window.escanearBarcodeFoto = function(e, modo) {
    let file = e.target.files[0];
    if(!file || typeof Html5Qrcode === 'undefined') return;
    new Html5Qrcode("hidden-qr-reader").scanFile(file, true).then(text => {
        if(modo === 'registro') {
            window.reproducirBeep(true);
            document.getElementById('prod-serial').value = text;
            window.mostrarFeedbackAnimado('exito', 'Leído');
        } else {
            let match = window.productos.find(p => p.serial === text);
            if(match) window.agregarAlCarritoDesdeCaja(match.id);
            else { window.reproducirBeep(false); window.mostrarFeedbackAnimado('error', 'No Registrado'); }
        }
    }).catch(() => window.mostrarFeedbackAnimado('error', 'Fallo lectura'));
};

window.generarQRPagoMovil = function() {
    if(window.totalVentaVES <= 0) { window.mostrarFeedbackAnimado('error', 'Agrega productos'); return; }
    let b = window.perfilNegocio.pmBanco.padStart(4, '0'), c = window.perfilNegocio.pmCedula, t = window.perfilNegocio.pmTlf;
    let qrStr = `pagoMovil:v1?banco=${b}&cedula=${c}&telefono=${t}&monto=${window.totalVentaVES.toFixed(2)}`;
    document.getElementById('img-qr-code').src = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(qrStr);
    
    document.getElementById('qr-text-info').innerText = `🏢 ${window.perfilNegocio.nombre}\n🏦 Banco: ${b}\n🪪 CI: ${c}\n📞 Tlf: ${t}\n💵 Monto: ${window.totalVentaVES.toFixed(2)} Bs`;
    document.getElementById('modal-qr').style.display = 'flex';
};

window.enviarQRPorWS = function() {
    let tlf = document.getElementById('pm-phone').value.replace(/\D/g, '');
    let msj = "📲 *DATOS PAGO MÓVIL*\n\n" + document.getElementById('qr-text-info').innerText;
    window.open(tlf ? `https://api.whatsapp.com/send?phone=${tlf}&text=${encodeURIComponent(msj)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msj)}`, '_blank');
};

// CIERRE DE CAJA CON GASTOS, GRÁFICAS Y ESTADÍSTICAS
window.renderizarCierreDeCaja = function() {
    let tPM = 0, tUSD = 0, tVES = 0, tPTV = 0, tVUSD = 0, tCUSD = 0;
    let gastosUSD = 0, gastosVES = 0;
    let conteoProd = {};

    window.gastosCaja.forEach(g => {
        if (g.moneda === 'usd') gastosUSD += g.monto;
        else gastosVES += g.monto;
    });

    let html = window.ventasHistorico.map((v, i) => {
        tPM += v.pm; tUSD += v.usd; tVES += v.ves; tPTV += v.ptv; 
        tVUSD += v.totalUSD; tCUSD += (v.costoUSD || 0);

        if (v.items) {
            v.items.forEach(it => {
                conteoProd[it.nombre] = (conteoProd[it.nombre] || 0) + (it.qtyVenta || 1);
            });
        }

        return `<div class="cierre-card">
            <div style="display:flex; justify-content:space-between;"><h4>🛒 ${v.fecha} (${v.cajero || 'Caja'})</h4></div>
            ${v.cliente ? `<div style="color:#fff; font-size:11px; margin-bottom:4px;">Cliente: ${window.escapeHTML(v.cliente)}</div>` : ''}
            <div class="cierre-item">Total Factura: <span style="font-size:14px; color:#00ff66;">${window.formatVE(v.totalVES)}</span></div>
            <div style="display:flex; gap:6px; margin-top:8px;">
                <button style="flex:1; background:#fff; color:#000; font-weight:bold; border:none; padding:6px; border-radius:6px;" onclick="window.imprimirTicket(${i})">🖨️ Ticket</button>
                <button style="flex:1; background:#ff5252; color:#fff; font-weight:bold; border:none; padding:6px; border-radius:6px;" onclick="window.anularVenta(${i})">❌ Anular</button>
            </div></div>`;
    }).join('');
    
    document.getElementById('lista-historial-ventas').innerHTML = html || '<div style="text-align:center; color:#57687e; font-size:12px;">Sin ventas registradas hoy.</div>';
    document.getElementById('resumen-ptv').innerText = window.formatVE(tPTV);
    document.getElementById('resumen-pm').innerText = window.formatVE(tPM);
    document.getElementById('resumen-ves').innerText = window.formatVE(tVES);
    document.getElementById('resumen-ganancia-ves').innerText = window.formatVE((tVUSD - tCUSD) * window.tasaDia);
    document.getElementById('resumen-efectivo-usd').innerText = "$" + tUSD.toFixed(2);
    
    document.getElementById('cierre-fondo-usd').innerText = "$" + window.fondoCaja.usd.toFixed(2);
    document.getElementById('cierre-fondo-ves').innerText = window.formatVE(window.fondoCaja.ves);
    document.getElementById('cierre-gastos-usd').innerText = "- $" + gastosUSD.toFixed(2);
    document.getElementById('cierre-gastos-ves').innerText = "- " + window.formatVE(gastosVES);

    document.getElementById('esperado-usd').innerText = "$" + (window.fondoCaja.usd + tUSD - gastosUSD).toFixed(2);
    document.getElementById('esperado-ves').innerText = window.formatVE(window.fondoCaja.ves + tVES - gastosVES);

    let boxGastos = document.getElementById('lista-gastos-cierre');
    if (boxGastos) {
        boxGastos.innerHTML = window.gastosCaja.length === 0 
            ? '<div style="color:#57687e; font-size:11px; text-align:center;">Sin salidas de caja chica hoy.</div>'
            : window.gastosCaja.map((g, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; background:#0b0e14; padding:6px 8px; border-radius:6px;">
                    <span>💸 <strong>${window.escapeHTML(g.motivo)}</strong> (${g.cajero})</span>
                    <div>
                        <strong style="color:#ff5252; margin-right:6px;">-${g.moneda === 'usd' ? '$' + g.monto.toFixed(2) : window.formatVE(g.monto)}</strong>
                        <button class="btn-remove-item" onclick="window.eliminarGastoCaja(${idx})">X</button>
                    </div>
                </div>
            `).join('');
    }

    let maxPagoBs = Math.max(tPTV + tPM + tVES, 1);
    document.getElementById('bar-ptv').style.width = Math.round((tPTV / maxPagoBs) * 100) + "%";
    document.getElementById('bar-pm').style.width = Math.round((tPM / maxPagoBs) * 100) + "%";
    document.getElementById('bar-ves').style.width = Math.round((tVES / maxPagoBs) * 100) + "%";

    let topArr = Object.entries(conteoProd).sort((a,b) => b[1] - a[1]).slice(0, 5);
    let maxQty = topArr.length ? topArr[0][1] : 1;
    let boxTop = document.getElementById('grafico-top-productos');
    if (topArr.length === 0) {
        boxTop.innerHTML = '<div style="color:#57687e; font-size:11px; text-align:center;">Aún no hay datos suficientes.</div>';
    } else {
        boxTop.innerHTML = topArr.map(([nom, cant]) => `
            <div>
                <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                    <span>${window.escapeHTML(nom)}</span>
                    <strong style="color:#00ff66;">${cant} vendidos</strong>
                </div>
                <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${Math.round((cant/maxQty)*100)}%; background:#00ff66;"></div></div>
            </div>
        `).join('');
    }
};

window.anularVenta = function(idx) {
    window.mostrarConfirmacion("❌ Anular Venta", "¿Deseas anular esta venta y devolver stock?", function() {
        window.ventasHistorico[idx].items.forEach(it => {
            if(it.tipo === 'unidad') {
                let p = window.productos.find(x => x.id === it.id);
                if(p) p.qty += it.qtyVenta;
            }
        });
        window.ventasHistorico.splice(idx, 1);
        window.sincronizarConNube();
        window.renderizarCierreDeCaja();
        window.mostrarToast("Venta anulada");
    });
};

window.borrarHistorial = function() {
    window.mostrarConfirmacion("⚠️ Reiniciar Día", "¿Borrar todas las ventas y gastos de hoy?", function() {
        window.ventasHistorico = [];
        window.gastosCaja = [];
        window.sincronizarConNube();
        window.renderizarCierreDeCaja();
    });
};

window.imprimirCierreZ = function() {
    let pw = window.open('', '_blank');
    if(!pw) return;
    let html = `<html><head><style>body{font-family:monospace; width:280px; padding:10px; font-size:12px; color:#000;} .center{text-align:center;} .line{border-bottom:1px dashed #000; margin:5px 0;} .row{display:flex; justify-content:space-between;}</style></head>
    <body><div class="center"><strong>${window.escapeHTML(window.perfilNegocio.nombre)}</strong><br>REPORTE Z<br>${new Date().toLocaleString()}</div><div class="line"></div>`;
    html += `<div class="row"><span>Transacciones:</span><span>${window.ventasHistorico.length}</span></div>`;
    html += `<div class="row"><span>Gastos Registrados:</span><span>${window.gastosCaja.length}</span></div>`;
    html += `<div class="line"></div><div class="center">Firma Responsable</div><script>window.onload=function(){window.print();window.close();}<\/script></body></html>`;
    pw.document.write(html); pw.document.close();
};

window.imprimirTicket = function(idx) {
    let v = window.ventasHistorico[idx];
    if(!v) return;
    let pw = window.open('', '_blank');
    if(!pw) return;
    let itemsStr = v.items.map(it => `<div>${window.escapeHTML(it.nombre)}</div><div class="row"><span>${it.qtyVenta || it.detalle} x ${window.formatUSD(it.precioUnitario)}</span><span>${window.formatVE(it.totalUSD * window.tasaDia)}</span></div>`).join('');
    let igtfStr = v.igtfUSD && v.igtfUSD > 0 ? `<div class="row"><span>IGTF (3% Divisas):</span><span>${window.formatVE(v.igtfUSD * window.tasaDia)}</span></div>` : '';
    let html = `<html><head><style>body{font-family:monospace; width:280px; padding:10px; font-size:12px; color:#000;} .center{text-align:center;} .line{border-bottom:1px dashed #000; margin:5px 0;} .row{display:flex; justify-content:space-between;}</style></head>
    <body><div class="center"><strong>${window.escapeHTML(window.perfilNegocio.nombre)}</strong><br>Fecha: ${v.fecha}<br>Cajero: ${v.cajero || 'Caja'}</div><div class="line"></div>
    ${itemsStr}<div class="line"></div>
    ${igtfStr}
    <div class="row"><strong>TOTAL:</strong><strong>${window.formatVE(v.totalVES)}</strong></div>
    <div class="center">¡Gracias por su compra!</div><script>window.onload=function(){window.print();window.close();}<\/script></body></html>`;
    pw.document.write(html); pw.document.close();
};

window.escanearCapturePagoCompleto = function(e) {
    if (typeof Tesseract === 'undefined') { window.mostrarToast("Cargando OCR..."); return; }
    let input = e.target;
    if (!input.files || !input.files[0]) return;
    
    document.getElementById('pm-ref').value = "Leyendo Capture...";
    let overlay = document.getElementById('scan-feedback');
    document.getElementById('scan-feedback-box').innerHTML = '⏳';
    document.getElementById('scan-feedback-msg').innerText = 'Procesando...';
    overlay.style.display = 'flex';

    Tesseract.recognize(input.files[0], 'spa').then(res => {
        overlay.style.display = 'none';
        let matchMonto = res.data.text.match(/([\d\.]+,\d{2})\s*Bs/i) || res.data.text.match(/(?:bs|monto)?[.\s]*([\d.]+,\d{2})/i);
        document.getElementById('pm-ref').value = res.data.text.match(/\d{6,12}/) ? res.data.text.match(/\d{6,12}/)[0] : "Manual";
        
        if(matchMonto) {
            let val = parseFloat(matchMonto[1].replace(/\./g, '').replace(',', '.'));
            if(!isNaN(val)) {
                let p = document.getElementById('pay-pm');
                p.value = Math.round(val * 100).toString();
                window.mascaraMoneda(p);
                window.actualizarEtiquetasPago();
                window.calcularCaja();
            }
        }
    }).catch(() => {
        overlay.style.display = 'none';
        window.mostrarFeedbackAnimado('error', 'Fallo lectura');
    });
};
