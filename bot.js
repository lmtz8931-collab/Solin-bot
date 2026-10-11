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
const BOT_NUMBER = "5218141407448"; // Tu número de ejecución

// Lista de administradores protegidos (ID de WhatsApp)
const ADMIN_IDS = [
    "525532858511@s.whatsapp.net", // ~𓆩✧alē...
    "525575704482@s.whatsapp.net", // ~🇲尋˚｡𝘕𝘭...
    "526691525030@s.whatsapp.net", // ~💕𓆩𝙺λ...
    "528777890676@s.whatsapp.net", // ~Carlos
    "524891114404@s.whatsapp.net", // ~LeoSo...
    "527777039845@s.whatsapp.net", // ~𓆩𝕃𝔸𝓩𓆪...
    "528141407448@s.whatsapp.net"  // Tu número asignado
];

// Palabras prohibidas para el filtro Anti-Spam
const SPAM_WORDS = ["gana dinero facil", "cripto gratis", "compra seguidores", "hack cuenta"];

// ==========================================
// MOTOR DE PROXYS (EXTRACCION Y VALIDACION)
// ==========================================
async function fetchProxies(country) {
    try {
        // Usamos una API pública para obtener proxys filtrados por país y protocolo
        const response = await axios.get(`https://geonode.com{country.toUpperCase()}&limit=20&page=1&sort_by=lastChecked&sort_type=desc`, { timeout: 8000 });
        if (!response.data || !response.data.data) return [];
        
        return response.data.data.map(p => ({
            ip: p.ip,
            port: p.port,
            protocol: p.protocols[0] || 'http'
        }));
    } catch (e) {
        console.error(`Error extrayendo proxys de ${country}:`, e.message);
        return [];
    }
}

async function checkProxy(ip, port, protocol) {
    try {
        // Test rápido de conectividad hacia un servidor neutral
        await axios.get('https://httpbin.org', {
            proxy: { host: ip, port: parseInt(port), protocol: protocol },
            timeout: 3000 
        });
        return true;
    } catch (e) {
        return false;
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
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Obligatorio para emparejamiento por número
        countryCode: "MX",
        printQRInTerminal: false
    });

    // Solicitar Código de Vinculación si no está registrado
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(BOT_NUMBER);
                const formattedCode = code.match(/.{1,4}/g).join("-");
                console.log(`\n==========================================`);
                console.log(`👉 TU CODIGO NUEVO ES: ${formattedCode}`);
                console.log(`==========================================\n`);
            } catch (error) {
                console.error("Error al solicitar código de vinculación:", error);
            }
        }, 4000);
    }

    sock.ev.on('creds.update', saveCreds);

    // MAVEJO DE CONEXIÓN
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('=== SOLIN BOT ESTÁ ACTIVO Y CONECTADO ===');
        }
    });

    // EVENTO: BIENVENIDA A NUEVOS USUARIOS
    sock.ev.on('group-participants.update', async (part) => {
        if (part.action === 'add') {
            for (const num of part.participants) {
                const jid = part.id;
                const welcomeMsg = `✨ ¡Bienvenido/a al grupo! ✨\n\n👋 Hola @${num.split('@')[0]}, gracias por unirte.\n\n⚠️ *Reglas importantes*:\nProhibido pasar links de otros grupos o enviar spam masivo o serás eliminado por el sistema.`;
                await sock.sendMessage(jid, { text: welcomeMsg, mentions: [num] });
            }
        }
    });

    // EVENTO: CONTROL DE MENSAJES (COMANDOS Y MODERACIÓN)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = msg.key.participant || msg.key.remoteJid;
        
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || '';
                     
        const textLower = text.toLowerCase().trim();

        // 1. MODERACIÓN: FILTRO ANTI-LINKS Y ANTI-SPAM (SOLO EN GRUPOS)
        if (isGroup) {
            const isAdmin = ADMIN_IDS.includes(sender);
            
            if (!isAdmin) {
                const hasGroupLink = textLower.includes('://whatsapp.com');
                const hasSpam = SPAM_WORDS.some(word => textLower.includes(word));
                
                if (hasGroupLink || hasSpam) {
                    // Borrar el mensaje infractor
                    await sock.sendMessage(from, { delete: msg.key });
                    
                    if (hasGroupLink) {
                        // Expulsar al usuario que mandó enlace
                        await sock.groupParticipantsUpdate(from, [sender], 'remove');
                        await sock.sendMessage(from, { text: `🚨 El usuario @${sender.split('@')[0]} fue eliminado por enviar enlaces de otros grupos.`, mentions: [sender] });
                    }
                    return;
                }
            }
        }

        // 2. COMANDOS DE PROXYS: /proxy mx o /proxy usa
        if (textLower.startsWith('/proxy')) {
            const args = textLower.split(' ');
            if (args.length < 2) return;
            
            const country = args[1];
            if (country !== 'mx' && country !== 'usa') return;

            // Mapeo interno para la API
            const countryCode = country === 'usa' ? 'us' : 'mx';
            
            await sock.sendMessage(from, { text: `⏳ Buscando y testeando proxys vivos para [${country.toUpperCase()}]... Por favor espera.` });
            
            const rawProxies = await fetchProxies(countryCode);
            const liveProxies = [];

            // Testear en paralelo para responder rápido
            for (const p of rawProxies) {
                const isLive = await checkProxy(p.ip, p.port, p.protocol);
                if (isLive) {
                    liveProxies.push(p);
                    if (liveProxies.length >= 5) break; // Detenerse al encontrar los 5 mejores rápidos
                }
            }

            if (liveProxies.length === 0) {
                await sock.sendMessage(from, { text: `❌ No se encontraron proxys activos en este momento para [${country.toUpperCase()}]. Intenta más tarde.` });
                return;
            }

            let responseText = `✨ **PROXYS VIVOS EXTRAÍDOS [${country.toUpperCase()}]** ✨\n\n`;
            liveProxies.forEach((p, index) => {
                responseText += `🔒 ${index + 1}. \`p.ip:{p.port}\` — **[${p.protocol.toUpperCase()}]**\n`;
            });
            responseText += `\n⚡ **Total activos:** ${liveProxies.length}\n🔄 ¡Listos para usar (Toca para copiar)!`;

            await sock.sendMessage(from, { text: responseText });
        }
    });
}

// Iniciar proceso del Bot
startBot().catch(err => console.error("Error crítico de inicialización:", err));
