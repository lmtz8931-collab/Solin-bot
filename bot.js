const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    Browsers 
} = require('@whiskeysockets/baileys');
const P = require('pino');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURACIÓN GLOBAL (ADMINISTRADORES)
// ==========================================
const BOT_NUMBER = "528141407448"; 

const ADMIN_IDS = [
    "525532858511@s.whatsapp.net", 
    "525575704482@s.whatsapp.net", 
    "527777039845@s.whatsapp.net", 
    "528141407448@s.whatsapp.net",  // Administrador y Bot (Formato MX corregido)
    "528141407449@s.whatsapp.net"   // Administrador Nuevo (Formato MX corregido)
];

const SPAM_WORDS = ["gana dinero facil", "cripto gratis", "compra seguidores", "hack cuenta"];

// =======================================================
// MOTOR MULTIFUENTE: EXTRAE Y VERIFICA PROXIES EN LÍNEA
// =======================================================

async function verificarProxy(proxy) {
    const urlTest = 'https://httpbin.org'; 
    try {
        await axios.get(urlTest, {
            proxy: {
                host: proxy.ip,
                port: parseInt(proxy.port)
            },
            timeout: 4000 
        });
        return { ...proxy, activo: true };
    } catch (e) {
        return { ...proxy, activo: false };
    }
}

async function fetchProxies(countryCode) {
    let combinedProxies = [];
    
    // Lista de fuentes públicas estables que Solín raspa en paralelo
    const fuentes = [
        "https://proxyscrape.com" + countryCode.toLowerCase() + "&ssl=all&anonymity=all",
        "https://githubusercontent.com",
        "https://githubusercontent.com"
    ];

    try {
        const peticiones = fuentes.map(url => axios.get(url, { timeout: 4000 }).catch(e => null));
        const respuestas = await Promise.all(peticiones);

        respuestas.forEach(res => {
            if (res && res.data && typeof res.data === 'string') {
                const lineas = res.data.split('\n');
                lineas.forEach(linea => {
                    const limpio = linea.trim();
                    if (limpio.includes(':')) {
                        const [ip, port] = limpio.split(':');
                        combinedProxies.push({ ip, port: parseInt(port), protocol: 'http' });
                    }
                });
            }
        });
    } catch (e) {
        console.error("Error en recolección:", e.message);
    }

    // Filtro para eliminar IPs duplicadas de las tres fuentes
    const listaUnica = [];
    const ipsRegistradas = new Set();
    
    combinedProxies.forEach(p => {
        if (!ipsRegistradas.has(p.ip)) {
            ipsRegistradas.add(p.ip);
            listaUnica.push(p);
        }
    });

    return listaUnica;
}

async function obtenerProxySeguro(country = 'us') {
    const lista = await fetchProxies(country);
    if (lista.length === 0) return null;
    
    // Barajamos para asegurar una rotación real de IPs
    const aleatorios = lista.sort(() => 0.5 - Math.random()).slice(0, 15);
    
    for (let proxy of aleatorios) {
        const test = await verificarProxy(proxy);
        if (test.activo) return proxy;
    }
    return lista[0]; // Fallback al primer proxy crudo si el test masivo falla
}

// =======================================================
// ENDPOINT DEL ROTADOR AUTOMÁTICO (WEBHOOK)
// =======================================================

app.get('/rotar', async (req, res) => {
    const urlDestino = req.query.url;
    const country = req.query.country || 'us';

    if (!urlDestino) {
        return res.status(400).send("❌ Error: Falta el parámetro '?url=http://...' en tu enlace.");
    }

    try {
        const proxy = await obtenerProxySeguro(country);
        if (!proxy) {
            return res.status(502).send("❌ No se encontraron proxies disponibles.");
        }

        const respuestaNavegacion = await axios.get(urlDestino, {
            proxy: { host: proxy.ip, port: proxy.port },
            timeout: 6000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        res.send(respuestaNavegacion.data);
    } catch (error) {
        res.status(500).send("❌ Error en la tunelización rotativa: " + error.message);
    }
});

// =======================================================
// ESCUCHA DE WHATSAPP: COMANDOS Y FILTRO DE SPAM
// =======================================================

function registrarComandosProxy(sock) {
    sock.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages || messages.length === 0) return; 
        const msg = messages[0]; 
        if (!msg.message) return;
        
        const fromMe = msg.key.fromMe;
        const conversation = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const from = msg.key.remoteJid;
        const remitente = msg.key.participant || msg.key.remoteJid;

        if (fromMe) return; // Ignorarse a sí mismo para evitar bucles

        // ---------------------------------------------------
        // [NUEVO] FUNCIÓN 2: FILTRO ANTI-SPAM DE PALABRAS PROHIBIDAS
        // ---------------------------------------------------
        const contieneSpam = SPAM_WORDS.some(palabra => conversation.toLowerCase().includes(palabra));
        if (contieneSpam) {
            console.log(`[Anti-Spam] Mensaje bloqueado de ${remitente}: ${conversation}`);
            
            // Si el bot es admin del grupo, intenta eliminar el mensaje molesto
            if (from.endsWith('@g.us')) {
                try {
                    await sock.sendMessage(from, { 
                        delete: { 
                            remoteJid: from, 
                            fromMe: false, 
                            id: msg.key.id, 
                            participant: remitente 
                        } 
                    });
                } catch (err) {
                    console.log("[Anti-Spam] No se pudo borrar el mensaje (Solín podría no ser administrador del grupo).");
                }
            }
            return; // Detiene el procesamiento del mensaje malicioso
        }

        // ---------------------------------------------------
        // FUNCIÓN 1: SISTEMA DE COMANDOS EXCLUSIVOS CON SEGURIDAD
        // ---------------------------------------------------
        if (conversation.toLowerCase().startsWith('/proxy')) {
            
            // Filtro estricto para la lista ADMIN_IDS
            if (!ADMIN_IDS.includes(remitente)) {
                console.log("[Seguridad] Acceso denegado al comando /proxy para: " + remitente);
                return; 
            }

            const args = conversation.split(' ');
            const country = args[1] || 'us'; 

            await sock.sendMessage(from, { text: "🔍 Buscando un proxy rápido para [" + country.toUpperCase() + "] en múltiples fuentes y generando tu enlace rotativo seguro..." }, { quoted: msg });

            const mejorProxy = await obtenerProxySeguro(country);

            if (mejorProxy && mejorProxy.ip) {
                const urlRender = process.env.RENDER_EXTERNAL_URL || "https://" + process.env.RENDER_SERVICE_NAME + ".onrender.com";
                
                const textoRespuesta = "✅ *Proxy Individual Autorizado:* \n" +
                                      "➔ `" + mejorProxy.ip + ":" + mejorProxy.port + "`\n\n" +
                                      "🔄 *Tu Link Rotador Automático:* \n" +
                                      "Usa este enlace en tus scripts. Cambiará de IP dinámicamente:\n\n" +
                                      "➔ `" + urlRender + "/rotar?country=" + country + "&url=https://ipify.org`\n\n" +
                                      "_Acceso exclusivo del equipo de administración._";
                
                await sock.sendMessage(from, { text: textoRespuesta }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { text: "❌ No se pudo extraer o estabilizar ningún proxy seguro para [" + country.toUpperCase() + "] en este intento." }, { quoted: msg });
            }
        }
    });
}

// =======================================================
// NÚCLEO PRINCIPAL DE CONEXIÓN A WHATSAPP
// =======================================================

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.macOS('Desktop')
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('🚀 ¡Solín en línea! Todas las funciones integradas con éxito.');
        }
    });

    registrarComandosProxy(sock);
}

// Iniciar Servidor Web
app.listen(PORT, () => {
    console.log(`🌐 Servidor del rotador escuchando en el puerto ${PORT}`);
});

connectToWhatsApp();
