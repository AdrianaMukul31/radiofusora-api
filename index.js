require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); 
const PDFDocument = require('pdfkit'); 
const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken'); 

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_para_sim_radio';

// --- CONFIGURACIÓN DE CORS ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'] 
}));

app.use(express.json());

// Servir archivos estáticos para los PDFs y XMLs
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME || process.env.DB_DATABASE, 
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    connectionTimeoutMillis: 2000, 
});

// ==========================================
// --- MIDDLEWARE DE AUTORIZACIÓN ---
// ==========================================
const verifyRole = (rolesPermitidos) => {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader) return res.status(403).json({ error: "No se proporcionó un token" });

        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            if (!rolesPermitidos.includes(decoded.rol)) {
                return res.status(401).json({ error: "No tienes permisos para realizar esta acción" });
            }
            next();
        } catch (err) {
            return res.status(401).json({ error: "Token inválido o expirado" });
        }
    };
};

// ==========================================
// --- FUNCIONES DE GENERACIÓN DE ARCHIVOS ---
// ==========================================

const crearArchivoXML = (datos, rutaDestino) => {
    const fechaContratoInfo = (datos.detalles && datos.detalles.length > 0 && datos.detalles[0].periodo_inicio && datos.detalles[0].periodo_inicio !== 'null')
        ? ` PERIODO DEL ${datos.detalles[0].periodo_inicio} AL ${datos.detalles[0].periodo_fin}`
        : '';

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante 
    xmlns:cfdi="http://www.sat.gob.mx/cfd/4" 
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
    xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" 
    xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"
    Version="4.0" 
    Folio="${datos.folio_cfdi}" 
    Fecha="${datos.fecha_emision}T12:00:00" 
    SubTotal="${datos.subtotal}" 
    Total="${datos.total}" 
    Moneda="MXN" 
    TipoDeComprobante="I" 
    Exportacion="01" 
    MetodoPago="PUE" 
    LugarExpedicion="97000">
    <cfdi:Emisor Rfc="SIM123456ABC" Nombre="SOLUCIONES INTEGRALES MULTIMEDIA S.A. de C.V." RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="${datos.rfc_cliente}" Nombre="${datos.razon_social}" RegimenFiscalReceptor="${datos.regimen_fiscal || '601'}" UsoCFDI="${datos.uso_cfdi || 'G03'}" DomicilioFiscalReceptor="${datos.codigo_postal || '97000'}"/>
    <cfdi:Conceptos>
        <cfdi:Concepto ClaveProdServ="82101601" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicios de Publicidad y Spots de Radio${fechaContratoInfo}" ValorUnitario="${datos.subtotal}" Importe="${datos.subtotal}" ObjetoImp="02">
            <cfdi:Impuestos>
                <cfdi:Traslados>
                    <cfdi:Traslado Base="${datos.subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${datos.iva}"/>
                </cfdi:Traslados>
            </cfdi:Impuestos>
        </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="${datos.iva}">
        <cfdi:Traslados>
            <cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${datos.iva}" Base="${datos.subtotal}"/>
        </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital 
            Version="1.1" 
            UUID="${datos.folio_cfdi}-GENERADO-SIM" 
            FechaTimbrado="${datos.fecha_emision}T12:00:05"
            RfcProvCertif="SAT970701NN3"
            SelloCFD="ABC123SelloFicticio"
            NoCertificadoSAT="00001000000504465028"
            SelloSAT="XYZ789SelloSATFicticio"/>
    </cfdi:Complemento>
</cfdi:Comprobante>`;

    fs.writeFileSync(rutaDestino, xmlContent, 'utf8');
};

// ==========================================
// FUNCIÓN PDF CON DISEÑO MEJORADO
// ==========================================
const crearArchivoPDF = (datos, rutaDestino) => {
    const doc = new PDFDocument({ margin: 30, size: 'LETTER' });
    const stream = fs.createWriteStream(rutaDestino);
    doc.pipe(stream);

    const colorPrimary = '#1a2a6c';
    const colorSecondary = '#b21f1f';
    const colorAccent = '#fdbb4d';
    const colorGrayLight = '#f8f9fc';

    // Encabezado
    doc.rect(30, 30, 550, 5).fill(colorAccent);
    doc.rect(30, 35, 550, 85).fill(colorPrimary);
    doc.rect(30, 35, 550, 42).fill(colorSecondary);
    
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
        .text('RADIOFUSORA', 50, 55);
    doc.fontSize(9).font('Helvetica')
        .text('Soluciones Integrales Multimedia', 50, 82);
    doc.fontSize(8)
        .text('RFC: SIM123456ABC', 50, 98);
    
    doc.rect(380, 50, 190, 55).fill(colorAccent);
    doc.fillColor(colorPrimary).fontSize(8).font('Helvetica-Bold')
        .text('FOLIO FISCAL', 395, 58);
    doc.fontSize(14).font('Helvetica-Bold')
        .text(datos.folio_cfdi, 395, 70);
    doc.fontSize(8).font('Helvetica')
        .text(`Fecha: ${datos.fecha_emision}`, 395, 92);
    
    doc.fillColor('black');
    
    // Paneles de información
    let currentY = 140;
    
    doc.rect(30, currentY, 270, 95).fill(colorGrayLight);
    doc.rect(30, currentY, 270, 20).fill(colorPrimary);
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
        .text(' DATOS DEL EMISOR', 40, currentY + 5);
    
    doc.fillColor('black').fontSize(8).font('Helvetica');
    doc.text('SOLUCIONES INTEGRALES MULTIMEDIA S.A. de C.V.', 40, currentY + 28, { width: 250 });
    doc.text('RFC: SIM123456ABC', 40, currentY + 44);
    doc.text('Calle 60 · Mérida, Yucatán, México', 40, currentY + 60);
    doc.text('Régimen Fiscal: 601 - General de Ley Personas Morales', 40, currentY + 76);
    
    doc.rect(310, currentY, 270, 95).fill(colorGrayLight);
    doc.rect(310, currentY, 270, 20).fill(colorPrimary);
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
        .text(' DATOS DEL RECEPTOR', 320, currentY + 5);
    
    doc.fillColor('black').fontSize(8).font('Helvetica');
    doc.text(datos.razon_social || 'N/A', 320, currentY + 28, { width: 250, bold: true });
    doc.text(`RFC: ${datos.rfc_cliente || 'N/A'}`, 320, currentY + 44);
    doc.text(`Régimen Fiscal: ${datos.regimen_fiscal || 'Sin régimen'}`, 320, currentY + 60);
    doc.text(`Uso CFDI: ${datos.uso_cfdi || 'G03'}`, 320, currentY + 76);
    
    const direccion = `${datos.calle || ''} ${datos.no_exterior || ''}, ${datos.ciudad || ''}, ${datos.estado || ''}, CP: ${datos.codigo_postal || '97000'}`;
    if (direccion.trim() !== ' , , , CP: 97000') {
        doc.text(`Domicilio: ${direccion}`, 320, currentY + 92, { width: 250 });
    }
    
    currentY += 110;
    
    // Tabla de servicios
    doc.rect(30, currentY, 550, 22).fill(colorPrimary);
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
    doc.text('Cant.', 40, currentY + 6);
    doc.text('Descripcion del Servicio', 100, currentY + 6);
    doc.text('P. Unitario', 430, currentY + 6, { align: 'right', width: 100 });
    doc.text('Importe', 535, currentY + 6, { align: 'right', width: 80 });
    
    currentY += 22;
    doc.fillColor('black').fontSize(9).font('Helvetica');
    
    let cantidad = 1;
    let periodoTexto = '';
    let montoFacturado = parseFloat(datos.subtotal) || 0;
    let idContrato = 'N/A';
    
    if (datos.detalles && datos.detalles.length > 0) {
        cantidad = datos.detalles.length;
        const det = datos.detalles[0];
        idContrato = det.id_contrato || 'N/A';
        if (det.periodo_inicio && det.periodo_fin && det.periodo_inicio !== 'null' && det.periodo_fin !== 'null') {
            periodoTexto = `\nPeriodo: ${det.periodo_inicio} al ${det.periodo_fin}`;
        }
        montoFacturado = parseFloat(det.monto_facturado) || montoFacturado;
    }
    
    const precioUnitario = (montoFacturado / cantidad).toFixed(2);
    
    doc.text(cantidad.toString(), 40, currentY + 5);
    doc.text(`Spots de Radio · Contrato #${idContrato}`, 100, currentY + 5, { width: 320 });
    doc.text(`$${precioUnitario}`, 430, currentY + 5, { align: 'right', width: 100 });
    doc.text(`$${montoFacturado.toFixed(2)}`, 535, currentY + 5, { align: 'right', width: 80 });
    
    if (periodoTexto) {
        doc.fontSize(7).fillColor('#2e7d32').text(periodoTexto, 100, currentY + 18, { width: 320 });
        currentY += 15;
    }
    
    currentY += 30;
    
    // Totales
    const totalTop = Math.max(currentY + 20, 470);
    
    doc.strokeColor(colorAccent).lineWidth(2).moveTo(380, totalTop).lineTo(580, totalTop).stroke();
    
    doc.fontSize(9).font('Helvetica');
    doc.text('SUBTOTAL:', 400, totalTop + 12);
    doc.text(`$${parseFloat(datos.subtotal).toFixed(2)}`, 520, totalTop + 12, { align: 'right' });
    
    doc.text('IVA (16%):', 400, totalTop + 32);
    doc.text(`$${parseFloat(datos.iva).toFixed(2)}`, 520, totalTop + 32, { align: 'right' });
    
    doc.fontSize(12).font('Helvetica-Bold').fillColor(colorPrimary);
    doc.text('TOTAL:', 400, totalTop + 55);
    doc.text(`$${parseFloat(datos.total).toFixed(2)}`, 520, totalTop + 55, { align: 'right' });
    
    doc.fillColor('black').fontSize(8).font('Helvetica');
    doc.text('Método de Pago: Transferencia Electrónica (PUE)', 400, totalTop + 78);
    
    // Pie de página
    const footerTop = 670;
    
    doc.fillColor(colorPrimary).fontSize(7).font('Helvetica-Bold')
        .text('SELLO DIGITAL DEL CFDI', 30, footerTop);
    
    doc.fillColor('black').fontSize(6).font('Courier')
        .text(`${datos.folio_cfdi}-GENERADO-POR-SISTEMA-SIM-VALIDO-CONTRATO-${idContrato}`, 30, footerTop + 12, { width: 550 });
    
    doc.fillColor('#666666').fontSize(7).font('Helvetica')
        .text('Este documento es una representación impresa de un CFDI v4.0', 30, footerTop + 35, { align: 'center' });
    
    doc.rect(30, footerTop + 55, 550, 3).fill(colorAccent);
    
    doc.end();
};

// ==========================================
// --- FUNCIÓN PARA ACTUALIZAR SPOTS TRANSMITIDOS AUTOMÁTICAMENTE ---
// ==========================================
async function actualizarSpotsTransmitidos() {
    try {
        const result = await pool.query(`
            UPDATE "programación" 
            SET estado = 'Transmitido' 
            WHERE fecha_transmision < NOW() 
            AND estado = 'Programado'
            RETURNING id_programacion
        `);
        if (result.rowCount > 0) {
            console.log(`📡 ${result.rowCount} spots actualizados a "Transmitido"`);
        }
    } catch (err) {
        console.error("Error actualizando spots:", err);
    }
}

// ==========================================
// --- FUNCIÓN PARA GENERAR SPOTS AUTOMÁTICOS ---
// ==========================================
function generarSpotsPorPatron(id_anuncio, spotsTotales, spotsPorSemana, diasSemana, horario, fechaInicio, fechaFin) {
    const spotsGenerados = [];
    let spotsCreados = 0;
    
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    
    const diasMap = {
        'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 
        'Jueves': 4, 'Viernes': 5, 'Sábado': 6, 'Domingo': 0
    };
    
    const diasSeleccionadosNum = diasSemana.map(d => diasMap[d]);
    const [hora, minuto] = horario.split(':');
    
    let fechaActual = new Date(inicio);
    
    while (!diasSeleccionadosNum.includes(fechaActual.getDay()) && fechaActual <= fin) {
        fechaActual.setDate(fechaActual.getDate() + 1);
    }
    
    while (spotsCreados < spotsTotales && fechaActual <= fin) {
        const fechaStr = fechaActual.toISOString().split('T')[0];
        spotsGenerados.push({
            id_anuncio: id_anuncio,
            fecha_transmision: fechaStr,
            horario: horario,
            estado: 'Programado'
        });
        spotsCreados++;
        
        let diasAvance = Math.floor(7 / spotsPorSemana);
        if (diasAvance < 1) diasAvance = 1;
        
        fechaActual.setDate(fechaActual.getDate() + diasAvance);
        
        while (!diasSeleccionadosNum.includes(fechaActual.getDay()) && fechaActual <= fin) {
            fechaActual.setDate(fechaActual.getDate() + 1);
        }
    }
    
    return spotsGenerados;
}

// ==========================================
// --- FUNCIÓN PARA CONTAR SPOTS PROGRAMADOS ---
// ==========================================
async function contarSpotsProgramados(idContrato) {
    try {
        const result = await pool.query(`
            SELECT COUNT(*) as total
            FROM "programación" p
            JOIN "anuncios" a ON p.id_anuncio = a.id_anuncio
            WHERE a.id_contrato = $1
            AND p.estado = 'Programado'
        `, [idContrato]);
        return parseInt(result.rows[0].total) || 0;
    } catch (err) {
        console.error(`Error contando spots programados: ${err.message}`);
        return 0;
    }
}

// ==========================================
// --- FUNCIÓN PARA CONTAR SPOTS TRANSMITIDOS ---
// ==========================================
async function contarSpotsTransmitidos(idContrato) {
    try {
        const result = await pool.query(`
            SELECT COUNT(*) as total
            FROM "programación" p
            JOIN "anuncios" a ON p.id_anuncio = a.id_anuncio
            WHERE a.id_contrato = $1
            AND p.estado = 'Transmitido'
        `, [idContrato]);
        return parseInt(result.rows[0].total) || 0;
    } catch (err) {
        console.error(`Error contando spots transmitidos: ${err.message}`);
        return 0;
    }
}

// ==========================================
// --- FUNCIÓN PARA CALCULAR ESTADO DEL CONTRATO ---
// ==========================================
async function calcularEstadoContrato(estadoActual, spotsTotales, fechaInicio, fechaFin, idContrato) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    
    if (estadoActual === 'Cancelado') return 'Cancelado';
    if (estadoActual === 'Suspendido') return 'Suspendido';
    
    if (hoy > fin) return 'Terminado';
    if (hoy < inicio) return 'No Iniciado';
    
    const spotsTransmitidos = await contarSpotsTransmitidos(idContrato);
    const spotsProgramados = await contarSpotsProgramados(idContrato);
    
    if (spotsTransmitidos > 0 && spotsTransmitidos < spotsTotales) return 'En Curso';
    if (spotsProgramados > 0 && spotsTransmitidos === 0) return 'Activo';
    if (spotsTransmitidos === 0 && spotsProgramados === 0) return 'No Iniciado';
    if (spotsTransmitidos >= spotsTotales) return 'Terminado';
    
    return estadoActual;
}

// ==========================================
// --- FUNCIÓN PARA SINCRONIZAR ESTADOS DE ANUNCIOS ---
// ==========================================
async function sincronizarEstadosAnuncios(idContrato, nuevoEstadoContrato) {
    try {
        const result = await pool.query(
            'UPDATE "anuncios" SET estado = $1 WHERE id_contrato = $2 RETURNING id_anuncio',
            [nuevoEstadoContrato, idContrato]
        );
        console.log(`   📢 Sincronizados ${result.rowCount} anuncios a estado "${nuevoEstadoContrato}"`);
        return result.rowCount;
    } catch (err) {
        console.error(`Error sincronizando anuncios: ${err.message}`);
        return 0;
    }
}

// ✅ EJECUTAR AL INICIAR EL SERVIDOR
async function iniciarActualizaciones() {
    console.log("🔄 Actualizando spots transmitidos...");
    await actualizarSpotsTransmitidos();
    setInterval(actualizarSpotsTransmitidos, 60 * 60 * 1000);
}

// ==========================================
// --- SECCIÓN: USUARIOS (AUTH) ---
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nombre_usuario, correo_usuario, password_usuario } = req.body;
        const rolAsignado = 2;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(correo_usuario)) {
            return res.status(400).json({ error: "El formato del correo es inválido" });
        }
        if (password_usuario.length < 8) {
            return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
        }

        const userExist = await pool.query('SELECT * FROM usuarios WHERE correo_usuario = $1', [correo_usuario]);
        if (userExist.rows.length > 0) {
            return res.status(400).json({ error: "El correo ya está registrado" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password_usuario, salt);

        const newUser = await pool.query(
            'INSERT INTO usuarios (nombre_usuario, correo_usuario, password_usuario, rol_usuario) VALUES ($1, $2, $3, $4) RETURNING id_usuario, nombre_usuario, correo_usuario, rol_usuario',
            [nombre_usuario, correo_usuario, hashedPassword, rolAsignado]
        );

        res.status(201).json({ success: true, user: newUser.rows[0] });
    } catch (err) {
        res.status(500).json({ error: "Error en el registro: " + err.message });
    }
});

app.post('/api/auth/register-admin', verifyRole([1]), async (req, res) => {
    try {
        const { nombre_usuario, correo_usuario, password_usuario } = req.body;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(correo_usuario)) {
            return res.status(400).json({ error: "El formato del correo es inválido" });
        }
        if (password_usuario.length < 8) {
            return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
        }

        const userExist = await pool.query('SELECT * FROM usuarios WHERE correo_usuario = $1', [correo_usuario]);
        if (userExist.rows.length > 0) {
            return res.status(400).json({ error: "El correo ya está registrado" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password_usuario, salt);

        const newUser = await pool.query(
            'INSERT INTO usuarios (nombre_usuario, correo_usuario, password_usuario, rol_usuario) VALUES ($1, $2, $3, $4) RETURNING id_usuario, nombre_usuario, correo_usuario, rol_usuario',
            [nombre_usuario, correo_usuario, hashedPassword, 1]
        );

        res.status(201).json({ success: true, user: newUser.rows[0] });
    } catch (err) {
        res.status(500).json({ error: "Error al registrar administrador: " + err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { correo_usuario, password_usuario } = req.body;

        const result = await pool.query('SELECT * FROM usuarios WHERE correo_usuario = $1', [correo_usuario]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password_usuario, user.password_usuario);
        
        if (!validPassword) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        const token = jwt.sign({ id: user.id_usuario, rol: user.rol_usuario }, JWT_SECRET, { expiresIn: '24h' });

        res.json({
            success: true,
            token,
            user: { 
                id: user.id_usuario, 
                nombre: user.nombre_usuario, 
                correo: user.correo_usuario,
                rol: user.rol_usuario 
            }
        });
    } catch (err) {
        res.status(500).json({ error: "Error en el login: " + err.message });
    }
});

// ==========================================
// --- SECCIÓN 1: CLIENTES ---
// ==========================================

app.post('/api/clientes-integral', verifyRole([1, 2]), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { 
            razon_social, rfc_cliente, telefono_cliente, correo_cliente, 
            calle, no_exterior, no_interior, ciudad, estado, codigo_postal,
            regimen_fiscal, uso_cfdi, fecha_vigencia 
        } = req.body;

        const resCli = await client.query(
            'INSERT INTO "clientes" (razon_social, rfc_cliente, telefono_cliente, correo_cliente) VALUES ($1, $2, $3, $4) RETURNING id_cliente',
            [razon_social, rfc_cliente, telefono_cliente, correo_cliente]
        );
        const idNuevoCliente = resCli.rows[0].id_cliente;

        await client.query(
            'INSERT INTO "direcciones_cliente" (id_cliente, calle, no_exterior, no_interior, ciudad, estado, codigo_postal) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [idNuevoCliente, calle, no_exterior, no_interior, ciudad, estado, codigo_postal]
        );

        await client.query(
            'INSERT INTO "datos_fiscales" (id_cliente, regimen_fiscal, uso_cfdi, fecha_vigencia) VALUES ($1, $2, $3, $4)',
            [idNuevoCliente, regimen_fiscal, uso_cfdi, fecha_vigencia]
        );

        await client.query('COMMIT');
        res.status(201).json({ id_cliente: idNuevoCliente, message: "Cliente guardado exitosamente" });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/clientes', verifyRole([1, 2]), async (req, res) => {
    try {
        const query = `
            SELECT c.*, d.calle, d.no_exterior, d.no_interior, d.ciudad, d.estado, d.codigo_postal,
                    f.regimen_fiscal, f.uso_cfdi, f.fecha_vigencia
            FROM "clientes" c
            LEFT JOIN "direcciones_cliente" d ON c.id_cliente = d.id_cliente
            LEFT JOIN "datos_fiscales" f ON c.id_cliente = f.id_cliente
            ORDER BY c.id_cliente DESC`;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener clientes" });
    }
});

app.get('/api/clientes/rfc/:rfc', verifyRole([1, 2]), async (req, res) => {
    try {
        const { rfc } = req.params;
        const query = `
            SELECT c.*, d.calle, d.no_exterior, d.no_interior, d.ciudad, d.estado, d.codigo_postal,
                    f.regimen_fiscal, f.uso_cfdi, f.fecha_vigencia
            FROM "clientes" c
            LEFT JOIN "direcciones_cliente" d ON c.id_cliente = d.id_cliente
            LEFT JOIN "datos_fiscales" f ON c.id_cliente = f.id_cliente
            WHERE UPPER(TRIM(c.rfc_cliente)) = UPPER(TRIM($1)) 
            LIMIT 1`;
        const result = await pool.query(query, [rfc]);
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.status(404).json({ message: "RFC no encontrado" });
    } catch (err) {
        res.status(500).json({ error: "Error al buscar RFC" });
    }
});

app.put('/api/clientes/:id', verifyRole([1]), async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { 
            razon_social, rfc_cliente, telefono_cliente, correo_cliente, 
            calle, no_exterior, no_interior, ciudad, estado, codigo_postal,
            regimen_fiscal, uso_cfdi, fecha_vigencia 
        } = req.body;

        await client.query(
            'UPDATE "clientes" SET razon_social=$1, rfc_cliente=$2, telefono_cliente=$3, correo_cliente=$4 WHERE id_cliente=$5',
            [razon_social, rfc_cliente, telefono_cliente, correo_cliente, id]
        );

        const checkDir = await client.query('SELECT id_direccion FROM "direcciones_cliente" WHERE id_cliente = $1', [id]);
        if (checkDir.rows.length > 0) {
            await client.query(
                'UPDATE "direcciones_cliente" SET calle=$1, no_exterior=$2, no_interior=$3, ciudad=$4, estado=$5, codigo_postal=$6 WHERE id_cliente=$7',
                [calle, no_exterior, no_interior, ciudad, estado, codigo_postal, id]
            );
        } else {
            await client.query(
                'INSERT INTO "direcciones_cliente" (id_cliente, calle, no_exterior, no_interior, ciudad, estado, codigo_postal) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [id, calle, no_exterior, no_interior, ciudad, estado, codigo_postal]
            );
        }

        const checkFiscal = await client.query('SELECT id_dato_fiscal FROM "datos_fiscales" WHERE id_cliente = $1', [id]);
        if (checkFiscal.rows.length > 0) {
            await client.query(
                'UPDATE "datos_fiscales" SET regimen_fiscal=$1, uso_cfdi=$2, fecha_vigencia=$3 WHERE id_cliente=$4',
                [regimen_fiscal, uso_cfdi, fecha_vigencia, id]
            );
        } else {
            await client.query(
                'INSERT INTO "datos_fiscales" (id_cliente, regimen_fiscal, uso_cfdi, fecha_vigencia) VALUES ($1, $2, $3, $4)',
                [id, regimen_fiscal, uso_cfdi, fecha_vigencia]
            );
        }

        await client.query('COMMIT');
        res.json({ message: "Cliente actualizado exitosamente" });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.delete('/api/clientes/:id', verifyRole([1]), async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM "direcciones_cliente" WHERE id_cliente = $1', [id]);
        await client.query('DELETE FROM "datos_fiscales" WHERE id_cliente = $1', [id]);
        await client.query('DELETE FROM "clientes" WHERE id_cliente = $1', [id]);
        await client.query('COMMIT');
        res.json({ message: "Cliente eliminado exitosamente" });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: "Error: El cliente tiene vínculos activos." });
    } finally {
        client.release();
    }
});

// ==========================================
// --- SECCIÓN 2: CONTRATOS ---
// ==========================================

app.post('/api/contratos-integral', verifyRole([1, 2]), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { 
            id_cliente, fecha_inicio, fecha_fin, monto_total, 
            num_spots_contratados, costo_unitario, terminos,
            tipo_programacion, spots_por_semana, dias_programacion, horario_programacion
        } = req.body;
        
        const estadoInicial = 'No Iniciado';
        
        const resContrato = await client.query(
            `INSERT INTO "contrato" (
                id_cliente, fecha_inicio, fecha_fin, monto_total, estado, 
                num_spots_contratados, costo_unitario, fecha_registro,
                tipo_programacion, spots_por_semana, dias_programacion, horario_programacion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11) RETURNING id_contrato`,
            [
                id_cliente, fecha_inicio, fecha_fin, monto_total, estadoInicial, 
                num_spots_contratados, costo_unitario,
                tipo_programacion || 'manual', 
                spots_por_semana || null, 
                dias_programacion || null, 
                horario_programacion || null
            ]
        );
        
        const idNuevoContrato = resContrato.rows[0].id_contrato;

        if (terminos && Array.isArray(terminos)) {
            for (let t of terminos) {
                if (t.clave && t.valor) {
                    await client.query(
                        'INSERT INTO "termino_contrato" (id_contrato, clave_termino, valor_termino) VALUES ($1, $2, $3)', 
                        [idNuevoContrato, t.clave, t.valor]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, id_contrato: idNuevoContrato });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/contratos', verifyRole([1, 2]), async (req, res) => {
    try {
        const query = `
            SELECT con.*, cli.razon_social, cli.rfc_cliente as rfc,
                   COALESCE(
                       (SELECT COUNT(*) FROM "programación" p 
                        JOIN "anuncios" a ON p.id_anuncio = a.id_anuncio
                        WHERE a.id_contrato = con.id_contrato 
                        AND p.estado IN ('Programado', 'Transmitido')), 0
                   ) as spots_usados
            FROM "contrato" con 
            JOIN "clientes" cli ON con.id_cliente = cli.id_cliente 
            ORDER BY con.id_contrato DESC`;
        const result = await pool.query(query);
        
        console.log("\n========== CONTRATOS ==========");
        console.log(`Fecha actual: ${new Date().toISOString().split('T')[0]}`);
        
        const contratosConEstado = [];
        
        for (const contrato of result.rows) {
            const spotsTotales = contrato.num_spots_contratados || 0;
            const fechaInicio = contrato.fecha_inicio;
            const fechaFin = contrato.fecha_fin;
            
            const estadoCalculado = await calcularEstadoContrato(
                contrato.estado, 
                spotsTotales,
                fechaInicio,
                fechaFin,
                contrato.id_contrato
            );
            
            console.log(`\n📋 Contrato #${contrato.id_contrato}:`);
            console.log(`   Estado guardado: ${contrato.estado}`);
            console.log(`   Spots contratados: ${spotsTotales}`);
            console.log(`   Fechas: ${fechaInicio} → ${fechaFin}`);
            console.log(`   Estado calculado: ${estadoCalculado}`);
            
            if (estadoCalculado !== contrato.estado) {
                console.log(`   ✅ Actualizando en BD: ${contrato.estado} → ${estadoCalculado}`);
                await pool.query('UPDATE "contrato" SET estado = $1 WHERE id_contrato = $2', 
                    [estadoCalculado, contrato.id_contrato]);
                
                if (estadoCalculado === 'Cancelado' || estadoCalculado === 'Terminado') {
                    await sincronizarEstadosAnuncios(contrato.id_contrato, estadoCalculado);
                }
            }
            
            contratosConEstado.push({ ...contrato, estado_auto: estadoCalculado });
        }
        
        console.log("\n================================\n");
        res.json(contratosConEstado);
    } catch (err) {
        console.error("Error al obtener contratos:", err);
        res.status(500).json({ error: "Error al obtener contratos" });
    }
});

app.put('/api/contratos/:id/suspender', verifyRole([1]), async (req, res) => {
    const { id } = req.params;
    const { suspendido } = req.body;
    
    try {
        const nuevoEstado = suspendido ? 'Suspendido' : 'Activo';
        
        const result = await pool.query(
            'UPDATE "contrato" SET estado = $1 WHERE id_contrato = $2 RETURNING *',
            [nuevoEstado, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Contrato no encontrado" });
        }
        
        await sincronizarEstadosAnuncios(id, nuevoEstado);
        
        res.json({ 
            success: true, 
            estado: nuevoEstado,
            mensaje: suspendido ? "Contrato suspendido" : "Contrato reactivado"
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// --- CANCELAR CONTRATO MEJORADO (NUEVO) ---
// ==========================================
app.put('/api/contratos/:id/cancelar', verifyRole([1]), async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const contratoExiste = await client.query(
            'SELECT id_contrato, estado FROM contrato WHERE id_contrato = $1',
            [id]
        );
        
        if (contratoExiste.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Contrato no encontrado" });
        }
        
        const estadoActual = contratoExiste.rows[0].estado;
        
        if (estadoActual === 'Cancelado') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "El contrato ya está cancelado" });
        }
        
        await client.query(
            'UPDATE contrato SET estado = $1 WHERE id_contrato = $2',
            ['Cancelado', id]
        );
        
        await client.query(
            'UPDATE anuncios SET estado = $1 WHERE id_contrato = $2',
            ['Cancelado', id]
        );
        
        await client.query(`
            UPDATE programación 
            SET estado = 'Cancelado' 
            WHERE id_anuncio IN (SELECT id_anuncio FROM anuncios WHERE id_contrato = $1)
            AND estado IN ('Programado', 'Activo')
        `, [id]);
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: "Contrato cancelado exitosamente. Todos los anuncios y spots pendientes fueron cancelados." 
        });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error cancelando contrato:", err);
        res.status(500).json({ error: "Error al cancelar contrato: " + err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// --- ELIMINAR CONTRATO EN CASCADA (NUEVO) ---
// ==========================================
app.delete('/api/contratos/:id', verifyRole([1]), async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const contratoExiste = await client.query(
            'SELECT id_contrato FROM contrato WHERE id_contrato = $1',
            [id]
        );
        
        if (contratoExiste.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Contrato no encontrado" });
        }
        
        const facturasAsociadas = await client.query(`
            SELECT COUNT(*) as total FROM facturas_detalle WHERE id_contrato = $1
        `, [id]);
        
        if (parseInt(facturasAsociadas.rows[0].total) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: "No se puede eliminar el contrato porque tiene facturas asociadas. Cancele el contrato en su lugar."
            });
        }
        
        await client.query(`
            DELETE FROM programación 
            WHERE id_anuncio IN (SELECT id_anuncio FROM anuncios WHERE id_contrato = $1)
        `, [id]);
        
        await client.query('DELETE FROM anuncios WHERE id_contrato = $1', [id]);
        
        await client.query('DELETE FROM termino_contrato WHERE id_contrato = $1', [id]);
        
        await client.query('DELETE FROM contrato WHERE id_contrato = $1', [id]);
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: "Contrato eliminado exitosamente (spots, anuncios y términos eliminados en cascada)" 
        });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error eliminando contrato:", err);
        res.status(500).json({ error: "Error al eliminar contrato: " + err.message });
    } finally {
        client.release();
    }
});

app.get('/api/contratos/buscar-por-rfc/:rfc', verifyRole([1, 2]), async (req, res) => {
    try {
        const { rfc } = req.params;
        const query = `
            SELECT con.id_contrato, cli.id_cliente, cli.razon_social, con.fecha_inicio, con.fecha_fin, con.estado
            FROM "contrato" con
            JOIN "clientes" cli ON con.id_cliente = cli.id_cliente
            WHERE UPPER(TRIM(cli.rfc_cliente)) = UPPER(TRIM($1))
            AND con.estado IN ('No Iniciado', 'Activo')
            ORDER BY con.id_contrato DESC
            LIMIT 1`;
        const result = await pool.query(query, [rfc]);
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.status(404).json({ message: "No se encontró un contrato activo para este RFC" });
    } catch (err) {
        res.status(500).json({ error: "Error al buscar contrato por RFC" });
    }
});

app.put('/api/contratos/:id', verifyRole([1]), async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id_cliente, fecha_inicio, fecha_fin, monto_total, estado, num_spots_contratados, costo_unitario, terminos } = req.body;

        const contratoActual = await client.query(
            'SELECT estado FROM "contrato" WHERE id_contrato = $1',
            [id]
        );
        const estadoAnterior = contratoActual.rows[0]?.estado;

        await client.query(
            `UPDATE "contrato" SET id_cliente=$1, fecha_inicio=$2, fecha_fin=$3, monto_total=$4, estado=$5, num_spots_contratados=$6, costo_unitario=$7 
             WHERE id_contrato=$8`,
            [id_cliente, fecha_inicio, fecha_fin, monto_total, estado, num_spots_contratados, costo_unitario, id]
        );

        if (estadoAnterior !== estado && (estado === 'Cancelado' || estado === 'Terminado')) {
            await sincronizarEstadosAnuncios(id, estado);
        }

        await client.query('DELETE FROM "termino_contrato" WHERE id_contrato = $1', [id]);

        if (terminos && Array.isArray(terminos)) {
            for (let t of terminos) {
                if (t.clave && t.valor) {
                    await client.query(
                        'INSERT INTO "termino_contrato" (id_contrato, clave_termino, valor_termino) VALUES ($1, $2, $3)', 
                        [id, t.clave, t.valor]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: "Contrato actualizado exitosamente" });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// --- SECCIÓN 3: ANUNCIOS ---
// ==========================================

app.post('/api/anuncios', verifyRole([1, 2]), async (req, res) => {
    try {
        const { nombre_anuncio, duracion_anuncio, id_contrato, activo } = req.body;
        const query = `INSERT INTO "anuncios" (nombre_anuncio, duracion_anuncio, activo, id_contrato) VALUES ($1, $2, $3, $4) RETURNING *`;
        const result = await pool.query(query, [nombre_anuncio, duracion_anuncio, activo ?? true, id_contrato]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Error al registrar anuncio" });
    }
});

app.get('/api/anuncios', verifyRole([1, 2]), async (req, res) => {
    try {
        const query = `
            SELECT a.*, cli.razon_social AS cliente_nombre, c.tipo_programacion, c.num_spots_contratados, c.estado as estado_contrato,
                   COALESCE(
                       (SELECT COUNT(*) FROM "programación" p 
                        WHERE p.id_anuncio = a.id_anuncio 
                        AND p.estado IN ('Programado', 'Transmitido')), 0
                   ) as spots_usados,
                   CASE WHEN p.id_anuncio IS NOT NULL THEN true ELSE false END AS esta_programado
            FROM "anuncios" a
            LEFT JOIN "contrato" c ON a.id_contrato = c.id_contrato
            LEFT JOIN "clientes" cli ON c.id_cliente = cli.id_cliente
            LEFT JOIN (SELECT DISTINCT id_anuncio FROM "programación") p ON a.id_anuncio = p.id_anuncio
            ORDER BY a.id_anuncio DESC`;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener anuncios" });
    }
});

app.get('/api/programacion', verifyRole([1, 2]), async (req, res) => {
    try {
        const query = `
            SELECT p.*, a.nombre_anuncio, a.id_contrato
            FROM "programación" p 
            JOIN "anuncios" a ON p.id_anuncio = a.id_anuncio
            ORDER BY p.fecha_transmision DESC, p.horario ASC`;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener programación" });
    }
});

app.post('/api/programacion/generar-automatica', verifyRole([1, 2]), async (req, res) => {
    const { id_anuncio, id_contrato } = req.body;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const contratoInfo = await client.query(`
            SELECT tipo_programacion, spots_por_semana, dias_programacion, horario_programacion,
                   num_spots_contratados, fecha_inicio, fecha_fin, estado,
                   COALESCE(
                       (SELECT COUNT(*) FROM "programación" p 
                        WHERE p.id_anuncio = $1 
                        AND p.estado IN ('Programado', 'Transmitido')), 0
                   ) as spots_usados
            FROM "contrato" c
            WHERE c.id_contrato = $2
        `, [id_anuncio, id_contrato]);
        
        if (contratoInfo.rows.length === 0) {
            return res.status(404).json({ error: "Contrato no encontrado" });
        }
        
        const contrato = contratoInfo.rows[0];
        
        if (contrato.estado === 'Suspendido') {
            return res.status(400).json({ error: "El contrato está suspendido. Reactívalo primero." });
        }
        
        if (contrato.estado === 'Cancelado') {
            return res.status(400).json({ error: "El contrato está cancelado." });
        }
        
        if (contrato.estado === 'Terminado') {
            return res.status(400).json({ error: "El contrato ya está terminado." });
        }
        
        if (contrato.tipo_programacion !== 'patron') {
            return res.status(400).json({ error: "Este contrato no está configurado para programación automática" });
        }
        
        const spotsTotales = contrato.num_spots_contratados;
        const spotsUsados = parseInt(contrato.spots_usados);
        const spotsPendientes = spotsTotales - spotsUsados;
        
        if (spotsPendientes <= 0) {
            return res.status(400).json({ error: "No quedan spots pendientes por programar" });
        }
        
        const spotsGenerados = generarSpotsPorPatron(
            id_anuncio,
            spotsPendientes,
            contrato.spots_por_semana,
            contrato.dias_programacion,
            contrato.horario_programacion,
            contrato.fecha_inicio,
            contrato.fecha_fin
        );
        
        for (const spot of spotsGenerados) {
            await client.query(
                `INSERT INTO "programación" (id_anuncio, fecha_transmision, horario, estado) 
                 VALUES ($1, $2, $3, $4)`,
                [spot.id_anuncio, spot.fecha_transmision, spot.horario, spot.estado]
            );
        }
        
        if (contrato.estado === 'No Iniciado') {
            await client.query(
                'UPDATE "contrato" SET estado = $1 WHERE id_contrato = $2',
                ['Activo', id_contrato]
            );
            await sincronizarEstadosAnuncios(id_contrato, 'Activo');
        }
        
        await client.query('COMMIT');
        
        res.status(201).json({
            success: true,
            spots_generados: spotsGenerados.length,
            spots_pendientes: spotsPendientes - spotsGenerados.length,
            mensaje: `Se generaron ${spotsGenerados.length} spots automáticamente según el patrón configurado.`
        });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error generando spots automáticos:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/programacion', verifyRole([1, 2]), async (req, res) => {
    const { id_anuncio, fecha_transmision, horario, estado } = req.body;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const infoContrato = await client.query(`
            SELECT 
                c.id_contrato, 
                c.num_spots_contratados, 
                c.estado as estado_contrato,
                c.fecha_inicio,
                c.fecha_fin,
                c.tipo_programacion,
                COALESCE(
                    (SELECT COUNT(*) FROM "programación" p 
                     WHERE p.id_anuncio = a.id_anuncio 
                     AND p.estado IN ('Programado', 'Transmitido')), 0
                ) as spots_usados
            FROM "anuncios" a
            INNER JOIN "contrato" c ON a.id_contrato = c.id_contrato
            WHERE a.id_anuncio = $1
        `, [id_anuncio]);
        
        if (infoContrato.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Anuncio no encontrado" });
        }
        
        const contrato = infoContrato.rows[0];
        
        if (contrato.estado_contrato === 'Suspendido') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "El contrato está suspendido. Reactívalo para programar spots." });
        }
        
        if (contrato.estado_contrato === 'Cancelado') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "El contrato está cancelado. No se pueden programar más spots." });
        }
        
        if (contrato.estado_contrato === 'Terminado') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "El contrato ya está terminado. Todos los spots fueron transmitidos." });
        }
        
        const spotsUsados = parseInt(contrato.spots_usados);
        const spotsTotales = contrato.num_spots_contratados;
        const spotsRestantes = spotsTotales - spotsUsados;
        
        if (contrato.estado_contrato !== 'Activo' && contrato.estado_contrato !== 'No Iniciado') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "El contrato no está en estado Activo o No Iniciado" });
        }
        
        const fechaTransmisionDate = new Date(fecha_transmision);
        const fechaFin = new Date(contrato.fecha_fin);
        const fechaInicio = new Date(contrato.fecha_inicio);
        
        if (fechaTransmisionDate < fechaInicio) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "La fecha no puede ser anterior al inicio del contrato" });
        }
        
        if (fechaTransmisionDate > fechaFin) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "La fecha no puede ser después de la fecha fin del contrato" });
        }
        
        if (spotsRestantes <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: `No quedan spots disponibles. Contrataste ${spotsTotales} spots y ya usaste ${spotsUsados}.`
            });
        }
        
        const existeDuplicado = await client.query(`
            SELECT id_programacion FROM "programación" 
            WHERE id_anuncio = $1 AND fecha_transmision = $2 AND horario = $3
        `, [id_anuncio, fecha_transmision, horario]);
        
        if (existeDuplicado.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "Ya existe una programación en la misma fecha y horario" });
        }
        
        const result = await client.query(
            `INSERT INTO "programación" (id_anuncio, fecha_transmision, horario, estado) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [id_anuncio, fecha_transmision, horario, estado || 'Programado']
        );
        
        if (contrato.estado_contrato === 'No Iniciado') {
            await client.query(
                'UPDATE "contrato" SET estado = $1 WHERE id_contrato = $2',
                ['Activo', contrato.id_contrato]
            );
            await sincronizarEstadosAnuncios(contrato.id_contrato, 'Activo');
        }
        
        await client.query('COMMIT');
        
        res.status(201).json({ 
            success: true, 
            programacion: result.rows[0],
            spots_restantes: spotsRestantes - 1,
            spots_usados: spotsUsados + 1,
            spots_totales: spotsTotales,
            mensaje: `Spot programado correctamente. Te quedan ${spotsRestantes - 1} spots de ${spotsTotales}`
        });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error al programar:", err);
        res.status(500).json({ error: "Error al guardar programación: " + err.message });
    } finally {
        client.release();
    }
});

// ==========================================
// --- SECCIÓN 4: FACTURACIÓN ---
// ==========================================

app.post('/api/facturas/calcular', verifyRole([1, 2]), async (req, res) => {
    try {
        const { id_contrato, modalidad, fecha_inicio, fecha_fin } = req.body;
        
        if (!id_contrato || !modalidad) {
            return res.status(400).json({ error: "Faltan datos: id_contrato y modalidad son requeridos" });
        }
        
        const modalidadesPermitidas = ['COMPLETO', 'PERIODO', 'SEMANAL', 'FINAL'];
        if (!modalidadesPermitidas.includes(modalidad)) {
            return res.status(400).json({ error: "Modalidad no válida. Use: COMPLETO, PERIODO, SEMANAL o FINAL" });
        }
        
        if (modalidad === 'PERIODO' && (!fecha_inicio || !fecha_fin)) {
            return res.status(400).json({ error: "Para modalidad PERIODO se requieren fecha_inicio y fecha_fin" });
        }
        if (modalidad === 'SEMANAL' && !fecha_inicio) {
            return res.status(400).json({ error: "Para modalidad SEMANAL se requiere fecha_inicio" });
        }
        
        const contratoResult = await pool.query(
            `SELECT c.id_cliente, c.num_spots_contratados, c.costo_unitario, 
                    c.spots_por_semana, c.fecha_inicio, c.fecha_fin,
                    cli.razon_social, cli.rfc_cliente
             FROM contrato c
             JOIN clientes cli ON c.id_cliente = cli.id_cliente
             WHERE c.id_contrato = $1`,
            [id_contrato]
        );
        
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ error: "Contrato no encontrado" });
        }
        
        const contrato = contratoResult.rows[0];
        let spots = 0;
        
        if (modalidad === 'COMPLETO') {
            spots = contrato.num_spots_contratados || 0;
        } 
        else if (modalidad === 'PERIODO') {
            const result = await pool.query(`
                SELECT COUNT(*) as total
                FROM programación p
                JOIN anuncios a ON p.id_anuncio = a.id_anuncio
                WHERE a.id_contrato = $1
                AND p.fecha_transmision BETWEEN $2 AND $3
                AND p.estado IN ('Programado', 'Transmitido')
            `, [id_contrato, fecha_inicio, fecha_fin]);
            spots = parseInt(result.rows[0].total) || 0;
        }
        else if (modalidad === 'SEMANAL') {
            spots = contrato.spots_por_semana || 0;
        }
        else if (modalidad === 'FINAL') {
            const result = await pool.query(`
                SELECT COUNT(*) as total
                FROM programación p
                JOIN anuncios a ON p.id_anuncio = a.id_anuncio
                WHERE a.id_contrato = $1
            `, [id_contrato]);
            spots = parseInt(result.rows[0].total) || 0;
        }
        
        if (spots <= 0) {
            return res.status(400).json({ 
                error: `No hay spots para facturar en modalidad ${modalidad}`,
                spots: 0
            });
        }
        
        const costoUnitario = parseFloat(contrato.costo_unitario) || 0;
        const subtotal = spots * costoUnitario;
        const iva = subtotal * 0.16;
        const total = subtotal + iva;
        
        res.json({
            success: true,
            spots: spots,
            costo_unitario: costoUnitario,
            subtotal: subtotal,
            iva: iva,
            total: total,
            mensaje: `${spots} spots a facturar`
        });
        
    } catch (err) {
        console.error("Error calculando factura:", err);
        res.status(500).json({ error: "Error al calcular: " + err.message });
    }
});

app.post('/api/facturas-integral', verifyRole([1]), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id_cliente, folio_cfdi, fecha_emision, subtotal, iva, total, estado, detalles } = req.body;

        const queryCliente = `
            SELECT c.razon_social, c.rfc_cliente, 
                    d.calle, d.no_exterior, d.ciudad, d.estado, d.codigo_postal,
                    f.regimen_fiscal, f.uso_cfdi
            FROM "clientes" c
            LEFT JOIN "direcciones_cliente" d ON c.id_cliente = d.id_cliente
            LEFT JOIN "datos_fiscales" f ON c.id_cliente = f.id_cliente
            WHERE c.id_cliente = $1`;
        
        const resClienteBD = await client.query(queryCliente, [id_cliente]);
        
        if (resClienteBD.rows.length === 0) {
            throw new Error("El cliente no existe en la base de datos.");
        }

        const datosGeneracion = {
            ...req.body,
            ...resClienteBD.rows[0],
            detalles: detalles 
        };

        const resFactura = await client.query(
            `INSERT INTO "facturas" (id_cliente, folio_cfdi, fecha_emision, subtotal, iva, total, estado) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_factura`,
            [id_cliente, folio_cfdi, fecha_emision, subtotal, iva, total, estado || 'emitida']
        );
        const idNuevaFactura = resFactura.rows[0].id_factura;

        const nombrePDF = `${folio_cfdi}.pdf`;
        const nombreXML = `${folio_cfdi}.xml`;
        const rutaPDF = path.join(uploadsDir, nombrePDF);
        const rutaXML = path.join(uploadsDir, nombreXML);

        crearArchivoPDF(datosGeneracion, rutaPDF);
        crearArchivoXML(datosGeneracion, rutaXML);

        const queryDocs = `
            INSERT INTO "documentos_fiscales" (id_factura, tipo_documento, url_documento, hash_sha256)
            VALUES ($1, 'pdf', $2, 'GENERADO'), ($1, 'xml', $3, 'GENERADO')`;
        
        await client.query(queryDocs, [idNuevaFactura, `/uploads/${nombrePDF}`, `/uploads/${nombreXML}`]);

        if (detalles && Array.isArray(detalles)) {
            for (let d of detalles) {
                const idContratoLimpio = d.id_contrato && d.id_contrato !== "" ? d.id_contrato : null;
                await client.query(
                    `INSERT INTO "facturas_detalle" (id_factura, id_contrato, periodo_inicio, periodo_fin, monto_facturado) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [idNuevaFactura, idContratoLimpio, d.periodo_inicio, d.periodo_fin, d.monto_facturado]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, id_factura: idNuevaFactura });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: "Error integral: " + err.message });
    } finally {
        client.release();
    }
});

app.get('/api/facturas', verifyRole([1]), async (req, res) => {
    try {
        const query = `
            SELECT f.*, c.razon_social 
            FROM "facturas" f
            JOIN "clientes" c ON f.id_cliente = c.id_cliente
            ORDER BY f.id_factura DESC`;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener facturas" });
    }
});

app.post('/api/pagos', verifyRole([1]), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id_factura, fecha_pago, monto_pagado, metodo_pago, referencia_pago } = req.body;
        
        const queryPago = `
            INSERT INTO "pagos" (id_factura, fecha_pago, monto_pagado, metodo_pago, referencia_pago) 
            VALUES ($1, $2, $3, $4, $5) RETURNING *`;
        const resultPago = await client.query(queryPago, [id_factura, fecha_pago, monto_pagado, metodo_pago, referencia_pago]);
        
        await client.query('UPDATE "facturas" SET estado = $1 WHERE id_factura = $2', ['pagada', id_factura]);

        await client.query('COMMIT');
        res.status(201).json({ success: true, pago: resultPago.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: "Error al registrar el pago" });
    } finally {
        client.release();
    }
});

app.get('/api/facturas/:id/:extension', verifyRole([1, 2]), async (req, res) => {
    try {
        const { id, extension } = req.params;
        const extLimpia = extension.toLowerCase();
        
        const query = `
            SELECT url_documento 
            FROM "documentos_fiscales" 
            WHERE id_factura = $1 AND tipo_documento = $2 
            LIMIT 1`;
            
        const result = await pool.query(query, [id, extLimpia]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: `No existe documento ${extLimpia} para esta factura` });
        }
        
        res.json({ url_documento: result.rows[0].url_documento });
    } catch (err) { 
        res.status(500).json({ error: "Error al obtener el documento" }); 
    }
});

// ==========================================
// --- ESTADO DEL SISTEMA ---
// ==========================================

app.get('/api/sistema/status', (req, res) => {
    res.json({ status: 'online', database: 'connected', uploads: fs.readdirSync(uploadsDir).length });
});

// ==========================================
// --- INICIAR SERVIDOR ---
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`[SIM] Servidor iniciado correctamente en puerto ${PORT}`);
    await iniciarActualizaciones();
});