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
// CONFIGURACIÓN GLOBAL (ADMINISTRADORES EN LÍNEA)
// ==========================================
const BOT_NUMBER = "528141407448"; 

const ADMIN_IDS = [
    "525532858511@s.whatsapp.net", 
    "525575704482@s.whatsapp.net", 
    "527777039845@s.whatsapp.net",
    "528141407448@s.whatsapp.net",
    "528141407449@s.whatsapp.net"
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
                        const partes = limpio.split(':');
                        const ip = partes[0];
                        const port = partes[1];
                        if(ip && port && !isNaN(port)) {
                            combinedProxies.push({ ip, port: parseInt(port), protocol: 'http' });
                        }
                    }
                });
            }
        });
    } catch (e) {
        console.error("Error en recolección:", e.message);
    }

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
    
    const aleatorios = lista.sort(() => 0.5 - Math.random()).slice(0, 15);
    
    for (let proxy of aleatorios) {
        const test = await verificarProxy(proxy);
        if (test.activo) return proxy;
    }
    return lista[0]; 
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
// ESCUCHA DE WHATSAPP: COMANDOS Y MODERACIÓN INTEGRAL
// =======================================================

function registrarComandosProxy(sock) {
    sock.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages || messages.length === 0) return; 
        const msg = messages[0]; 
        if (!msg || !msg.message) return;
        
        const fromMe = msg.key.fromMe;
        const conversation = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const from = msg.key.remoteJid;
        const remitente = msg.key.participant || msg.key.remoteJid;

        if (fromMe) return; 

        const esAdmin = ADMIN_IDS.includes(remitente);

        // MODERACIÓN ANTI-SPAM (PALABRAS Y LINKS DE GRUPOS)
        if (!esAdmin) {
            const contienePalabrasSpam = SPAM_WORDS.some(palabra => conversation.toLowerCase().includes(palabra));
            const contieneLinkGrupo = conversation.toLowerCase().includes("://whatsapp.com") || conversation.toLowerCase().includes("wa.me/setting");

            if (contienePalabrasSpam || contieneLinkGrupo) {
                console.log(`[Anti-Spam] Infracción detectada de ${remitente} en el chat.`);
                
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

                        const idLimpio = remitente.split('@')[0];
                        const mensajeAdvertencia = `⚠️ *¡ADVERTENCIA DE SEGURIDAD!* ⚠️\n\n` +
                                                   `El usuario @${idLimpio} ha intentado hacer spam o enviar un link no autorizado.\n\n` +
                                                   `_El mensaje ha sido eliminado de inmediato._`;

                        await sock.sendMessage(from, { 
                            text: mensajeAdvertencia, 
                            mentions: [remitente] 
                        });

                    } catch (err) {
                        console.log("[Anti-Spam] Error al moderar. Asegúrate de que Solín sea Administrador.");
                    }
                }
                return; 
            }
        }

        // SISTEMA DE COMANDOS EXCLUSIVOS CON SEGURIDAD (ADMINS)
        if (conversation.toLowerCase().startsWith('/proxy')) {
            
            if (!esAdmin) {
                console.log("[Seguridad] Acceso denegado al comando /proxy para: " + remitente);
                return; 
            }

            const args = conversation.split(' ');
            const country = args[1] || 'us'; 

            await sock.sendMessage(from, { text: "🔍 Buscando un proxy rápido para [" + country.toUpperCase() + "] en múltiples fuentes..." }, { quoted: msg });

            const mejorProxy = await obtenerProxySeguro(country);

            if (mejorProxy && mejorProxy.ip) {
                const urlRender = process.env.RENDER_EXTERNAL_URL || "https://" + (process.env.RENDER_SERVICE_NAME || "solin-bot") + ".onrender.com";
                
                const textoRespuesta = "✅ *Proxy Individual Autorizado:* \n" +
                                      "➔ `" + mejorProxy.ip + ":" + mejorProxy.port + "`\n\n" +
                                      "🔄 *Tu Link Rotador Automático:* \n" +
                                      "Usa este enlace dinámico en tus herramientas:\n\n" +
                                      "➔ `" + urlRender + "/rotar?country=" + country + "&url=https://api.ipify.org`\n\n" +
                                      "_Acceso exclusivo del equipo de administración._";
                
                await sock.sendMessage(from, { text: textoRespuesta }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { text: "❌ No se pudo extraer o estabilizar ningún proxy seguro para [" + country.toUpperCase() + "]." }, { quoted: msg });
            }
        }
    });
}

// =======================================================
// NÚCLEO PRINCIPAL DE CONEXIÓN A WHATSAPP (CON PAIRING CODE)
// =======================================================

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        browser: Browsers.macOS('Desktop')
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let codigo = await sock.requestPairingCode(BOT_NUMBER);
                console.log(`\n==============================================`);
                console.log(`🔑 TU CÓDIGO DE VINCULACIÓN PARA SOLÍN ES:`);
                console.log(`👉   ${codigo}   👈`);
                console.log(`==============================================\n`);
            } catch (err) {
                console.error("Error al generar el Pairing Code:", err.message);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
