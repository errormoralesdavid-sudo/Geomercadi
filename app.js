// =========================================================================
// GEOMERCADO POS - APP.JS (PARTE 1 DE 2)
// =========================================================================
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

// Bloquear recarga accidental al deslizar hacia abajo en Android/Tablet
try {
    document.documentElement.style.overscrollBehaviorY = "contain";
    document.body.style.overscrollBehaviorY = "contain";
} catch(e) {}

// =========================================================================
// BÓVEDA DUAL PARA GEMINI (GRATIS + PAGO CON FAILOVER)
// =========================================================================
const SECRET_SALT = "GM_POS_VZLA_2026";
const DEFAULT_VAULT_CIPHER = "Bgx/NAcna197Z2Z4Y10BfF59eSc1bQo9dW5rVDFxIQI1Ewo6d2ZrAjc2bRo8eWUIH1ZmZw==";

window.ofuscarClave = function(textoPlano) {
    if (!textoPlano) return "";
    try {
        let xor = "";
        for (let i = 0; i < textoPlano.length; i++) {
            xor += String.fromCharCode(textoPlano.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length));
        }
        return btoa(xor);
    } catch(e) { return ""; }
};

window.desofuscarClave = function(textoCifrado) {
    if (!textoCifrado) return "";
    try {
        let raw = atob(textoCifrado);
        let plano = "";
        for (let i = 0; i < raw.length; i++) {
            plano += String.fromCharCode(raw.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length));
        }
        return plano;
    } catch(e) { return ""; }
};

window.obtenerGeminiKeyPrincipal = function() {
    if (window.perfilNegocio && window.perfilNegocio.geminiKeyCifrada) {
        let k = window.desofuscarClave(window.perfilNegocio.geminiKeyCifrada);
        if (k && k.trim().length > 10) return k.trim();
    }
    let localK = localStorage.getItem('geomercado_gemini_vault_' + window.tiendaActivaID);
    if (localK) {
        let kLocal = window.desofuscarClave(localK);
        if (kLocal && kLocal.trim().length > 10) return kLocal.trim();
    }
    return window.desofuscarClave(DEFAULT_VAULT_CIPHER).trim();
};

window.obtenerGeminiKeyRespaldoPago = function() {
    if (window.perfilNegocio && window.perfilNegocio.geminiKeyPagoCifrada) {
        let k = window.desofuscarClave(window.perfilNegocio.geminiKeyPagoCifrada);
        if (k && k.trim().length > 10) return k.trim();
    }
    let localKPago = localStorage.getItem('geomercado_gemini_vault_pago_' + window.tiendaActivaID);
    if (localKPago) {
        let kLocal = window.desofuscarClave(localKPago);
        if (kLocal && kLocal.trim().length > 10) return kLocal.trim();
    }
    return "";
};

// =========================================================================
// VARIABLES GLOBALES MULTI-TIENDA Y CANDADO ANTI-DOBLE TOQUE
// =========================================================================
window.tiendaActivaID = localStorage.getItem('geomercado_tienda_id') || "datos_globales";
window.unsubscribeSnapshot = null;
window.datosNubeCargados = false;
window.procesandoOperacion = false;

window.tasaDia = parseFloat(localStorage.getItem('geomercado_tasa_v19')) || 887.30;
window.subtotalVentaUSD = 0.00;
window.montoIGTF_USD = 0.00;
window.totalVentaUSD = 0.00;
window.totalVentaVES = 0.00; 

window.rolActual = "Cajero"; 
window.usuarioActivoNombre = "Sin Seleccionar";
window.categoriaCajaActiva = "Todas";

window.carrito = [];
window.productos = [];
window.ventasHistorico = [];
window.gastosCaja = [];
window.facturasEnEspera = [];
window.fiados = [];
window.colaRecordatorios = [];
window.usuariosCajeros = [{ id: 1, nombre: "Caja Principal", clave: "1234" }];
window.fondoCaja = { usd: 0, ves: 0 };
window.perfilNegocio = { 
    nombre: "GeoMercado", rif: "", dir: "", tlf: "", 
    pmBanco: "0102", pmCedula: "V12345678", pmTlf: "04121234567",
    cobrarIGTF: false,
    ticketSize: "58mm",
    ticketFooter: "¡Gracias por su compra! Revise su mercancía.",
    geminiKeyCifrada: DEFAULT_VAULT_CIPHER,
    geminiKeyPagoCifrada: "",
    geminiModoMotor: "auto"
};

window.productoEnEdicion = null;
window.productoBalanzaTemp = null;
window.prodStockRapidoId = null;
window.imagenComprimidaTemp = null;
window.ingredientesComboTemp = [];
window.itemsFacturaProveedorTemp = [];
window.fiadoEnAbonoIdx = null;
window.html5QrScannerInstancia = null;
window.reconocimientoVozActivo = null;

window.temporizadorInactividad = null;
window.TIEMPO_REPOSO_MS = 3 * 60 * 1000;
window.impresoraBTDevice = null;
window.impresoraBTCharacteristic = null;

// Buffer para pistola láser sin abrir teclado virtual
window.laserBuffer = "";
window.laserLastKeyTime = 0;

// =========================================================================
// ESCUDO GLOBAL ANTI-DOBLE TOQUE (BLOQUEA TOQUES REPETIDOS AL INSTANTE)
// =========================================================================
window.ejecutarAccionSegura = async function(mensajeCarga, fnAsync) {
    if (window.procesandoOperacion) return;
    window.procesandoOperacion = true;

    let overlay = document.getElementById('action-lock-overlay');
    let msgEl = document.getElementById('action-lock-msg');
    if (msgEl) msgEl.innerText = mensajeCarga || "⏳ Procesando operación...";
    if (overlay) overlay.style.display = 'flex';

    try {
        await fnAsync();
    } catch (err) {
        console.error("Error en operación protegida:", err);
    } finally {
        setTimeout(() => {
            if (overlay) overlay.style.display = 'none';
            window.procesandoOperacion = false;
        }, 420);
    }
};

// =========================================================================
// RESTAURACIÓN INMEDIATA DE CACHÉ LOCAL (MODO OFFLINE COMPLETO)
// =========================================================================
window.cargarRespaldoLocalTienda = function(docId) {
    try {
        let raw = localStorage.getItem('geomercado_backup_' + docId);
        if (raw) {
            let b = JSON.parse(raw);
            if (Array.isArray(b.productos)) window.productos = b.productos;
            if (Array.isArray(b.ventasHistorico)) window.ventasHistorico = b.ventasHistorico;
            if (Array.isArray(b.gastosCaja)) window.gastosCaja = b.gastosCaja;
            if (Array.isArray(b.facturasEnEspera)) window.facturasEnEspera = b.facturasEnEspera;
            if (Array.isArray(b.fiados)) window.fiados = b.fiados;
            if (Array.isArray(b.usuariosCajeros) && b.usuariosCajeros.length > 0) window.usuariosCajeros = b.usuariosCajeros;
            if (b.fondoCaja) window.fondoCaja = b.fondoCaja;
            if (b.perfilNegocio) window.perfilNegocio = Object.assign(window.perfilNegocio, b.perfilNegocio);
            if (b.tasaDia && b.tasaDia > 0) window.tasaDia = b.tasaDia;
        }
    } catch(e) {}
};

// =========================================================================
// SONIDO BEEP Y FEEDBACK FÍSICO
// =========================================================================
window.reproducirBeep = function(exito = true) {
    try { if (navigator.vibrate) navigator.vibrate(exito ? 45 : [130, 70, 160]); } catch(e) {}
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

// =========================================================================
// MODO REPOSO (AHORRO BATERÍA)
// =========================================================================
window.actualizarRelojScreensaver = function() {
    let elClock = document.getElementById('screensaver-clock');
    let elTasa = document.getElementById('screensaver-tasa');
    if (elClock) elClock.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (elTasa) elTasa.innerText = `BCV: ${window.formatVE(window.tasaDia)}`;
};

window.activarModoReposo = function() {
    let appVisible = document.getElementById('app-content') && document.getElementById('app-content').style.display !== 'none';
    if (!appVisible) return;
    let overlay = document.getElementById('screensaver-overlay');
    if (overlay) {
        window.actualizarRelojScreensaver();
        overlay.style.display = 'flex';
    }
};

window.despertarPantalla = function() {
    let overlay = document.getElementById('screensaver-overlay');
    if (overlay && overlay.style.display !== 'none') {
        overlay.style.display = 'none';
        try { if (navigator.vibrate) navigator.vibrate(25); } catch(e) {}
    }
    window.reiniciarTemporizadorInactividad();
};

window.reiniciarTemporizadorInactividad = function() {
    if (window.temporizadorInactividad) clearTimeout(window.temporizadorInactividad);
    window.temporizadorInactividad = setTimeout(window.activarModoReposo, window.TIEMPO_REPOSO_MS);
};

// =========================================================================
// IMPRESIÓN BLUETOOTH ESC/POS (SOPORTA 58MM Y 80MM)
// =========================================================================
window.conectarImpresoraBluetooth = async function() {
    if (!navigator.bluetooth) { window.mostrarFeedbackAnimado('warning', 'Bluetooth no compatible'); return; }
    try {
        window.mostrarToast("🔍 Buscando ticketera...");
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
        });
        const server = await device.gatt.connect();
        const services = await server.getPrimaryServices();
        let writeChar = null;
        for (let service of services) {
            const chars = await service.getCharacteristics();
            for (let c of chars) {
                if (c.properties.write || c.properties.writeWithoutResponse) { writeChar = c; break; }
            }
            if (writeChar) break;
        }
        if (!writeChar) throw new Error("Sin puerto ESC/POS");

        window.impresoraBTDevice = device;
        window.impresoraBTCharacteristic = writeChar;
        let elStatus = document.getElementById('bt-printer-status');
        if (elStatus) {
            elStatus.style.color = '#00ff66';
            elStatus.innerText = `✔ Conectada: ${device.name || 'Ticketera'}`;
        }
        window.reproducirBeep(true);
        window.mostrarToast("🖨️ Ticketera Bluetooth vinculada");
    } catch (err) {
        window.mostrarToast("Modo impresión estándar activo");
    }
};

window.limpiarTextoESCPOS = function(str) {
    return String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\n]/g, "");
};

window.enviarTextoImpresoraBT = async function(textoTicket) {
    if (!window.impresoraBTCharacteristic) return false;
    try {
        const encoder = new TextEncoder();
        const initCmd = new Uint8Array([0x1B, 0x40]);
        const textBytes = encoder.encode(window.limpiarTextoESCPOS(textoTicket) + "\n\n\n\n");
        const payload = new Uint8Array(initCmd.length + textBytes.length);
        payload.set(initCmd, 0); payload.set(textBytes, initCmd.length);
        const CHUNK = 100;
        for (let i = 0; i < payload.length; i += CHUNK) {
            const slice = payload.slice(i, i + CHUNK);
            if (window.impresoraBTCharacteristic.properties.writeWithoutResponse) {
                await window.impresoraBTCharacteristic.writeValueWithoutResponse(slice);
            } else {
                await window.impresoraBTCharacteristic.writeValue(slice);
            }
        }
        return true;
    } catch (e) {
        window.impresoraBTCharacteristic = null;
        return false;
    }
};

window.probarImpresoraBluetooth = async function() {
    let ancho = (window.perfilNegocio.ticketSize === "80mm") ? 46 : 32;
    let sep = "=".repeat(ancho);
    let texto = `${sep}\n${window.centrarTextoTicket(window.perfilNegocio.nombre || 'GEOMERCADO', ancho)}\n${window.centrarTextoTicket('PRUEBA DE IMPRESORA (' + (window.perfilNegocio.ticketSize || '58mm') + ')', ancho)}\n${window.centrarTextoTicket('Tasa BCV: ' + window.tasaDia.toFixed(2) + ' Bs', ancho)}\n${sep}\nEstado: OK\n`;
    let impresoBT = await window.enviarTextoImpresoraBT(texto);
    if (impresoBT) window.mostrarToast("🧾 Ticket enviado por Bluetooth");
    else window.mostrarFeedbackAnimado('warning', 'Vincula Ticketera BT en Ajustes');
};

// =========================================================================
// INICIO DEL SISTEMA, BOTÓN ATRÁS NATIVO Y SESIÓN PERSISTENTE
// =========================================================================
function iniciarSistema() {
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js').catch(() => {}); }
    
    let codGuardado = localStorage.getItem('geomercado_codigo_corto') || "";
    let inputCod = document.getElementById('login-codigo-tienda');
    if (inputCod && codGuardado) {
        inputCod.value = codGuardado;
        if (codGuardado !== "GLOBAL") {
            window.tiendaActivaID = "tienda_" + codGuardado;
            localStorage.setItem('geomercado_tienda_id', window.tiendaActivaID);
        }
    }

    window.cargarRespaldoLocalTienda(window.tiendaActivaID);
    window.actualizarBadgeRecuperar();
    window.aplicarEtiquetasCreditoUI();

    let inputAbono = document.getElementById('abono-monto-usd');
    if (inputAbono) {
        inputAbono.addEventListener('input', function() {
            let m = parseFloat(this.value) || 0;
            let eq = document.getElementById('abono-equiv-bs');
            if (eq) eq.innerText = "Equivalente: " + window.formatVE(m * window.tasaDia);
        });
    }

    let inputBalanza = document.getElementById('balanza-input-kg');
    if (inputBalanza) inputBalanza.addEventListener('input', window.actualizarCalculoBalanza);

    ['click', 'touchstart', 'keydown', 'mousemove'].forEach(evt => {
        document.addEventListener(evt, window.reiniciarTemporizadorInactividad, { passive: true });
    });
    window.reiniciarTemporizadorInactividad();
    setInterval(window.actualizarRelojScreensaver, 15000);

    // CONTROL DEL BOTÓN "ATRÁS" FÍSICO DE ANDROID / TABLET (EVITA SALIR DEL SISTEMA)
    window.history.replaceState({ vista: 'raiz' }, '');
    window.addEventListener('popstate', function() {
        let modalesAbiertos = Array.from(document.querySelectorAll('.modal-overlay')).filter(m => m.style.display !== 'none' && m.id !== 'action-lock-overlay');
        if (modalesAbiertos.length > 0) {
            modalesAbiertos.forEach(m => m.style.display = 'none');
            window.cerrarCamaraEnVivo();
            window.detenerAsistenteVoz();
            window.history.pushState({ vista: 'interna' }, '');
            return;
        }
        let algunModuloAbierto = Array.from(document.querySelectorAll('.modulo-app')).some(m => m.style.display === 'flex');
        if (algunModuloAbierto) {
            window.volverAlMenu(true);
            window.history.pushState({ vista: 'menu' }, '');
            return;
        }
        let appVisible = document.getElementById('app-content') && document.getElementById('app-content').style.display !== 'none';
        if (appVisible) {
            window.history.pushState({ vista: 'menu' }, '');
        }
    });

    // ATAJOS PC Y LECTOR DE PISTOLA LÁSER SIN ABRIR TECLADO EN TABLET
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            window.cerrarCamaraEnVivo();
            window.detenerAsistenteVoz();
            return;
        }
        let enCaja = document.getElementById('modulo-caja') && document.getElementById('modulo-caja').style.display === 'flex';
        if (!enCaja) return;

        if (e.key === 'F2') { e.preventDefault(); let busc = document.getElementById('buscador-caja'); if (busc) { busc.focus(); busc.select(); } return; }
        else if (e.key === 'F4') { e.preventDefault(); window.aparcarFactura(); return; }
        else if (e.key === 'F8') { e.preventDefault(); window.llenarMaximo('ptv'); return; }
        else if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); window.procesarCobro(false); return; }

        // Detectar disparos de Pistola Láser aunque el buscador no tenga el foco
        let tagActivo = document.activeElement ? document.activeElement.tagName : '';
        if (tagActivo !== 'INPUT' && tagActivo !== 'TEXTAREA' && tagActivo !== 'SELECT') {
            let ahora = Date.now();
            if (ahora - window.laserLastKeyTime > 120) window.laserBuffer = "";
            window.laserLastKeyTime = ahora;

            if (e.key === 'Enter' && window.laserBuffer.length >= 3) {
                e.preventDefault();
                let codigoDisparado = window.laserBuffer.trim();
                window.laserBuffer = "";
                let match = window.productos.find(p => p.serial && p.serial.toLowerCase() === codigoDisparado.toLowerCase());
                if (match) {
                    window.agregarAlCarritoDesdeCaja(match.id);
                } else {
                    window.reproducirBeep(false);
                    window.mostrarFeedbackAnimado('warning', 'Código no registrado');
                }
            } else if (e.key.length === 1) {
                window.laserBuffer += e.key;
            }
        }
    });

    window.addEventListener('online', window.actualizarBarraSuperiorUI);
    window.addEventListener('offline', window.actualizarBarraSuperiorUI);
    setInterval(window.actualizarBarraSuperiorUI, 2000);

    window.suscribirTiendaFirebase(window.tiendaActivaID);

    // RESTAURAR SESIÓN ACTIVA SI EL USUARIO RECARGÓ LA PÁGINA POR ACCIDENTE
    try {
        let sesionGuardada = localStorage.getItem('geomercado_sesion_activa');
        if (sesionGuardada) {
            let s = JSON.parse(sesionGuardada);
            if (s && s.rol && s.usuario) {
                window.rolActual = s.rol;
                window.usuarioActivoNombre = s.usuario;
                document.getElementById('section-login').style.display = 'none';
                document.getElementById('app-content').style.display = 'block';
                document.getElementById('txt-rol').innerText = window.rolActual;
                window.history.pushState({ vista: 'menu' }, '');
                window.volverAlMenu(true);
            }
        }
    } catch(e) {}

    if (navigator.onLine) window.obtenerTasaBCV(true);
}

document.addEventListener('DOMContentLoaded', iniciarSistema);

// Renombrar dinámicamente "Fiado" a "Crédito" en botones para mayor profesionalismo
window.aplicarEtiquetasCreditoUI = function() {
    let btnFiadoCaja = document.getElementById('btn-action-fiado');
    if (btnFiadoCaja) btnFiadoCaja.innerHTML = '📒 Crédito';
    document.querySelectorAll('.btn-menu').forEach(b => {
        if (b.innerHTML.includes('Fiados')) {
            b.innerHTML = '<span class="icon">📒</span>Créditos / Cuentas';
        }
    });
};

// =========================================================================
// CONEXIÓN DINÁMICA FIREBASE CON PROTECCIÓN DE HISTORIAL Y FACTURAS PAUSADAS
// =========================================================================
window.suscribirTiendaFirebase = function(docId) {
    if (window.unsubscribeSnapshot) window.unsubscribeSnapshot();
    window.tiendaActivaID = docId;
    window.datosNubeCargados = false;
    localStorage.setItem('geomercado_tienda_id', docId);

    window.cargarRespaldoLocalTienda(docId);

    let codMostrar = docId === "datos_globales" ? "GLOBAL" : docId.replace("tienda_", "");
    let elTxtCod = document.getElementById('txt-cod-tienda');
    let elAdminCod = document.getElementById('admin-box-codigo');
    if (elTxtCod) elTxtCod.innerText = codMostrar;
    if (elAdminCod) elAdminCod.innerText = codMostrar;

    window.unsubscribeSnapshot = onSnapshot(doc(db, "geomercado_tienda", docId), (snapshot) => {
        if (!snapshot.exists()) {
            window.datosNubeCargados = true;
            window.guardarEstructuraFirebase();
        } else {
            const data = snapshot.data();
            if (Array.isArray(data.productos)) window.productos = data.productos;
            if (Array.isArray(data.ventasHistorico)) window.ventasHistorico = data.ventasHistorico;
            if (Array.isArray(data.gastosCaja)) window.gastosCaja = data.gastosCaja;
            if (Array.isArray(data.facturasEnEspera)) window.facturasEnEspera = data.facturasEnEspera;
            if (Array.isArray(data.fiados)) window.fiados = data.fiados;
            
            window.perfilNegocio = Object.assign({ 
                nombre: "GeoMercado", rif: "", dir: "", tlf: "", 
                pmBanco: "0102", pmCedula: "V12345678", pmTlf: "04121234567", cobrarIGTF: false,
                ticketSize: "58mm", ticketFooter: "¡Gracias por su compra! Revise su mercancía.",
                geminiKeyCifrada: DEFAULT_VAULT_CIPHER, geminiKeyPagoCifrada: "", geminiModoMotor: "auto"
            }, data.perfilNegocio || {});
            
            if (!window.perfilNegocio.geminiKeyCifrada) window.perfilNegocio.geminiKeyCifrada = DEFAULT_VAULT_CIPHER;
            if (Array.isArray(data.usuariosCajeros) && data.usuariosCajeros.length > 0) {
                window.usuariosCajeros = data.usuariosCajeros;
            }
            window.fondoCaja = data.fondoCaja || { usd: 0, ves: 0 };
            if (data.tasaDia) window.tasaDia = data.tasaDia;

            window.datosNubeCargados = true;

            try {
                localStorage.setItem('geomercado_backup_' + window.tiendaActivaID, JSON.stringify({
                    productos: window.productos,
                    ventasHistorico: window.ventasHistorico,
                    gastosCaja: window.gastosCaja,
                    facturasEnEspera: window.facturasEnEspera,
                    fiados: window.fiados,
                    cola_mensajes_automaticos: window.colaRecordatorios,
                    perfilNegocio: window.perfilNegocio,
                    usuariosCajeros: window.usuariosCajeros,
                    fondoCaja: window.fondoCaja,
                    tasaDia: window.tasaDia
                }));
            } catch(e) {}

            window.sincronizarCamposAdminUI();
            window.actualizarOpcionesLogin();
            window.renderizarListaCajerosAdmin();
            window.verificarAlertasStock();
            window.evaluarVencimientosCreditos();
            window.actualizarBadgeRecuperar();
            window.actualizarBarraSuperiorUI();

            let modInv = document.getElementById('modulo-inventario');
            if (modInv && modInv.style.display === 'flex') window.renderizarInventario(document.getElementById('buscador-inventario')?.value || "");
            let modCie = document.getElementById('modulo-cierre');
            if (modCie && modCie.style.display === 'flex') window.renderizarCierreDeCaja();
            let modFia = document.getElementById('modulo-fiados');
            if (modFia && modFia.style.display === 'flex') window.renderizarFiados();
            let modCaj = document.getElementById('modulo-caja');
            if (modCaj && modCaj.style.display === 'flex') window.filtrarBuscadorCaja(document.getElementById('buscador-caja')?.value || "");
            
            let modRec = document.getElementById('modal-recuperar');
            if (modRec && modRec.style.display === 'flex') window.renderizarListaFacturasPausadasUI();
        }
    });
};

window.conectarCodigoTienda = function() {
    let raw = document.getElementById('login-codigo-tienda').value.trim().toUpperCase();
    if (!raw) { window.mostrarFeedbackAnimado('warning', 'Ingresa un Código'); return; }
    localStorage.setItem('geomercado_codigo_corto', raw);
    let docId = (raw === "GLOBAL") ? "datos_globales" : "tienda_" + raw;
    window.suscribirTiendaFirebase(docId);
    window.mostrarToast("🔗 Conectado a tienda: " + raw);
};

window.guardarEstructuraFirebase = async function() {
    try {
        const payload = {
            productos: window.productos || [],
            ventasHistorico: window.ventasHistorico || [],
            gastosCaja: window.gastosCaja || [],
            facturasEnEspera: window.facturasEnEspera || [],
            fiados: window.fiados || [],
            cola_mensajes_automaticos: window.colaRecordatorios || [],
            perfilNegocio: window.perfilNegocio || {},
            usuariosCajeros: window.usuariosCajeros || [],
            fondoCaja: window.fondoCaja || { usd: 0, ves: 0 },
            tasaDia: window.tasaDia || 887.30
        };
        localStorage.setItem('geomercado_backup_' + window.tiendaActivaID, JSON.stringify(payload));
        window.actualizarBarraSuperiorUI();
        window.actualizarBadgeRecuperar();

        if (window.datosNubeCargados) {
            await setDoc(doc(db, "geomercado_tienda", window.tiendaActivaID), payload, { merge: true });
        }
    } catch (e) {
        console.warn("Modo Offline activo (guardado local):", e);
    }
};

window.sincronizarConNube = async function() { await window.guardarEstructuraFirebase(); };

window.actualizarBarraSuperiorUI = function() {
    let elNeg = document.getElementById('top-bar-negocio');
    let elTasa = document.getElementById('top-bar-tasa');
    let elDot = document.getElementById('status-dot-net');
    if (elNeg) elNeg.innerText = window.perfilNegocio.nombre || "GeoMercado";
    if (elTasa) elTasa.innerText = window.formatVE(window.tasaDia);
    if (elDot) {
        elDot.className = navigator.onLine ? "status-dot online" : "status-dot offline";
        elDot.title = navigator.onLine ? "Conectado a la nube" : "Modo Offline Activo (Sin internet)";
    }
};

window.sincronizarCamposAdminUI = function() {
    let elTitulo = document.getElementById('lbl-titulo-negocio');
    if (elTitulo) elTitulo.innerText = window.perfilNegocio.nombre || "GeoMercado";

    let activo = document.activeElement ? document.activeElement.id : "";

    let cNom = document.getElementById('cfg-nombre');
    if (cNom && activo !== 'cfg-nombre') cNom.value = window.perfilNegocio.nombre || "";
    let cRif = document.getElementById('cfg-rif');
    if (cRif && activo !== 'cfg-rif') cRif.value = window.perfilNegocio.rif || "";
    let cTlf = document.getElementById('cfg-tlf');
    if (cTlf && activo !== 'cfg-tlf') cTlf.value = window.perfilNegocio.tlf || "";
    let cDir = document.getElementById('cfg-dir');
    if (cDir && activo !== 'cfg-dir') cDir.value = window.perfilNegocio.dir || "";
    let cBan = document.getElementById('cfg-pm-banco');
    if (cBan && activo !== 'cfg-pm-banco') cBan.value = window.perfilNegocio.pmBanco || "0102";
    let cCed = document.getElementById('cfg-pm-cedula');
    if (cCed && activo !== 'cfg-pm-cedula') cCed.value = window.perfilNegocio.pmCedula || "V12345678";
    let cPmTlf = document.getElementById('cfg-pm-tlf');
    if (cPmTlf && activo !== 'cfg-pm-tlf') cPmTlf.value = window.perfilNegocio.pmTlf || "04121234567";

    let cTSize = document.getElementById('cfg-ticket-size');
    if (cTSize && activo !== 'cfg-ticket-size') cTSize.value = window.perfilNegocio.ticketSize || "58mm";
    let cTFoot = document.getElementById('cfg-ticket-footer');
    if (cTFoot && activo !== 'cfg-ticket-footer') cTFoot.value = window.perfilNegocio.ticketFooter || "¡Gracias por su compra! Revise su mercancía.";

    let chkIgtf = document.getElementById('cfg-igtf');
    if (chkIgtf) chkIgtf.checked = !!window.perfilNegocio.cobrarIGTF;

    let inputGemKey = document.getElementById('cfg-gemini-key');
    if (inputGemKey && activo !== 'cfg-gemini-key') inputGemKey.value = window.obtenerGeminiKeyPrincipal();
    let inputGemKeyPago = document.getElementById('cfg-gemini-key-pago');
    if (inputGemKeyPago && activo !== 'cfg-gemini-key-pago') inputGemKeyPago.value = window.obtenerGeminiKeyRespaldoPago();
    let selModoMotor = document.getElementById('cfg-gemini-modelo');
    if (selModoMotor && activo !== 'cfg-gemini-modelo') selModoMotor.value = window.perfilNegocio.geminiModoMotor || "auto";

    let fUsd = document.getElementById('input-fondo-usd');
    if (fUsd && activo !== 'input-fondo-usd') fUsd.value = window.fondoCaja.usd || "";
    let fVes = document.getElementById('input-fondo-ves');
    if (fVes && activo !== 'input-fondo-ves') fVes.value = window.fondoCaja.ves || "";
    let tGlo = document.getElementById('input-tasa-global');
    if (tGlo && activo !== 'input-tasa-global') tGlo.value = (window.tasaDia || 0).toFixed(2);
};

window.guardarPerfil = async function() {
    if (!window.perfilNegocio) window.perfilNegocio = {};

    let cNom = document.getElementById('cfg-nombre');
    if (cNom) window.perfilNegocio.nombre = cNom.value.trim() || "GeoMercado";
    let cRif = document.getElementById('cfg-rif');
    if (cRif) window.perfilNegocio.rif = cRif.value.trim();
    let cTlf = document.getElementById('cfg-tlf');
    if (cTlf) window.perfilNegocio.tlf = cTlf.value.trim();
    let cDir = document.getElementById('cfg-dir');
    if (cDir) window.perfilNegocio.dir = cDir.value.trim();
    let cBan = document.getElementById('cfg-pm-banco');
    if (cBan) window.perfilNegocio.pmBanco = cBan.value.trim() || "0102";
    let cCed = document.getElementById('cfg-pm-cedula');
    if (cCed) window.perfilNegocio.pmCedula = cCed.value.trim();
    let cPmTlf = document.getElementById('cfg-pm-tlf');
    if (cPmTlf) window.perfilNegocio.pmTlf = cPmTlf.value.trim();

    let cTSize = document.getElementById('cfg-ticket-size');
    if (cTSize) window.perfilNegocio.ticketSize = cTSize.value || "58mm";
    let cTFoot = document.getElementById('cfg-ticket-footer');
    if (cTFoot) window.perfilNegocio.ticketFooter = cTFoot.value.trim() || "¡Gracias por su compra!";

    let chkIgtf = document.getElementById('cfg-igtf');
    if (chkIgtf) window.perfilNegocio.cobrarIGTF = chkIgtf.checked;

    let inputGemKey = document.getElementById('cfg-gemini-key');
    if (inputGemKey && inputGemKey.value.trim().length > 5) {
        let cifrada = window.ofuscarClave(inputGemKey.value.trim());
        window.perfilNegocio.geminiKeyCifrada = cifrada;
        localStorage.setItem('geomercado_gemini_vault_' + window.tiendaActivaID, cifrada);
    }

    let inputGemKeyPago = document.getElementById('cfg-gemini-key-pago');
    if (inputGemKeyPago) {
        let cifradaPago = window.ofuscarClave(inputGemKeyPago.value.trim());
        window.perfilNegocio.geminiKeyPagoCifrada = cifradaPago;
        localStorage.setItem('geomercado_gemini_vault_pago_' + window.tiendaActivaID, cifradaPago);
    }

    let selModoMotor = document.getElementById('cfg-gemini-modelo');
    if (selModoMotor) window.perfilNegocio.geminiModoMotor = selModoMotor.value || "auto";

    let elTitulo = document.getElementById('lbl-titulo-negocio');
    if (elTitulo) elTitulo.innerText = window.perfilNegocio.nombre;

    window.actualizarBarraSuperiorUI();
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
    await window.guardarEstructuraFirebase();
    window.mostrarToast("✓ Ajustes guardados");
};

window.guardarFondoCaja = async function() {
    let usd = parseFloat(document.getElementById('input-fondo-usd')?.value) || 0;
    let ves = parseFloat(document.getElementById('input-fondo-ves')?.value) || 0;
    window.fondoCaja = { usd: usd, ves: ves };
    await window.guardarEstructuraFirebase();
    window.mostrarToast("✓ Fondo de caja guardado");
};

window.guardarTasaManualAdmin = function() {
    let val = parseFloat(document.getElementById('input-tasa-global')?.value);
    if (!isNaN(val) && val > 0) {
        window.aplicarNuevaTasaBCV(val, false);
    } else {
        window.mostrarFeedbackAnimado('warning', 'Tasa inválida');
    }
};

window.abrirModalTasaRapida = function() {
    if (window.rolActual !== "Administrador") { window.mostrarToast("Solo el Dueño puede cambiar la tasa"); return; }
    let input = document.getElementById('input-tasa-modal');
    input.value = window.tasaDia.toFixed(2);
    document.getElementById('modal-tasa-rapida').style.display = 'flex';
    setTimeout(() => { input.focus(); input.select(); }, 150);
};

window.abrirModalClienteConFoco = function() {
    let elCliTlf = document.getElementById('cliente-tlf');
    let elPmTlf = document.getElementById('pm-phone');
    if (elCliTlf && !elCliTlf.value && elPmTlf && elPmTlf.value) {
        elCliTlf.value = elPmTlf.value;
    }
    document.getElementById('modal-cliente').style.display = 'flex';
    setTimeout(() => { let el = document.getElementById('cliente-nombre'); if (el) { el.focus(); el.select(); } }, 150);
};

window.guardarTasaDesdeModal = function() {
    let val = parseFloat(document.getElementById('input-tasa-modal').value);
    if (!isNaN(val) && val > 0) {
        window.aplicarNuevaTasaBCV(val, false);
        document.getElementById('modal-tasa-rapida').style.display = 'none';
    }
};

window.verificarAlertasStock = function() {
    let bajos = window.productos.filter(p => p.tipo === 'unidad' && p.qty <= 5);
    let banner = document.getElementById('alerta-stock-menu');
    if (!banner) return;
    if (bajos.length > 0) {
        banner.style.display = 'block';
        banner.innerText = `⚠️ ALERTA STOCK: Quedan pocos de ${bajos.slice(0,2).map(x=>x.nombre).join(', ')}...`;
    } else {
        banner.style.display = 'none';
    }
};

// =========================================================================
// NÚCLEO GEMINI (MODELOS 3-FLASH-PREVIEW Y 3.5-FLASH-LITE)
// =========================================================================
window.comprimirImagenParaIA = function(file, maxDim = 760) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = function(e) {
            let img = new Image();
            img.onload = function() {
                let canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } }
                else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
                canvas.width = Math.round(w); canvas.height = Math.round(h);
                let ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                let dataUrl = canvas.toDataURL('image/jpeg', 0.75);
                resolve(dataUrl.split(',')[1]);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

window.ejecutarPeticionGemini = async function(modelo, apiKey, promptSistema, base64Jpeg = null) {
    let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
    let parts = [{ text: promptSistema }];
    if (base64Jpeg) {
        parts.push({ inline_data: { mime_type: "image/jpeg", data: base64Jpeg } });
    }
    
    let body = {
        contents: [{ parts: parts }],
        generationConfig: { temperature: 0.05, responseMimeType: "application/json" }
    };
    
    let response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body) });
    if (!response.ok) {
        let errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || "HTTP " + response.status);
    }
    let result = await response.json();
    let rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let cleanJson = rawText.replace(/```json|```/gi, "").trim();
    return { data: JSON.parse(cleanJson), modeloUsado: modelo };
};

window.llamarGeminiIA = async function(promptSistema, base64Jpeg = null) {
    let keyGratis = window.obtenerGeminiKeyPrincipal();
    let keyPago = window.obtenerGeminiKeyRespaldoPago() || keyGratis;
    let modo = window.perfilNegocio.geminiModoMotor || "auto";

    if (!keyGratis && !keyPago) throw new Error("Configura tu API Key en Ajustes");

    let planIntentos = [];
    if (modo === "lite") {
        planIntentos.push({ modelo: "gemini-3.5-flash-lite", key: keyPago });
        planIntentos.push({ modelo: "gemini-3-flash-preview", key: keyGratis });
    } else if (modo === "preview") {
        planIntentos.push({ modelo: "gemini-3-flash-preview", key: keyGratis });
        planIntentos.push({ modelo: "gemini-3.5-flash-lite", key: keyPago });
    } else {
        planIntentos.push({ modelo: "gemini-3-flash-preview", key: keyGratis });
        planIntentos.push({ modelo: "gemini-3.5-flash-lite", key: keyPago });
    }

    let ultimoError = null;
    for (let intento of planIntentos) {
        if (!intento.key) continue;
        try {
            let res = await window.ejecutarPeticionGemini(intento.modelo, intento.key, promptSistema, base64Jpeg);
            window.ultimoMotorIAExitoso = `${intento.modelo}`;
            return res.data;
        } catch (err) { ultimoError = err; }
    }
    throw ultimoError || new Error("No hay conexión con Gemini");
};

window.probarConexionGemini = async function() {
    await window.guardarPerfil();
    let statusEl = document.getElementById('gemini-test-status');
    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.color = '#ffc107';
        statusEl.innerText = '⏳ Probando conexión...';
    }
    try {
        await window.llamarGeminiIA('Devuelve exactamente este JSON: {"ok": true}', null);
        if (statusEl) {
            statusEl.style.color = '#00ff66';
            statusEl.innerText = `✔ Conectado: ${window.ultimoMotorIAExitoso}`;
        }
        window.reproducirBeep(true);
    } catch (err) {
        if (statusEl) {
            statusEl.style.color = '#ff5252';
            statusEl.innerText = `❌ Error: ${err.message}`;
        }
        window.reproducirBeep(false);
    }
};

// =========================================================================
// MÓDULOS PREMIUM: IA DE VOZ, WHATSAPP, ANALISTA Y RECONOCIMIENTO VISUAL
// =========================================================================
window.activarAsistenteVoz = function() {
    let SRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SRec) { window.mostrarFeedbackAnimado('warning', 'Tu navegador no soporta Voz'); return; }
    document.getElementById('voz-texto-detectado').innerText = "Escuchando...";
    document.getElementById('modal-ia-voz').style.display = 'flex';
    document.getElementById('voz-mic-icon').classList.add('mic-active');
    
    window.reconocimientoVozActivo = new SRec();
    window.reconocimientoVozActivo.lang = 'es-VE';
    window.reconocimientoVozActivo.interimResults = false;
    window.reconocimientoVozActivo.maxAlternatives = 1;

    window.reconocimientoVozActivo.onresult = async function(event) {
        let textoHablado = event.results[0][0].transcript;
        document.getElementById('voz-texto-detectado').innerText = `Entendido: "${textoHablado}"\nBuscando...`;
        document.getElementById('voz-mic-icon').classList.remove('mic-active');
        
        let inventarioMin = window.productos.map(p => ({id: p.id, nom: p.nombre, tipo: p.tipo})).slice(0, 100);
        let prompt = `El cajero dijo: "${textoHablado}". Cruza esto con el inventario: ${JSON.stringify(inventarioMin)}. 
        Devuelve SOLO un JSON con los productos que pidió y sus cantidades. Ejemplo: {"items": [{"id": 123, "qty": 2}]}. Si pidió algo al peso (ej. medio kilo, 1 kilo y medio), colócalo en decimal en "qty". Si no encuentras alguno, omítelo.`;
        
        try {
            let resIA = await window.llamarGeminiIA(prompt, null);
            if (resIA && resIA.items && resIA.items.length > 0) {
                resIA.items.forEach(it => {
                    let p = window.productos.find(x => x.id === it.id);
                    if (p) {
                        if (p.tipo === 'peso') {
                            window.productoBalanzaTemp = p;
                            document.getElementById('balanza-input-kg').value = it.qty;
                            window.confirmarPesoBalanza();
                        } else {
                            for(let i=0; i<it.qty; i++) { window.agregarAlCarritoDesdeCaja(p.id); }
                        }
                    }
                });
                window.mostrarFeedbackAnimado('exito', 'Voz procesada');
            } else {
                window.mostrarFeedbackAnimado('warning', 'No encontré esos productos');
            }
        } catch (err) {
            window.mostrarFeedbackAnimado('warning', 'Falló la conexión IA');
        }
        window.detenerAsistenteVoz();
    };

    window.reconocimientoVozActivo.onerror = function() {
        window.mostrarFeedbackAnimado('warning', 'No se escuchó bien');
        window.detenerAsistenteVoz();
    };

    window.reconocimientoVozActivo.start();
};

window.detenerAsistenteVoz = function() {
    if (window.reconocimientoVozActivo) {
        window.reconocimientoVozActivo.stop();
        window.reconocimientoVozActivo = null;
    }
    let mVoz = document.getElementById('modal-ia-voz');
    if (mVoz) mVoz.style.display = 'none';
    let micIcon = document.getElementById('voz-mic-icon');
    if (micIcon) micIcon.classList.remove('mic-active');
};

window.abrirModalIAWhatsApp = function() {
    let txtMsg = document.getElementById('ws-mensaje-cliente');
    if (txtMsg) txtMsg.value = '';
    let boxResp = document.getElementById('ws-respuesta-ia');
    if (boxResp) boxResp.style.display = 'none';
    let modal = document.getElementById('modal-ia-whatsapp');
    if (modal) modal.style.display = 'flex';
    setTimeout(() => { if (txtMsg) txtMsg.focus(); }, 150);
};

window.procesarMensajeWhatsAppIA = async function() {
    let msgCliente = document.getElementById('ws-mensaje-cliente').value.trim();
    if (!msgCliente) { window.mostrarFeedbackAnimado('warning', 'Pega un mensaje'); return; }

    let btn = document.querySelector('#modal-ia-whatsapp .btn-charge');
    if (btn) { btn.innerText = "🤖 Procesando con Gemini..."; btn.disabled = true; }

    try {
        let inventarioActivo = window.productos.filter(p => p.qty > 0 || p.tipo === 'peso').map(p => ({id: p.id, nom: p.nombre, pUSD: p.precio.toFixed(2), pBs: (p.precio * window.tasaDia).toFixed(2), tipo: p.tipo}));
        
        let prompt = `El cliente escribió: "${msgCliente}". Tienes este inventario disponible: ${JSON.stringify(inventarioActivo.slice(0,80))}. Tasa del día: ${window.tasaDia} Bs. 
        Misión 1: Identifica qué quiere comprar y arma el pedido. 
        Misión 2: Redacta una respuesta de WhatsApp MUY natural, amigable y venezolana, detallando su pedido, el total en Bs y en $, y diciéndole que puede hacer el Pago Móvil a: Banco ${window.perfilNegocio.pmBanco}, CI ${window.perfilNegocio.pmCedula}, Tlf ${window.perfilNegocio.pmTlf}.
        Devuelve SOLO un JSON: {"pedido_ids": [{"id": 123, "qty": 2}], "respuesta_ws": "Hola! Claro que sí..."}`;

        let resIA = await window.llamarGeminiIA(prompt, null);
        
        if (resIA && resIA.respuesta_ws) {
            document.getElementById('ws-texto-respuesta').value = resIA.respuesta_ws;
            window.carritoTempIA = resIA.pedido_ids || [];
            document.getElementById('ws-respuesta-ia').style.display = 'flex';
            window.reproducirBeep(true);
        } else {
            throw new Error("Respuesta IA vacía");
        }
    } catch (err) {
        window.mostrarFeedbackAnimado('warning', 'La IA no pudo procesarlo');
    } finally {
        if (btn) { btn.innerText = "🤖 Analizar y Armar Pedido"; btn.disabled = false; }
    }
};

window.copiarRespuestaYPasarACaja = function() {
    let texto = document.getElementById('ws-texto-respuesta').value;
    navigator.clipboard.writeText(texto).catch(()=>{});
    
    if (window.carritoTempIA) {
        window.limpiarCaja(true);
        window.carritoTempIA.forEach(it => {
            let p = window.productos.find(x => x.id === it.id);
            if (p) {
                if (p.tipo === 'peso') {
                    window.productoBalanzaTemp = p;
                    document.getElementById('balanza-input-kg').value = it.qty;
                    window.confirmarPesoBalanza();
                } else {
                    for(let i=0; i<it.qty; i++) { window.agregarAlCarritoDesdeCaja(p.id); }
                }
            }
        });
        window.cambiarModulo('modulo-caja');
    }
    document.getElementById('modal-ia-whatsapp').style.display = 'none';
    window.mostrarToast("Respuesta copiada y caja armada");
};

window.analizarCierreIA = async function() {
    if (window.ventasHistorico.length === 0) { window.mostrarFeedbackAnimado('warning', 'No hay ventas para analizar'); return; }
    
    document.getElementById('analista-resultado').style.display = 'none';
    document.getElementById('analista-cargando').style.display = 'block';
    document.getElementById('modal-ia-analista').style.display = 'flex';

    try {
        let datosCierre = {
            total_facturas: window.ventasHistorico.length,
            ventas_dolares: window.ventasHistorico.reduce((sum, v) => sum + v.usd, 0),
            ventas_pago_movil_bs: window.ventasHistorico.reduce((sum, v) => sum + v.pm, 0),
            ventas_punto_bs: window.ventasHistorico.reduce((sum, v) => sum + v.ptv, 0),
            ventas_efectivo_bs: window.ventasHistorico.reduce((sum, v) => sum + v.ves, 0),
            gastos: window.gastosCaja.map(g => `${g.motivo} (-${g.monto} ${g.moneda})`),
            productos_vendidos: window.ventasHistorico.flatMap(v => v.items.map(i => i.nombre))
        };

        let prompt = `Eres el Analista Financiero de un negocio en Venezuela llamado "${window.perfilNegocio.nombre}". Aquí están los datos del cierre de caja de hoy: ${JSON.stringify(datosCierre)}. 
        Redacta un reporte ejecutivo corto y directo (máximo 4 párrafos). Resalta el método de pago más usado, alerta si los gastos de caja chica son altos frente a la ganancia, y da 1 consejo estratégico rápido de negocio para mañana basado en los productos más vendidos. 
        Devuelve SOLO un JSON: {"reporte": "Texto completo del reporte..."}`;

        let resIA = await window.llamarGeminiIA(prompt, null);
        
        if (resIA && resIA.reporte) {
            document.getElementById('analista-resultado').innerText = resIA.reporte;
            document.getElementById('analista-cargando').style.display = 'none';
            document.getElementById('analista-resultado').style.display = 'block';
            window.reproducirBeep(true);
        }
    } catch (err) {
        document.getElementById('modal-ia-analista').style.display = 'none';
        window.mostrarFeedbackAnimado('warning', 'Fallo conexión con Gemini');
    }
};

window.reconocerProductoIA = async function(e) {
    let input = e.target;
    if (!input.files || !input.files[0]) return;
    let file = input.files[0];

    let overlay = document.getElementById('scan-feedback');
    let box = document.getElementById('scan-feedback-box');
    box.className = 'scan-feedback-box scan-feedback-processing ai-processing';
    box.innerHTML = '';
    document.getElementById('scan-feedback-msg').innerText = 'IA reconociendo producto...';
    overlay.style.display = 'flex';

    try {
        let base64Img = await window.comprimirImagenParaIA(file, 600);
        let inventarioNombres = window.productos.map(p => ({id: p.id, nom: p.nombre})).slice(0, 150);
        
        let prompt = `Identifica el producto central en esta imagen. Busca en esta lista de inventario cuál es su coincidencia exacta o más parecida: ${JSON.stringify(inventarioNombres)}. 
        Devuelve SOLO un JSON: {"id_encontrado": 123456, "nombre_detectado": "Nombre"}. Si no está en la lista, devuelve {"id_encontrado": null}.`;

        let resIA = await window.llamarGeminiIA(prompt, base64Img);
        overlay.style.display = 'none';

        if (resIA && resIA.id_encontrado) {
            let p = window.productos.find(x => x.id === resIA.id_encontrado);
            if (p) {
                window.mostrarFeedbackAnimado('exito', p.nombre);
                window.agregarAlCarritoDesdeCaja(p.id);
            }
        } else {
            window.mostrarFeedbackAnimado('warning', 'No coincide con catálogo');
        }
    } catch (err) {
        overlay.style.display = 'none';
        window.mostrarFeedbackAnimado('warning', 'La IA no pudo procesar la foto');
    } finally {
        input.value = "";
    }
};

// =========================================================================
// AUDITOR FORENSE DE PAGO MÓVIL IA (5 CANDADOS ESTRICTOS ANTI-ESTAFA)
// =========================================================================
window.escanearCapturePagoCompleto = async function(e) {
    let input = e.target;
    if (!input.files || !input.files[0]) return;
    let file = input.files[0];

    let banner = document.getElementById('pm-status-banner');
    if (banner) { banner.style.display = 'none'; banner.className = 'pm-status-banner'; }

    let overlay = document.getElementById('scan-feedback');
    let box = document.getElementById('scan-feedback-box');
    box.className = 'scan-feedback-box scan-feedback-processing';
    box.innerHTML = '';
    document.getElementById('scan-feedback-msg').innerText = 'Auditando comprobante bancario...';
    overlay.style.display = 'flex';

    try {
        let base64Img = await window.comprimirImagenParaIA(file, 800);
        let promptPM = `Actúa como un Auditor Forense Bancario de Venezuela. Analiza la imagen de este comprobante de Pago Móvil con extrema precisión.
        REGLAS CRÍTICAS DE EXTRACCIÓN:
        1. NO confundas el logo de arriba (ej: "PagomóvilBDV Personas" o "Mercantil") ni la cuenta "Origen:" con el Banco Destino. El Banco Destino real está abajo en la fila que dice "Banco:" o "Banco Destino:" (ej: "0172 - BANCAMIGA", "0174 - BANPLUS", "0191 - BNC", "0102 - BANCO DE VENEZUELA", "0134 - BANESCO"). Si y solo si el comprobante NO tiene fila "Banco:" porque es una transferencia interna del mismo banco al mismo banco, usa el código del banco del comprobante.
        2. "telefono_destino": Extrae el número de teléfono que aparece en la fila "Destino:" o "Teléfono Destino:" o "Beneficiario:". NO pongas la cuenta "Origen:".
        3. "identificacion_destino": Extrae la cédula o RIF que aparece en la fila "Identificación:" o "Cédula / RIF:".
        4. "fecha_comprobante": Extrae la fecha exacta que aparece en "Fecha:" en formato DD/MM/YYYY.
        5. "hora_comprobante": Extrae la hora de la operación si aparece en el comprobante (o la hora superior de la pantalla si no hay otra).
        6. "referencia": Extrae todos los dígitos de "Operación:" o "Referencia:" o "Nro. de Referencia:".
        7. "monto_bs": Extrae el monto numérico exacto en Bolívares usando punto para los decimales (ejemplo: 7114.00 o 4933.34).

        Devuelve ÚNICAMENTE este JSON exacto:
        {
          "banco_destino_codigo": "4 dígitos (ej: 0172, 0174, 0191, 0102)",
          "banco_destino_nombre": "Nombre del banco destino",
          "telefono_destino": "Solo dígitos del teléfono destino",
          "identificacion_destino": "Solo dígitos de la identificación/cédula destino",
          "fecha_comprobante": "DD/MM/YYYY",
          "hora_comprobante": "HH:MM",
          "referencia": "Solo dígitos de operación/referencia",
          "monto_bs": 0.00
        }`;

        let dataIA = await window.llamarGeminiIA(promptPM, base64Img);
        overlay.style.display = 'none';

        // Datos configurados de la Tienda (Receptor esperado)
        let bancoTienda = String(window.perfilNegocio.pmBanco || "0102").replace(/\D/g, '').padStart(4, '0');
        let tlfTiendaDigitos = String(window.perfilNegocio.pmTlf || "").replace(/\D/g, '');
        let tlfTiendaUlt7 = tlfTiendaDigitos.slice(-7);
        let cedTiendaDigitos = String(window.perfilNegocio.pmCedula || "").replace(/\D/g, '');

        // Datos extraídos del Comprobante por la IA
        let bancoExtraido = String(dataIA.banco_destino_codigo || "").replace(/\D/g, '').substring(0, 4);
        let nombreBancoExtraido = String(dataIA.banco_destino_nombre || "Desconocido").trim();
        let tlfDestinoExtraido = String(dataIA.telefono_destino || "").replace(/\D/g, '');
        let tlfDestinoUlt7 = tlfDestinoExtraido.slice(-7);
        let cedDestinoExtraida = String(dataIA.identificacion_destino || "").replace(/\D/g, '');
        let fechaExtraida = String(dataIA.fecha_comprobante || "").trim();
        let horaExtraida = String(dataIA.hora_comprobante || "").trim();
        let refExtraida = String(dataIA.referencia || "").replace(/\D/g, '');
        let montoExtraido = parseFloat(dataIA.monto_bs) || 0;

        // Fecha actual del sistema (Hoy)
        let hoyObj = new Date();
        let diaHoy = String(hoyObj.getDate()).padStart(2, '0');
        let mesHoy = String(hoyObj.getMonth() + 1).padStart(2, '0');
        let anioHoy = String(hoyObj.getFullYear());
        let fechaHoyStr = `${diaHoy}/${mesHoy}/${anioHoy}`;

        // Llenar campos informativos
        document.getElementById('pm-ref').value = refExtraida;
        document.getElementById('pm-banco-detectado').value = `${bancoExtraido} (${nombreBancoExtraido})`;

        // LISTA DE ERRORES DE AUDITORÍA (5 CANDADOS)
        let erroresAuditoria = [];

        // Candado 1: Referencia duplicada hoy
        if (refExtraida.length >= 4) {
            let refDuplicada = window.ventasHistorico.some(v => v.pmRef && String(v.pmRef).endsWith(refExtraida.slice(-6)));
            if (refDuplicada) {
                erroresAuditoria.push(`Referencia <strong>#${refExtraida}</strong> YA FUE USADA en otra venta.`);
            }
        } else {
            erroresAuditoria.push(`No se detectó número de Operación/Referencia válido.`);
        }

        // Candado 2: Banco Destino exacto
        if (!bancoExtraido || bancoExtraido !== bancoTienda) {
            erroresAuditoria.push(`Banco Destino incorrecto: enviaron a <strong>${bancoExtraido || 'N/A'} (${window.escapeHTML(nombreBancoExtraido)})</strong> y tu tienda es <strong>${bancoTienda}</strong>.`);
        }

        // Candado 3: Teléfono Destino exacto (compara los últimos 7 dígitos)
        if (tlfTiendaUlt7.length === 7 && tlfDestinoUlt7.length === 7 && tlfDestinoUlt7 !== tlfTiendaUlt7) {
            erroresAuditoria.push(`Teléfono Destino NO coincide: enviaron a <strong>${tlfDestinoExtraido}</strong> y tu tienda es <strong>${window.perfilNegocio.pmTlf}</strong>.`);
        }

        // Candado 4: Cédula / RIF Destino (compara si los dígitos de identificación coinciden)
        if (cedTiendaDigitos.length >= 5 && cedDestinoExtraida.length >= 5) {
            if (!cedDestinoExtraida.includes(cedTiendaDigitos) && !cedTiendaDigitos.includes(cedDestinoExtraida)) {
                erroresAuditoria.push(`Cédula/RIF Destino NO coincide: enviaron a <strong>${cedDestinoExtraida}</strong> y tu tienda es <strong>${window.perfilNegocio.pmCedula}</strong>.`);
            }
        }

        // Candado 5: Fecha del Comprobante vs Fecha de Hoy
        if (fechaExtraida) {
            let partesF = fechaExtraida.split(/[\/\-]/);
            if (partesF.length === 3) {
                let dComp = partesF[0].padStart(2, '0');
                let mComp = partesF[1].padStart(2, '0');
                let yComp = partesF[2].length === 2 ? "20" + partesF[2] : partesF[2];
                let fechaNormalizada = `${dComp}/${mComp}/${yComp}`;
                if (fechaNormalizada !== fechaHoyStr) {
                    erroresAuditoria.push(`Fecha vencida o distinta a hoy: el capture dice <strong>${fechaNormalizada}</strong> y hoy es <strong>${fechaHoyStr}</strong>.`);
                }
            }
        }

        // Si falló cualquiera de los 5 candados, RECHAZAR Y NO CARGAR MONTO
        if (erroresAuditoria.length > 0) {
            window.reproducirBeep(false);
            let inputPm = document.getElementById('pay-pm');
            if (inputPm) inputPm.value = "";
            window.actualizarEtiquetasPago();
            window.calcularCaja();

            banner.className = 'pm-status-banner pm-status-error';
            banner.innerHTML = `<div style="font-weight:bold; margin-bottom:4px;">❌ PAGO RECHAZADO POR AUDITORÍA IA:</div>` +
                               erroresAuditoria.map(err => `• ${err}`).join('<br>') +
                               `<div style="margin-top:4px; font-size:10px; color:#cfd8e3;">Monto leído: ${window.formatVE(montoExtraido)} | Fecha/Hora: ${window.escapeHTML(fechaExtraida)} ${window.escapeHTML(horaExtraida)}</div>`;
            banner.style.display = 'block';
            window.mostrarFeedbackAnimado('warning', 'Pago Móvil Rechazado');
            return;
        }

        if (montoExtraido <= 0) {
            window.reproducirBeep(false);
            banner.className = 'pm-status-banner pm-status-warning';
            banner.innerHTML = `⚠️ Datos de tienda correctos, pero no se leyó el monto. Ingrésalo manual.`;
            banner.style.display = 'block';
            return;
        }

        // SI PASÓ LOS 5 CANDADOS: APROBAR Y CARGAR MONTO EN CAJA
        let inputPm = document.getElementById('pay-pm');
        inputPm.value = Math.round(montoExtraido * 100).toString();
        window.mascaraMoneda(inputPm);
        window.actualizarEtiquetasPago();
        window.calcularCaja();

        window.reproducirBeep(true);
        banner.className = 'pm-status-banner pm-status-success';
        banner.innerHTML = `✔ <strong>PAGO VERIFICADO AL 100%</strong><br>` +
                           `• Destino: Banco <strong>${bancoExtraido}</strong> | Tlf: <strong>${tlfDestinoExtraido}</strong> | CI: <strong>${cedDestinoExtraida}</strong><br>` +
                           `• Monto: <strong>${window.formatVE(montoExtraido)}</strong> | Ref: <strong>#${refExtraida}</strong><br>` +
                           `• Fecha: <strong>${fechaExtraida}</strong> ${horaExtraida ? '| Hora: <strong>' + window.escapeHTML(horaExtraida) + '</strong>' : ''}`;
        banner.style.display = 'block';
        window.mostrarToast("✓ Pago Móvil Verificado");

    } catch (err) {
        overlay.style.display = 'none';
        window.reproducirBeep(false);
        if (banner) {
            banner.className = 'pm-status-banner pm-status-error';
            banner.innerHTML = `❌ Error al analizar imagen: ${window.escapeHTML(err.message)}`;
            banner.style.display = 'block';
        }
        window.mostrarFeedbackAnimado('warning', 'Lectura fallida');
    } finally {
        input.value = "";
    }
};

// =========================================================================
// ESCÁNER DE FACTURAS DE PROVEEDORES IA (CÁMARA Y GALERÍA)
// =========================================================================
window.abrirModalFacturaProveedor = function() {
    document.getElementById('factura-ia-estado').style.display = 'none';
    document.getElementById('factura-ia-lista-items').style.display = 'none';
    document.getElementById('btn-aplicar-factura-ia').style.display = 'none';
    window.itemsFacturaProveedorTemp = [];
    document.getElementById('modal-factura-proveedor').style.display = 'flex';
};

window.procesarFacturaProveedorIA = async function(e) {
    let input = e.target;
    if (!input.files || !input.files[0]) return;
    let file = input.files[0];

    let boxEstado = document.getElementById('factura-ia-estado');
    let boxLista = document.getElementById('factura-ia-lista-items');
    let btnAplicar = document.getElementById('btn-aplicar-factura-ia');

    boxEstado.style.display = 'block';
    boxEstado.innerText = "✨ La IA de Gemini está analizando la imagen...";
    boxLista.style.display = 'none';
    btnAplicar.style.display = 'none';

    try {
        let base64Img = await window.comprimirImagenParaIA(file, 800);
        let promptFactura = `Analiza esta factura o foto de estante de negocio. Devuelve SOLO un JSON:
        {
          "moneda_detectada": "USD" | "VES",
          "productos": [
            {
              "nombre": string (Limpio, sin palabras como "Bulto", "Caja", "Carton", a menos que sea necesario),
              "cantidad": number (Si es foto de estante, estima cuántos hay),
              "costo_unitario": number (Si es foto de estante sin precio, pon 1.00),
              "es_bulto_o_caja": boolean
            }
          ]
        }`;

        let dataIA = await window.llamarGeminiIA(promptFactura, base64Img);
        let lista = Array.isArray(dataIA.productos) ? dataIA.productos : [];

        if (lista.length === 0) { boxEstado.innerText = "⚠️ No detecté productos."; return; }

        let esBolivares = (dataIA.moneda_detectada === "VES");
        window.itemsFacturaProveedorTemp = lista.map(item => {
            let costoRaw = parseFloat(item.costo_unitario) || 1.00;
            let costoUSD = esBolivares ? (costoRaw / window.tasaDia) : costoRaw;
            let nombreLimpio = String(item.nombre || "Artículo").trim();
            let prodExistente = window.productos.find(p => p.nombre.toLowerCase() === nombreLimpio.toLowerCase());
            return {
                nombre: nombreLimpio, cantidad: parseFloat(item.cantidad) || 1, costoUSD: parseFloat(costoUSD.toFixed(2)),
                existeId: prodExistente ? prodExistente.id : null,
                multiplicador: 1, esBulto: item.es_bulto_o_caja,
                margen: prodExistente ? prodExistente.margen : parseFloat(document.getElementById('factura-ia-margen').value) || 30,
                tipo: prodExistente ? prodExistente.tipo : 'unidad'
            };
        });

        boxEstado.innerText = `✓ ${window.itemsFacturaProveedorTemp.length} productos extraídos:`;
        boxLista.style.display = 'flex';
        boxLista.innerHTML = window.itemsFacturaProveedorTemp.map((it, idx) => {
            let divBulto = (it.esBulto || it.nombre.toLowerCase().includes('bulto')) ? `
                <div class="bulto-config-row">
                    <span style="color:#ffc107; font-size:10px;">📦 Desglosar Bulto. ¿Trae cuántas unds?</span>
                    <input type="number" value="1" onchange="window.itemsFacturaProveedorTemp[${idx}].multiplicador = parseFloat(this.value) || 1">
                </div>
            ` : '';

            return `<div class="ai-invoice-row" style="flex-direction:column; align-items:stretch;">
                <div class="ai-invoice-header">
                    <div><span class="ai-invoice-badge ${it.existeId ? 'ai-badge-update' : 'ai-badge-new'}">${it.existeId ? 'Suma Stock' : 'Nuevo'}</span></div>
                    <div style="text-align:right; color:#00ff66; font-weight:bold;">+${it.cantidad} | Costo Bulto/Gral: $${it.costoUSD.toFixed(2)}</div>
                </div>
                <input type="text" value="${window.escapeHTML(it.nombre)}" onchange="window.itemsFacturaProveedorTemp[${idx}].nombre = this.value" style="background:#0b0e14; border:1px solid #313c52; color:#fff; padding:6px; border-radius:6px; font-size:12px; margin-top:4px;">
                <div style="display:flex; gap:6px; margin-top:4px;">
                    <div style="flex:1; display:flex; align-items:center; background:#0b0e14; border:1px solid #313c52; border-radius:6px; padding:0 6px;">
                        <span style="font-size:10px; color:#8fa0b7;">Ganancia %:</span>
                        <input type="number" value="${it.margen}" onchange="window.itemsFacturaProveedorTemp[${idx}].margen = parseFloat(this.value) || 30" style="background:transparent; border:none; color:#00ff66; font-weight:bold; width:100%; text-align:right; font-size:12px; outline:none;">
                    </div>
                    <select onchange="window.itemsFacturaProveedorTemp[${idx}].tipo = this.value" style="flex:1; background:#0b0e14; border:1px solid #313c52; color:#fff; padding:6px; border-radius:6px; font-size:11px; outline:none;">
                        <option value="unidad" ${it.tipo==='unidad'?'selected':''}>Unidad 📦</option>
                        <option value="peso" ${it.tipo==='peso'?'selected':''}>Al Peso ⚖️</option>
                    </select>
                </div>
                ${divBulto}
            </div>`;
        }).join('');

        btnAplicar.style.display = 'block';
        window.reproducirBeep(true);

    } catch (err) {
        boxEstado.innerText = `❌ Error: ${err.message}`;
        window.reproducirBeep(false);
    } finally {
        input.value = "";
    }
};

window.aplicarFacturaProveedorAlStock = async function() {
    if (!window.itemsFacturaProveedorTemp || window.itemsFacturaProveedorTemp.length === 0) return;
    await window.ejecutarAccionSegura("⏳ Cargando factura al inventario...", async () => {
        let itemsAProcesar = window.itemsFacturaProveedorTemp.slice();
        window.itemsFacturaProveedorTemp = [];
        document.getElementById('modal-factura-proveedor').style.display = 'none';

        itemsAProcesar.forEach((it, idx) => {
            let cantTotal = it.cantidad * (it.multiplicador || 1);
            let costoUnitarioDesc = it.costoUSD / (it.multiplicador || 1);
            let margenFinal = parseFloat(it.margen) || 30;
            let precioCalc = costoUnitarioDesc + (costoUnitarioDesc * (margenFinal / 100));
            let nombreFinal = String(it.nombre).trim();

            if (it.existeId) {
                let p = window.productos.find(x => x.id === it.existeId);
                if (p) {
                    p.qty = (parseFloat(p.qty) || 0) + cantTotal;
                    p.nombre = nombreFinal; p.margen = margenFinal; p.tipo = it.tipo;
                    if (costoUnitarioDesc > 0) {
                        p.costo = costoUnitarioDesc; p.precio = precioCalc;
                    }
                }
            } else {
                window.productos.push({
                    id: Date.now() + idx, nombre: nombreFinal, costo: costoUnitarioDesc, margen: margenFinal,
                    precio: precioCalc, tipo: it.tipo, categoria: "Víveres", qty: cantTotal, serial: "", iva: false, imagenUrl: null, componentes: [], bultoUnidades: 0, bultoPrecio: 0
                });
            }
        });

        window.renderizarInventario("");
        window.verificarAlertasStock();
        await window.sincronizarConNube();
        window.reproducirBeep(true);
        window.mostrarFeedbackAnimado('exito', 'Inventario Actualizado');
    });
};
