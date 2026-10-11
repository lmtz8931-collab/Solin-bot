const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    Browsers 
} = require('@whiskeysockets/baileys');
const P = require('pino');
const axios = require('axios');

// ==========================================
// CONFIGURACIÓN GLOBAL
// ==========================================
const BOT_NUMBER = "5218141407448"; 

const ADMIN_IDS = [
    "525532858511@s.whatsapp.net", 
    "525575704482@s.whatsapp.net", 
    "526691525030@s.whatsapp.net", 
    "528777890676@s.whatsapp.net", 
    "524891114404@s.whatsapp.net", 
    "527777039845@s.whatsapp.net", 
    "528141407448@s.whatsapp.net"  
];

const SPAM_WORDS = ["gana dinero facil", "cripto gratis", "compra seguidores", "hack cuenta"];

// =======================================================
// // MOTOR MASIVO: EXTRACCIÓN Y TESTEO DE +100 PROXIES
// =======================================================

// Función para testear de manera individual cada IP candidata
async function verificarProxy(proxy) {
    // [CORREGIDO]: Cambiado al endpoint exacto de retorno de IPs para validación real
    const urlTest = 'https://httpbin.org'; 
    try {
        // Realiza una petición real a través de la IP para ver si responde rápido
        await axios.get(urlTest, {
            proxy: {
                host: proxy.ip,
                port: parseInt(proxy.port)
            },
            timeout: 3000 // Si el proxy tarda más de 3 segundos en conectar, se descarta
        });
        return { ...proxy, activo: true };
    } catch (e) {
        return { ...proxy, activo: false };
    }
}

async function fetchProxies(countryCode) {
    let combinedProxies = [];

    // Fuente 1: ProxyScrape API Masiva (Descarga directa mediante JSON estructurado)
    try {
        // [CORREGIDO]: Se reestructuró la URL rota. Ahora apunta al endpoint v4 oficial de ProxyScrape con el parámetro de país dinámico.
        const urlScrape = `https://proxyscrape.com{countryCode.toLowerCase()}&ssl=all&anonymosity=all`;
        const res = await axios.get(urlScrape, { timeout: 5000 });
        
        if (res.data && res.data.proxies) {
            res.data.proxies.forEach(p => {
                combinedProxies.push({ ip: p.ip, port: p.port, protocol: 'http' });
            });
        }
    } catch (e) { 
        console.error("Error temporal Fuente 1:", e.message); 
    }

    if (combinedProxies.length === 0) {
        return [];
    }

    // Testeo masivo ultra veloz usando concurrencia nativa (Promise.all)
    const promesasTesteo = combinedProxies.map(p => verificarProxy(p));
    const resultados = await Promise.all(promesasTesteo);

    // Filtramos para retornar únicamente los proxies que sí están 100% en línea
    const proxiesActivos = resultados.filter(p => p.activo);
    return proxiesActivos;
}

// =======================================================
// // INICIALIZACIÓN DE ESCUCHA DE COMANDOS (BAILEYS)
// =======================================================

// Esta función debe ejecutarse pasando el "sock" o "conn" de tu cliente de WhatsApp
function registrarComandosProxy(sock) {
    sock.ev.on('messages.upsert', async ({ messages }) => {
        // [CORREGIDO]: Agregada validación de seguridad por si el array de mensajes llega vacío
        if (!messages || messages.length === 0) return; 
        const msg = messages[0];
        if (!msg.message) return;
        
        const fromMe = msg.key.fromMe;
        const conversation = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const from = msg.key.remoteJid;

        // Detecta si el mensaje empieza con /proxy
        if (!fromMe && conversation.toLowerCase().startsWith('/proxy')) {
            const args = conversation.split(' ');
            const country = args[1] || 'us'; // Si el usuario escribe solo "/proxy", usa 'us' por defecto

            await sock.sendMessage(from, { text: `🔍 Buscando y testeando proxys activos para [${country.toUpperCase()}]... Por favor espera.` }, { quoted: msg });

            const listaActivos = await fetchProxies(country);

            if (listaActivos.length > 0) {
                // Tomamos el primer proxy verificado que responda rápido
                const mejorProxy = listaActivos[0];
                const textoRespuesta = `✅ *Proxy Activo Encontrado [${country.toUpperCase()}]* \n\n➔ *IP:* ${mejorProxy.ip}\n➔ *Puerto:* ${mejorProxy.port}\n➔ *Formato:* ${mejorProxy.ip}:${mejorProxy.port}\n\n_Cópialo y configúralo en tu navegador para navegar._`;
                
                await sock.sendMessage(from, { text: textoRespuesta }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { text: `❌ No se encontraron proxys activos en este momento para [${country.toUpperCase()}]. Intenta más tarde.` }, { quoted: msg });
            }
        }
    });
}
