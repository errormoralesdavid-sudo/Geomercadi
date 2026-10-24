import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, initializeFirestore, persistentLocalCache } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const HASH_ADMIN = "NjEyMDAz"; // 612003

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Error SW:', err));
    });
}

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
const storage = getStorage(app);

window.tasaDia = parseFloat(localStorage.getItem('geomercado_tasa_v19')) || 623.02;
window.totalVentaUSD = 0.00;
window.totalVentaVES = 0.00; 
window.rolActual = "Administrador 👑";
window.usuarioActivoNombre = "Administrador";
window.carrito = [];
window.productos = [];
window.ventasHistorico = [];
window.facturasEnEspera = [];
window.fiados = [];
window.usuariosCajeros = [{ id: 1, nombre: "Cajero Principal", clave: "1234" }];
window.fondoCaja = { usd: 0, ves: 0 };
window.perfilNegocio = { nombre: "Geo Mercado 🛍️", rif: "", dir: "", tlf: "", pin: atob(HASH_ADMIN), pmBanco: "0102", pmCedula: "V12345678", pmTlf: "04121234567" };
window.productoEnEdicion = null;
window.html5QrScannerInstancia = null;

window.guardarEstructuraFirebase = async function() {
    try {
        await setDoc(doc(db, "geomercado_tienda", "datos_globales"), {
            productos: window.productos || [],
            ventasHistorico: window.ventasHistorico || [],
            facturasEnEspera: window.facturasEnEspera || [],
            fiados: window.fiados || [],
            perfilNegocio: window.perfilNegocio || {},
            usuariosCajeros: window.usuariosCajeros || [],
            tasaDia: window.tasaDia || 623.02
        });
    } catch (e) {
        console.warn("Guardado localmente. Se subirá a la nube cuando regrese la red.");
    }
};

onSnapshot(doc(db, "geomercado_tienda", "datos_globales"), (snapshot) => {
    if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.productos) window.productos = data.productos;
        if (data.ventasHistorico) window.ventasHistorico = data.ventasHistorico;
        if (data.facturasEnEspera) window.facturasEnEspera = data.facturasEnEspera;
        if (data.fiados) window.fiados = data.fiados;
        if (data.perfilNegocio) window.perfilNegocio = data.perfilNegocio;
        if (data.usuariosCajeros) window.usuariosCajeros = data.usuariosCajeros;
        if (data.tasaDia) window.tasaDia = data.tasaDia;

        if (document.getElementById('modulo-inventario').style.display === 'flex') window.renderizarInventario(document.getElementById('buscador-inventario').value);
        if (document.getElementById('modulo-cierre').style.display === 'flex') window.renderizarCierreDeCaja();
        if (document.getElementById('modulo-fiados').style.display === 'flex') window.renderizarFiados();
    }
});

window.addEventListener('online', function() {
    let banner = document.getElementById('banner-offline');
    if (banner) banner.style.display = 'none';
    window.mostrarToast("⚡ Conexión restablecida...");
    window.sincronizarConNube();
});

window.addEventListener('offline', function() {
    let banner = document.getElementById('banner-offline');
    if (banner) banner.style.display = 'block';
    window.mostrarToast("📡 Modo Sin Red Activo");
});

window.onload = function() {
    if (!navigator.onLine) {
        let banner = document.getElementById('banner-offline');
        if (banner) banner.style.display = 'block';
    }
    let inputTasa = document.getElementById('input-tasa-global');
    if(inputTasa) inputTasa.value = window.tasaDia;
    
    document.getElementById('cfg-nombre').value = window.perfilNegocio.nombre || "";
    document.getElementById('cfg-rif').value = window.perfilNegocio.rif || "";
    document.getElementById('cfg-tlf').value = window.perfilNegocio.tlf || "";
    document.getElementById('cfg-dir').value = window.perfilNegocio.dir || "";
    document.getElementById('cfg-pin').value = window.perfilNegocio.pin || atob(HASH_ADMIN);
    document.getElementById('cfg-pm-banco').value = window.perfilNegocio.pmBanco || "0102";
    document.getElementById('cfg-pm-cedula').value = window.perfilNegocio.pmCedula || "V12345678";
    document.getElementById('cfg-pm-tlf').value = window.perfilNegocio.pmTlf || "04121234567";
    document.getElementById('input-fondo-usd').value = window.fondoCaja.usd || "";
    document.getElementById('input-fondo-ves').value = window.fondoCaja.ves || "";

    window.actualizarOpcionesLogin();
    if (navigator.onLine) window.obtenerTasaBCV(true);
};

window.sincronizarConNube = async function() { await window.guardarEstructuraFirebase(); };

window.actualizarOpcionesLogin = function() {
    let rol = document.getElementById('login-rol').value;
    let box = document.getElementById('box-select-cajero');
    let selectC = document.getElementById('login-cajero-usuario');
    selectC.innerHTML = "";

    if(rol === "cajero") {
        box.style.display = "block";
        window.usuariosCajeros.forEach(c => {
            let opt = document.createElement('option');
            opt.value = c.nombre; opt.innerText = c.nombre; selectC.appendChild(opt);
        });
    } else {
        box.style.display = "none";
    }
};

window.ejecutarLogin = function() {
    let rol = document.getElementById('login-rol').value;
    let pin = document.getElementById('login-pin').value.trim();

    if(rol === "admin") {
        if(pin === (window.perfilNegocio.pin || atob(HASH_ADMIN))) {
            window.rolActual = "Administrador 👑";
            window.usuarioActivoNombre = "Administrador";
            window.iniciarSesionExitosa();
        } else {
            window.mostrarFeedbackAnimado('error', 'Clave Admin Incorrecta');
        }
    } else {
        let cNom = document.getElementById('login-cajero-usuario').value;
        let cajeroObj = window.usuariosCajeros.find(u => u.nombre === cNom);
        
        if(pin === "1234" || (cajeroObj && cajeroObj.clave === pin)) {
            window.rolActual = "Cajero 👤";
            window.usuarioActivoNombre = cNom;
            window.iniciarSesionExitosa();
        } else {
            window.mostrarFeedbackAnimado('error', 'Clave Cajero Incorrecta');
        }
    }
};

window.iniciarSesionExitosa = function() {
    document.getElementById('section-login').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    document.getElementById('txt-rol').innerText = window.usuarioActivoNombre + " (" + window.rolActual + ")";
    document.getElementById('login-pin').value = "";
    window.volverAlMenu();
};

window.cerrarSesion = function() {
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
        window.sincronizarConNube();
        window.mostrarToast("✓ Cajero Creado con Éxito");
    } else {
        window.mostrarFeedbackAnimado('error', 'Ingresa Nombre y Clave');
    }
};

window.obtenerTasaBCV = function(silencioso) {
    if (!navigator.onLine) {
        if (!silencioso) window.mostrarToast("Usando tasa guardada (Sin Red)");
        return;
    }
    if(!silencioso) window.mostrarToast("📡 Consultando BCV...");

    fetch('https://ve.dolarapi.com/v1/dolares/oficial')
    .then(res => res.json())
    .then(data => {
        if (data && data.promedio) {
            let valorBcv = parseFloat(data.promedio);
            if (!isNaN(valorBcv) && valorBcv > 0) return window.aplicarNuevaTasaBCV(valorBcv, silencioso);
        }
        throw new Error("Formato respuesta no esperado");
    })
    .catch(() => {
        fetch('https://rates.dolarvzla.com/bcv/current.json')
        .then(res => res.json())
        .then(data => {
            if (data && data.price) {
                let valorBcv = parseFloat(data.price);
                if (!isNaN(valorBcv) && valorBcv > 0) return window.aplicarNuevaTasaBCV(valorBcv, silencioso);
            }
            if (!silencioso) window.mostrarFeedbackAnimado('error', 'Ingresa Tasa Manualmente');
        }).catch(() => { if (!silencioso) window.mostrarFeedbackAnimado('error', 'Fallo conexión BCV'); });
    });
};

window.aplicarNuevaTasaBCV = function(valor, silencioso) {
    window.tasaDia = valor;
    let inputTasa = document.getElementById('input-tasa-global');
    if (inputTasa) inputTasa.value = window.tasaDia.toFixed(2);
    localStorage.setItem('geomercado_tasa_v19', window.tasaDia);
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
    window.sincronizarConNube();
    if (!silencioso) window.mostrarFeedbackAnimado('exito', 'Tasa: ' + window.tasaDia.toFixed(2) + ' Bs');
};

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
        window.mostrarFeedbackAnimado('error', 'Bloqueado: Requiere Administrador'); return;
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
        document.getElementById('buscador-caja').value = "";
        document.getElementById('resultados-busqueda-caja').innerHTML = "";
        window.renderizarCarritoCaja();
    }
    if(idModulo === 'modulo-cierre') window.renderizarCierreDeCaja();
    if(idModulo === 'modulo-fiados') window.renderizarFiados();
};

window.volverAlMenu = function() {
    document.querySelectorAll('.modulo-app').forEach(m => m.style.display = 'none');
    document.getElementById('menu-principal').style.display = 'flex';
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
    window.mostrarToast("Fondo de caja guardado");
};

window.guardarPerfil = function() {
    window.perfilNegocio.nombre = document.getElementById('cfg-nombre').value || "Geo Mercado 🛍️";
    window.perfilNegocio.rif = document.getElementById('cfg-rif').value || "";
    window.perfilNegocio.tlf = document.getElementById('cfg-tlf').value || "";
    window.perfilNegocio.dir = document.getElementById('cfg-dir').value || "";
    window.perfilNegocio.pin = document.getElementById('cfg-pin').value || atob(HASH_ADMIN);
    window.perfilNegocio.pmBanco = (document.getElementById('cfg-pm-banco').value || "0102").replace(/\D/g, '');
    window.perfilNegocio.pmCedula = (document.getElementById('cfg-pm-cedula').value || "V12345678").toUpperCase().replace(/\s/g, '');
    window.perfilNegocio.pmTlf = (document.getElementById('cfg-pm-tlf').value || "04121234567").replace(/\D/g, '');
    window.sincronizarConNube();
    window.mostrarToast("Perfil actualizado");
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
    window.mostrarToast("Exportación completada");
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
            } else window.mostrarFeedbackAnimado('error', 'Formato JSON Inválido');
        } catch(err) { window.mostrarFeedbackAnimado('error', 'Error leyendo archivo'); }
    };
    if(event.target.files && event.target.files[0]) fileReader.readAsText(event.target.files[0]);
};

window.calcularGanancia = function() {
    let costo = parseFloat(document.getElementById('prod-costo').value) || 0;
    let margen = parseFloat(document.getElementById('prod-margen').value) || 0;
    document.getElementById('lbl-precio-calc').innerText = "$" + (costo + (costo * (margen / 100))).toFixed(2);
};

window.conmutarCampoCantidad = function(tipo) {
    let eQty = document.getElementById('prod-qty');
    if(eQty) eQty.style.display = (tipo === 'peso') ? 'none' : 'block';
};

window.editarProducto = function(id) {
    let p = window.productos.find(x => x.id === id);
    if(!p) return;
    
    window.productoEnEdicion = p.id;
    document.getElementById('prod-name').value = p.nombre;
    document.getElementById('prod-costo').value = p.costo || 0;
    document.getElementById('prod-margen').value = p.margen || 0;
    document.getElementById('prod-cat').value = p.categoria || "Víveres";
    document.getElementById('prod-type').value = p.tipo || "unidad";
    document.getElementById('prod-qty').value = p.qty || 0;
    document.getElementById('prod-serial').value = p.serial || "";
    document.getElementById('prod-iva').checked = p.iva || false;
    
    document.getElementById('lbl-img-upload').innerText = p.imagenUrl ? "✓ Imagen Guardada" : "📸 Cambiar Foto";

    window.conmutarCampoCantidad(p.tipo);
    window.calcularGanancia();
    
    document.getElementById('btn-guardar-prod').innerText = "Actualizar Producto";
    document.getElementById('btn-cancelar-edicion').style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.eliminarProductoCat = function(id) {
    window.mostrarConfirmacion("🗑️ Eliminar Producto", "¿Estás seguro de eliminar este producto del inventario?", function() {
        window.productos = window.productos.filter(p => p.id !== id);
        window.renderizarInventario(document.getElementById('buscador-inventario').value);
        window.sincronizarConNube();
        window.mostrarToast("Producto eliminado");
    });
};

window.cancelarEdicion = function() {
    window.productoEnEdicion = null;
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
    document.getElementById('lbl-img-upload').innerText = "📸 Subir Foto de Producto (Opcional)";

    window.conmutarCampoCantidad("unidad");
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
        if(textoFiltro && p.nombre.toLowerCase().indexOf(textoFiltro) === -1) return;

        let indicadorStock = p.tipo === 'peso' ? '<span class="badge-peso">⚖️ Al Peso</span>' : '<span class="stock-indicator">Stock: ' + p.qty + ' unds</span>';
        let iconoRender = p.imagenUrl ? `<img src="${p.imagenUrl}" class="product-img" alt="${window.escapeHTML(p.nombre)}">` : `<div style="background:#1b202e; padding:10px; border-radius:8px; font-size:22px; margin-top:12px;">📦</div>`;
        let stringIva = p.iva ? ' <span style="font-size:10px; color:#ff5252;">(+IVA)</span>' : '';
        let precioFinalUSD = p.iva ? (p.precio * 1.16) : p.precio;
        let precioBs = precioFinalUSD * window.tasaDia; 
        
        html += `<div class="product-card">
            <div class="tag-cat">${window.escapeHTML(p.categoria || "General")}</div>
            ${iconoRender}
            <h4>${window.escapeHTML(p.nombre)}${stringIva}</h4>
            <p style="color:#00ff66; margin:2px 0;">${window.formatUSD(precioFinalUSD)}</p>
            <p style="font-size:11px; color:#8fa0b7; margin-bottom:4px;">${window.formatVE(precioBs)}</p>
            ${indicadorStock}
            <div style="display:flex; gap:6px; margin-top:6px;">`;
            
        if(window.rolActual === "Administrador 👑") {
            html += `<button style="flex:1; background:#313c52; color:#fff; border:none; padding:6px; border-radius:6px; cursor:pointer;" onclick="window.editarProducto(${p.id})">✏️</button>
                     <button style="flex:1; background:#ff5252; color:#fff; border:none; padding:6px; border-radius:6px; cursor:pointer;" onclick="window.eliminarProductoCat(${p.id})">🗑️</button>`;
        }
        html += `<button style="flex:3; background:#00ff66; border:none; padding:6px; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="window.agregarAlCarritoDesdeCaja(${p.id})">➕ Facturar</button></div></div>`;
    });
    contenedor.innerHTML = html;
};

// Modificada para ser asíncrona y soportar Firebase Storage
window.agregarProductoNuevo = async function() {
    let name = document.getElementById('prod-name').value;
    let costo = parseFloat(document.getElementById('prod-costo').value) || 0;
    let margen = parseFloat(document.getElementById('prod-margen').value) || 0;
    let price = costo + (costo * (margen / 100));

    let serial = document.getElementById('prod-serial').value || "";
    let type = document.getElementById('prod-type').value;
    let cat = document.getElementById('prod-cat').value;
    let qty = parseInt(document.getElementById('prod-qty').value) || 0;
    let aplicaIva = document.getElementById('prod-iva').checked;

    if(!name || price <= 0) { window.mostrarFeedbackAnimado('error', 'Ingresa datos válidos'); return; }

    let fileInput = document.getElementById('prod-imagen-file');
    let imagenUrl = null;

    if (fileInput.files.length > 0) {
        window.mostrarToast("Subiendo imagen...");
        try {
            let file = fileInput.files[0];
            let storageRef = ref(storage, 'productos/' + Date.now() + '_' + file.name);
            await uploadBytesResumable(storageRef, file);
            imagenUrl = await getDownloadURL(storageRef);
        } catch (error) {
            window.mostrarFeedbackAnimado('error', 'Error subiendo foto');
            return;
        }
    }

    if(window.productoEnEdicion !== null) {
        let p = window.productos.find(x => x.id === window.productoEnEdicion);
        if(p) {
            Object.assign(p, { nombre: name, costo, margen, precio: price, tipo: type, categoria: cat, qty, serial, iva: aplicaIva });
            if(imagenUrl) p.imagenUrl = imagenUrl;
        }
        window.mostrarToast("✓ Producto actualizado");
    } else {
        window.productos.push({ id: Date.now(), nombre: name, costo, margen, precio: price, tipo: type, categoria: cat, qty, serial, iva: aplicaIva, imagenUrl: imagenUrl, emoji: type === 'peso' ? '🍎' : '📦' });
        window.mostrarToast("✓ Producto guardado");
    }
    
    await window.sincronizarConNube();
    window.cancelarEdicion();
    window.renderizarInventario("");
};

window.filtrarBuscadorCaja = function(texto) {
    let contenedor = document.getElementById('resultados-busqueda-caja');
    if(!texto) { contenedor.innerHTML = ""; return; }
    
    let html = ""; let encontrados = 0;
    window.productos.forEach(p => {
        if((p.tipo === 'peso' || p.qty > 0 || p.tipo === 'combo') && p.nombre.toLowerCase().includes(texto.toLowerCase())) {
            let precioFinalUSD = p.iva ? (p.precio * 1.16) : p.precio;
            html += `<button class="btn-search-result" onclick="window.agregarAlCarritoDesdeCaja(${p.id})">
                <span>📦 ${window.escapeHTML(p.nombre)}</span>
                <span style="color:#00ff66; font-weight:bold;">${window.formatUSD(precioFinalUSD)}</span>
            </button>`;
            encontrados++;
        }
    });
    contenedor.innerHTML = encontrados === 0 ? '<div style="color:#8fa0b7; font-size:12px; text-align:center;">No hay resultados</div>' : html;
};

window.abrirModalCombos = function() {
    let container = document.getElementById('lista-combos-activos');
    let html = ""; let hayCombos = false;
    
    window.productos.forEach(p => {
        if(p.tipo === 'combo') {
            hayCombos = true;
            let precioFinalUSD = p.iva ? (p.precio * 1.16) : p.precio;
            html += `<button class="btn-search-result" style="border-color:#00ff66;" onclick="window.agregarCombo(${p.id})">
                <span>🎁 ${window.escapeHTML(p.nombre)}</span>
                <span style="color:#00ff66; font-weight:bold;">${window.formatUSD(precioFinalUSD)}</span>
            </button>`;
        }
    });
    container.innerHTML = hayCombos ? html : '<div style="color:#8fa0b7; text-align:center; padding:10px;">No hay combos.</div>';
    document.getElementById('modal-combos').style.display = 'flex';
};

window.agregarCombo = function(id) { window.agregarAlCarritoDesdeCaja(id); document.getElementById('modal-combos').style.display = 'none'; };

window.agregarAlCarritoDesdeCaja = function(idProd) {
    let p = window.productos.find(x => x.id == idProd);
    if(!p) return;

    let precioUnitarioCalculado = p.iva ? (p.precio * 1.16) : p.precio;
    let costoUnitarioCalculado = p.costo || 0;

    if(p.tipo === 'peso') {
        let kilos = parseFloat(prompt("⚖️ Balanza Virtual\nCantidad en Kilos para " + p.nombre + ":", "1.0"));
        if(isNaN(kilos) || kilos <= 0) return;
        
        window.carrito.push({ id: p.id, nombre: p.nombre, totalUSD: precioUnitarioCalculado * kilos, costoTotalUSD: costoUnitarioCalculado * kilos, detalle: kilos + ' kg', tipo: p.tipo, qtyVenta: kilos, precioUnitario: precioUnitarioCalculado, costoUnitario: costoUnitarioCalculado });
    } else {
        if(p.tipo !== 'combo' && p.qty < 1) { window.mostrarFeedbackAnimado('error', 'Sin Stock'); return; }
        
        let item = window.carrito.find(c => c.id === p.id && c.tipo !== 'peso');
        if(p.tipo !== 'combo') { p.qty -= 1; window.sincronizarConNube(); }

        if(item) {
            item.qtyVenta += 1;
            item.totalUSD += precioUnitarioCalculado;
            item.costoTotalUSD += costoUnitarioCalculado;
            item.detalle = item.qtyVenta + ' unds';
        } else {
            window.carrito.push({ id: p.id, nombre: p.nombre, totalUSD: precioUnitarioCalculado, costoTotalUSD: costoUnitarioCalculado, detalle: '1 unds', tipo: p.tipo, qtyVenta: 1, precioUnitario: precioUnitarioCalculado, costoUnitario: costoUnitarioCalculado });
        }
    }
    
    window.recalcularTotalesCarrito();
    window.mostrarToast("+ Agregado al carrito");
    window.renderizarCarritoCaja();
    document.getElementById('buscador-caja').value = "";
    document.getElementById('resultados-busqueda-caja').innerHTML = "";
};

window.sumarItem = function(index) {
    let item = window.carrito[index];
    if(item.tipo === 'peso') return; 
    let p = window.productos.find(x => x.id === item.id);
    
    if(item.tipo !== 'combo') {
        if(!p || p.qty < 1) { window.mostrarFeedbackAnimado('error', 'Sin más stock'); return; }
        p.qty -= 1; 
        window.sincronizarConNube();
    }
    item.qtyVenta += 1;
    item.totalUSD += item.precioUnitario;
    item.costoTotalUSD += item.costoUnitario;
    item.detalle = item.qtyVenta + ' unds';

    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
};

window.restarItem = function(index) {
    let item = window.carrito[index];
    if(item.tipo === 'peso') return;

    if(item.tipo !== 'combo') {
        let p = window.productos.find(x => x.id === item.id);
        if(p) p.qty += 1;
        window.sincronizarConNube();
    }

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
    if(item.tipo !== 'peso' && item.tipo !== 'combo') {
        let p = window.productos.find(x => x.id === item.id);
        if(p) p.qty += item.qtyVenta;
        window.sincronizarConNube();
    }
    window.carrito.splice(index, 1);
    window.recalcularTotalesCarrito();
    window.renderizarCarritoCaja();
};

window.recalcularTotalesCarrito = function() {
    window.totalVentaUSD = window.carrito.reduce((sum, item) => sum + item.totalUSD, 0);
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
            html += `<div class="cart-item">
                <div style="flex:1;">📦 ${window.escapeHTML(item.nombre)}<br><small style="color:#8fa0b7;">${window.formatVE(item.totalUSD * window.tasaDia)}</small></div>`;
            
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

    document.getElementById('grand-total-usd').innerText = window.formatUSD(window.totalVentaUSD);
    let vesEl = document.getElementById('grand-total-ves');
    if(vesEl) {
        vesEl.innerText = window.formatVE(window.totalVentaVES);
        vesEl.classList.add('pulse-number');
        setTimeout(() => vesEl.classList.remove('pulse-number'), 200);
    }
    window.calcularCaja();
};

window.toggleMetodoPago = function(idContenedor, btn) {
    let el = document.getElementById(idContenedor);
    if(!el) return;
    if (el.classList.contains('show')) {
        el.classList.remove('show');
        btn.classList.remove('active');
    } else {
        el.classList.add('show');
        btn.classList.add('active');
    }
};

window.actualizarEtiquetasPago = function() {
    let ptv = window.extraerNumeroLimpio('pay-ptv');
    let pm = window.extraerNumeroLimpio('pay-pm');
    let usd = parseFloat(document.getElementById('pay-usd').value) || 0;
    let ves = window.extraerNumeroLimpio('pay-ves');

    document.getElementById('label-monto-ptv').innerText = window.formatVE(ptv);
    document.getElementById('label-monto-pm').innerText = window.formatVE(pm);
    document.getElementById('label-monto-usd').innerText = "$" + usd.toFixed(2);
    document.getElementById('label-monto-ves').innerText = window.formatVE(ves);
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

    let faltanteVES = Math.max(0, window.totalVentaVES - ingresadoActual);

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
    window.mostrarFeedbackAnimado('exito', 'Venta Cobrada Exitosamente');
    if(imprimirTicket) window.imprimirTicket(window.ventasHistorico.length - 1);
    window.limpiarCaja(true); 
};

window.limpiarCaja = function(silencioso) {
    if(!silencioso) {
        window.carrito.forEach(c => {
            if(c.tipo !== 'peso' && c.tipo !== 'combo') {
                let p = window.productos.find(x => x.id === c.id);
                if(p) p.qty += c.qtyVenta;
            }
        });
        window.sincronizarConNube();
        window.mostrarToast("Venta cancelada, stock devuelto");
    }

    window.totalVentaUSD = 0; window.totalVentaVES = 0; window.carrito = [];
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

window.aparcarFactura = function() {
    if(window.carrito.length === 0) { window.mostrarFeedbackAnimado('error', 'Carrito Vacío'); return; }
    window.facturasEnEspera.push({
        id: Date.now(),
        cliente: document.getElementById('cliente-nombre').value || "Cliente sin nombre",
        items: window.carrito.slice(),
        totalUSD: window.totalVentaUSD,
        totalVES: window.totalVentaVES,
        cajero: window.usuarioActivoNombre
    });
    window.sincronizarConNube();
    window.limpiarCaja(true);
    window.mostrarToast("⏸️ Factura Pausada");
};

window.recuperarFactura = function() {
    if(window.facturasEnEspera.length === 0) { window.mostrarFeedbackAnimado('error', 'No hay facturas pausadas'); return; }
    if(window.carrito.length > 0) { window.mostrarFeedbackAnimado('error', 'Limpia o procesa la venta actual'); return; }
    
    let text = "Facturas Guardadas:\n" + window.facturasEnEspera.map((f, i) => `${i+1}. ${f.cliente} (${window.formatVE(f.totalVES)})`).join('\n');
    let idx = parseInt(prompt(text)) - 1;
    
    if(!isNaN(idx) && window.facturasEnEspera[idx]) {
        let rec = window.facturasEnEspera.splice(idx, 1)[0];
        window.carrito = rec.items;
        window.recalcularTotalesCarrito();
        document.getElementById('cliente-nombre').value = rec.cliente !== "Cliente sin nombre" ? rec.cliente : "";
        window.renderizarCarritoCaja();
        window.sincronizarConNube();
        window.mostrarToast("📂 Factura Recuperada");
    }
};

window.registrarFiado = function() {
    if(window.carrito.length === 0) { window.mostrarFeedbackAnimado('error', 'Carrito Vacío'); return; }
    let nom = document.getElementById('cliente-nombre').value || prompt("Nombre del Cliente a Fiar:");
    if(nom) {
        window.fiados.push({
            id: Date.now(), cliente: nom, tlf: document.getElementById('pm-phone').value || prompt("Teléfono:"),
            montoUSD: window.totalVentaUSD, items: window.carrito.slice(), fecha: new Date().toLocaleString()
        });
        window.sincronizarConNube();
        window.limpiarCaja(true);
        window.mostrarToast("✓ Deuda Registrada");
    }
};

window.renderizarFiados = function() {
    let cont = document.getElementById('lista-fiados-container');
    if(!cont) return;
    
    if(window.fiados.length === 0) {
        cont.innerHTML = "<div style='text-align:center; color:#8fa0b7; font-size:12px; padding:10px;'>No hay deudas registradas.</div>";
        return;
    }

    cont.innerHTML = window.fiados.map((f, idx) => `
        <div class="cierre-card">
            <h4 style="color:#ffc107; margin:0; border-color:#ffc107;">👤 ${window.escapeHTML(f.cliente)}</h4>
            <div class="cierre-item">Fecha: <span>${f.fecha}</span></div>
            <div class="cierre-item">Monto Fijado ($): <span>$${f.montoUSD.toFixed(2)}</span></div>
            <div class="cierre-item" style="color:#00ff66; font-size:13px;">Al Dólar Hoy: <span style="color:#00ff66;">${window.formatVE(f.montoUSD * window.tasaDia)}</span></div>
            <button class="btn-charge" style="margin-top:8px; width:100%; background:#00ff66; color:#000;" onclick="window.cobrarFiado(${idx})">PAGAR DEUDA</button>
        </div>
    `).join('');
};

window.cobrarFiado = function(idx) {
    window.mostrarConfirmacion("💳 Cobrar Deuda", "¿Confirmas el pago de la deuda?", function() {
        window.fiados.splice(idx, 1);
        window.sincronizarConNube();
        window.renderizarFiados();
        window.mostrarToast("✓ Deuda Saldada");
    });
};

// CÁMARA Y ESCÁNER BLINDADOS
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
        { facingMode: "environment" }, { fps: 10, qrbox: { width: 220, height: 130 } },
        text => {
            window.cerrarCamaraEnVivo();
            if(modo === 'registro') {
                document.getElementById('prod-serial').value = text;
                window.mostrarFeedbackAnimado('exito', 'Código Leído');
            } else {
                let match = window.productos.find(p => p.serial === text);
                if(match) { window.mostrarFeedbackAnimado('exito', match.nombre); window.agregarAlCarritoDesdeCaja(match.id); }
                else window.mostrarFeedbackAnimado('error', 'No Registrado');
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
            document.getElementById('prod-serial').value = text;
            window.mostrarFeedbackAnimado('exito', 'Leído');
        } else {
            let match = window.productos.find(p => p.serial === text);
            if(match) window.agregarAlCarritoDesdeCaja(match.id);
            else window.mostrarFeedbackAnimado('error', 'No Registrado');
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

window.enviarDatosPagoMovilWS = function() {
    let msj = `📲 *DATOS PAGO MÓVIL*\n🏢 *${window.perfilNegocio.nombre}*\n🏦 Banco: ${window.perfilNegocio.pmBanco}\n🪪 CI: ${window.perfilNegocio.pmCedula}\n📞 Tlf: ${window.perfilNegocio.pmTlf}\n\n💵 Total: *${window.formatVE(window.totalVentaVES)}*`;
    let tlf = document.getElementById('pm-phone').value.replace(/\D/g, '');
    window.open(tlf ? `https://api.whatsapp.com/send?phone=${tlf}&text=${encodeURIComponent(msj)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msj)}`, '_blank');
};

window.renderizarCierreDeCaja = function() {
    let tPM = 0, tUSD = 0, tVES = 0, tPTV = 0, tVUSD = 0, tCUSD = 0;
    let html = window.ventasHistorico.map((v, i) => {
        tPM += v.pm; tUSD += v.usd; tVES += v.ves; tPTV += v.ptv; 
        tVUSD += v.totalUSD; tCUSD += (v.costoUSD || 0);
        return `<div class="cierre-card">
            <div style="display:flex; justify-content:space-between;"><h4>🛒 ${v.fecha}</h4></div>
            ${v.cliente ? `<div style="color:#fff; font-size:11px; margin-bottom:4px;">Cliente: ${window.escapeHTML(v.cliente)}</div>` : ''}
            <div class="cierre-item">Total Factura: <span style="font-size:14px; color:#00ff66;">${window.formatVE(v.totalVES)}</span></div>
            <div style="display:flex; gap:6px; margin-top:8px;">
                <button style="flex:1; background:#fff; color:#000; font-weight:bold; border:none; padding:6px; border-radius:6px;" onclick="window.imprimirTicket(${i})">🖨️ Ticket</button>
                <button style="flex:1; background:#ff5252; color:#fff; font-weight:bold; border:none; padding:6px; border-radius:6px;" onclick="window.anularVenta(${i})">❌ Anular</button>
            </div></div>`;
    }).join('');
    
    document.getElementById('lista-historial-ventas').innerHTML = html || '<div style="text-align:center; color:#57687e; font-size:12px;">Sin ventas registradas.</div>';
    document.getElementById('resumen-ptv').innerText = window.formatVE(tPTV);
    document.getElementById('resumen-pm').innerText = window.formatVE(tPM);
    document.getElementById('resumen-ves').innerText = window.formatVE(tVES);
    document.getElementById('resumen-ganancia-ves').innerText = window.formatVE((tVUSD - tCUSD) * window.tasaDia);
    document.getElementById('resumen-efectivo-usd').innerText = "$" + tUSD.toFixed(2);
    document.getElementById('cierre-fondo-usd').innerText = "$" + window.fondoCaja.usd.toFixed(2);
    document.getElementById('cierre-fondo-ves').innerText = window.formatVE(window.fondoCaja.ves);
    document.getElementById('esperado-usd').innerText = "$" + (window.fondoCaja.usd + tUSD).toFixed(2);
    document.getElementById('esperado-ves').innerText = window.formatVE(window.fondoCaja.ves + tVES);
};

window.anularVenta = function(idx) {
    window.mostrarConfirmacion("❌ Anular Venta", "¿Deseas anular esta venta y devolver stock?", function() {
        window.ventasHistorico[idx].items.forEach(it => {
            if(it.tipo !== 'peso' && it.tipo !== 'combo') {
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
    window.mostrarConfirmacion("⚠️ Reiniciar Día", "¿Borrar todas las ventas registradas?", function() {
        window.ventasHistorico = [];
        window.sincronizarConNube();
        window.renderizarCierreDeCaja();
    });
};

window.imprimirCierreZ = function() {
    let pw = window.open('', '_blank');
    if(!pw) return;
    let html = `<html><head><style>body{font-family:monospace; width:280px; padding:10px; font-size:12px; color:#000;} .center{text-align:center;} .line{border-bottom:1px dashed #000; margin:5px 0;} .row{display:flex; justify-content:space-between;}</style></head>
    <body><div class="center"><strong>REPORTE Z</strong><br>${new Date().toLocaleString()}</div><div class="line"></div>`;
    html += `<div class="row"><span>Ventas totales:</span><span>${window.ventasHistorico.length}</span></div>`;
    html += `<div class="line"></div><div class="center">Firma Cajero</div><script>window.onload=function(){window.print();window.close();}<\/script></body></html>`;
    pw.document.write(html); pw.document.close();
};

window.imprimirTicket = function(idx) {
    let v = window.ventasHistorico[idx];
    if(!v) return;
    let pw = window.open('', '_blank');
    if(!pw) return;
    let itemsStr = v.items.map(it => `<div>${window.escapeHTML(it.nombre)}</div><div class="row"><span>${it.qtyVenta || it.detalle} x ${window.formatUSD(it.precioUnitario)}</span><span>${window.formatVE(it.totalUSD * window.tasaDia)}</span></div>`).join('');
    let html = `<html><head><style>body{font-family:monospace; width:280px; padding:10px; font-size:12px; color:#000;} .center{text-align:center;} .line{border-bottom:1px dashed #000; margin:5px 0;} .row{display:flex; justify-content:space-between;}</style></head>
    <body><div class="center"><strong>${window.escapeHTML(window.perfilNegocio.nombre)}</strong><br>Fecha: ${v.fecha}</div><div class="line"></div>
    ${itemsStr}<div class="line"></div>
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
        let text = res.data.text.toLowerCase();
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
