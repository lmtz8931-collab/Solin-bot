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

// ==========================================
// MOTOR MASIVO: EXTRACCIÓN DE +100 PROXIES
// ==========================================
async function fetchProxies(countryCode) {
    let combinedProxies = [];

    // Fuente 1: ProxyScrape API Masiva (Descarga hasta 100 proxies directos)
    try {
        const urlScrape = `https://proxyscrape.com{countryCode}&timeout=4000`;
        const res = await axios.get(urlScrape, { timeout: 5000 });
        if (res.data && res.data.proxies) {
            res.data.proxies.forEach(p => {
                combinedProxies.push({ ip: p.ip, port: p.port, protocol: p.protocol || 'http' });
            });
        }
    } catch (e) { console.error("Error temporal Fuente 1:", e.message); }

    // Fuente 2: PubProxy API (Respaldo alternativo de IPs)
    try {
        const urlPub = `https://pubproxy.com{countryCode.toUpperCase()}&limit=20&format=json`;
        const res = await axios.get(urlPub, { timeout: 5000 });
        if (res.data && res.data.data) {
            res.data.data.forEach(p => {
                combinedProxies.push({ ip: p.ip, port: p.port, protocol: p.type || 'http' });
            });
        }
    } catch (e) { console.error("Error temporal Fuente 2:", e.message); }

    // Eliminación estricta de IPs duplicadas
    const uniqueMap = new Map();
    combinedProxies.forEach(item => uniqueMap.set(item.ip, item));
    return Array.from(uniqueMap.values());
}

// FILTRO ULTRAESTRICTO: SÓLO DEJA PASAR LOS LIVES EN TIEMPO REAL
async function checkProxy(ip, port, protocol) {
    try {
        // Hace una petición real de prueba. Si el proxy responde en menos de 2.5s, está LIVE
        await axios.get('https://httpbin.org', {
            proxy: { host: ip, port: parseInt(port), protocol: protocol.toLowerCase() },
            timeout: 2500 
        });
        return true; // Proxy activo y rápido -> Pasa el filtro
    } catch (e) {
        return false; // Proxy muerto, lento o caído -> Se descarta por completo
    }
}

// ==========================================
// INICIO DEL BOT DE WHATSAPP
// ==========================================
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
        countryCode: "MX",
        printQRInTerminal: false
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(BOT_NUMBER);
                const formattedCode = code.match(/.{1,4}/g).join("-");
                console.log(`\n==========================================`);
                console.log(`👉 TU CODIGO NUEVO ES: ${formattedCode}`);
                console.log(`==========================================\n`);
            } catch (error) { console.error("Error en vinculación:", error); }
        }, 4000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('=== SOLIN BOT ESTÁ ACTIVO Y CONECTADO ===');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = msg.key.participant || msg.key.remoteJid;
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const textLower = text.toLowerCase().trim();

        if (isGroup) {
            const isAdmin = ADMIN_IDS.includes(sender);
            if (!isAdmin) {
                const hasGroupLink = textLower.includes('://whatsapp.com');
                const hasSpam = SPAM_WORDS.some(word => textLower.includes(word));
                if (hasGroupLink || hasSpam) {
                    await sock.sendMessage(from, { delete: msg.key });
                    if (hasGroupLink) await sock.groupParticipantsUpdate(from, [sender], 'remove');
                    return;
                }
            }
        }

        // COMANDO: /cmds (MENÚ)
        if (textLower === '/cmds') {
            const menuText = `🤖 *MENÚ DE SOLIN BOT* 🤖\n\n` +
                             `Envía los siguientes comandos para interactuar conmigo:\n\n` +
                             `📌 *Comandos Generales:*\n` +
                             `• \`/cmds\` : Abre este menú informático.\n` +
                             `• \`/iptv\` : Obtén listas M3U estables con miles de canales libres.\n\n` +
                             `🔒 *Comandos de Proxys (Filtro 100% Lives):*\n` +
                             `• \`/proxy mx\` : Escanea +100 IPs y extrae sólo las LIVES de México.\n` +
                             `• \`/proxy usa\` : Escanea +100 IPs y extrae sólo las LIVES de USA.\n\n` +
                             `🛡️ *Seguridad:* Filtros automáticos contra Spam y Enlaces activados.`;
            await sock.sendMessage(from, { text: menuText });
            return;
        }

        // COMANDO: /iptv
        if (textLower === '/iptv') {
            const iptvText = `📺 *LISTAS M3U PÚBLICAS Y ACTIVAS* 📺\n\n` +
                             `Aquí tienes los mejores servidores M3U abiertos de actualización automática. Cópialos en tu app reproductora (IPTV Smarters, Televizo o VLC):\n\n` +
                             `🌍 *1. Lista Global Completa (+8000 canales del mundo):*\n` +
                             `\`https://iptv-org.github.io/iptv/index.m3u\`\n\n` +
                             `🇲🇽 *2. Lista Especializada en México:* \n` +
                             `\`https://github.io\`\n\n` +
                             `🎬 *3. Lista Temática de Películas y Series en Abierto:*\n` +
                             `\`https://github.io\`\n\n` +
                             `💡 *Nota:* Los canales caídos se reparan solos remotamente gracias al soporte de los servidores de GitHub.`;
            await sock.sendMessage(from, { text: iptvText });
            return;
        }

        // COMANDOS DE PROXYS (CON VERIFICADOR MASIVO DE LIVES)
        if (textLower.startsWith('/proxy')) {
            const args = textLower.split(' ');
            if (args.length < 2) return;
            
            const country = args[1];
            if (country !== 'mx' && country !== 'usa') return;

            const countryCode = country === 'usa' ? 'us' : 'mx';
            await sock.sendMessage(from, { text: `🔍 *Iniciando escaneo masivo...* Descargando pool de más de 100 proxies y testeándolos en paralelo. Descartaremos los caídos para dejarte solo los *LIVES*. Espera un momento...` });
            
            const rawProxies = await fetchProxies(countryCode);
            const liveProxies = [];

            // REVISIÓN EN PARALELO ULTRA-RÁPIDA
            const checkPromises = rawProxies.map(async (p) => {
                const isLive = await checkProxy(p.ip, p.port, p.protocol);
                if (isLive && liveProxies.length < 15) { 
                    liveProxies.push(p); // Sólo los que responden con éxito se guardan aquí
                }
            });

            // Esperar que todas las promesas terminen al mismo tiempo
            await Promise.all(checkPromises);

            if (liveProxies.length === 0) {
                await sock.sendMessage(from, { text: `❌ Se analizaron más de 100 servidores de múltiples fuentes, pero ninguno se encuentra LIVE o estable en este momento para [${country.toUpperCase()}]. Intenta de nuevo en unos minutos.` });
                return;
            }

            let responseText = `✨ **PROXYS TOTALMENTE LIVES [${country.toUpperCase()}]** ✨\n`;
            responseText += `*Verificados en tiempo real. Los servidores muertos fueron eliminados.*\n\n`;
            
            liveProxies.forEach((p, index) => {
                responseText += `🔒 ${index + 1}. \`${p.ip}:${p.port}\` — [${p.protocol.toUpperCase()}]\n`;
            });
            
            responseText += `\n⚡ **Pool total analizado:** +${rawProxies.length} servidores\n🔄 ¡Listos para usar! Toca sobre cualquiera para copiar de inmediato.`;

            await sock.sendMessage(from, { text: responseText });
        }
    });
}

startBot().catch(err => console.error("Error crítico:", err));

const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => { res.send('Solin Bot funcionando en Render.'); });
