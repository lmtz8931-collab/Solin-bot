const express = require('express');
const fs = require('fs');
const net = require('net');
const axios = require('axios');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');

const app = express();
let sock;

const LINK_REGEX = /chat\.whatsapp\.com\/[0-9A-Za-z]+/i;
const VENTA_REGEX = /(vendo|venta|precio|disponible|entrego|oferta|comprar)/i;
const spamMap = new Map();

// --- PROXYS ---
async function getProxies(pais) {
    try {
        const url = `https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=${pais.toUpperCase()}`;
        const { data } = await axios.get(url, { timeout: 15000 });
        return data.trim().split('\n').map(l => {
            const [ip, port] = l.trim().split(':');
            return { ip, port };
        }).filter(p => p.ip && p.port);
    } catch { return []; }
}
function testProxy(ip, port) {
    return new Promise(res => {
        const s = new net.Socket();
        let ok = false;
        s.setTimeout(3000);
        s.on('connect', () => { ok = true; s.destroy(); });
        s.on('timeout', () => s.destroy());
        s.on('error', () => s.destroy());
        s.on('close', () => res(ok));
        s.connect(parseInt(port), ip);
    });
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({ version, auth: state, logger: P({ level: 'silent' }) });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') console.log('✅ SOLIN CONECTADO');
        if (u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) startBot();
    });

    // BIENVENIDA
    sock.ev.on('group-participants.update', async (anu) => {
        if (anu.action === 'add') {
            for (let p of anu.participants) {
                await sock.sendMessage(anu.id, { text: `👋 Bienvenido @${p.split('@')[0]} a *SOLIN* 🔥\nEscribe /cmds para ver comandos`, mentions: [p] });
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        const from = m.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
        const low = text.toLowerCase();
        const sender = m.key.participant || from;

        let isAdmin = false, isBotAdmin = false;
        if (isGroup) {
            try {
                const meta = await sock.groupMetadata(from);
                const admins = meta.participants.filter(p => p.admin).map(p => p.id);
                isAdmin = admins.includes(sender);
                isBotAdmin = admins.includes(sock.user.id);
            } catch {}
        }

        // ANTI-LINK
        if (isGroup && LINK_REGEX.test(text) &&!isAdmin && isBotAdmin) {
            await sock.sendMessage(from, { delete: m.key });
            await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} Links de otros grupos no permitidos`, mentions: [sender] });
            return;
        }

        // ANTI-VENTA
        if (isGroup && VENTA_REGEX.test(low) &&!isAdmin && isBotAdmin) {
            await sock.sendMessage(from, { text: `🚫 Ventas no permitidas @${sender.split('@')[0]}`, mentions: [sender] });
            await sock.groupParticipantsUpdate(from, [sender], 'remove');
            return;
        }

        // ANTI-SPAM simple
        if (isGroup &&!isAdmin) {
            const key = `${from}-${sender}`;
            const now = Date.now();
            let d = spamMap.get(key) || { count: 0, last: now };
            if (now - d.last < 5000) d.count++; else d.count = 1;
            d.last = now;
            spamMap.set(key, d);
            if (d.count > 5 && isBotAdmin) {
                await sock.sendMessage(from, { text: `⚠️ Spam detectado @${sender.split('@')[0]}`, mentions: [sender] });
                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                spamMap.delete(key);
                return;
            }
        }

        // CMDS
        if (low === '/cmds' || low === '/menu') {
            await sock.sendMessage(from, { text: `🤖 *SOLIN - COMANDOS*\n\n📍 *PROXYS*\n• proxy mx\n• proxy mx 20\n• proxy usa 100\nPaíses: mx, us, br, co, es, ar, pe, cl, de, fr\n\n🛡️ *ADMIN AUTO*\n• Bienvenida a nuevos\n• Borra links de otros grupos\n• Expulsa spam y ventas\n\n✅ Bot activo 24/7 en Render` });
        }

        // PROXY
        if (low.startsWith('proxy ')) {
            let parts = low.split(' ');
            let pais = (parts[1] || '').replace('usa','us');
            let cant = parseInt(parts[2]) || 5;
            if (cant > 100) cant = 100;
            const validos = ['mx','us','br','co','es','ar','pe','cl','de','fr'];
            if (!validos.includes(pais)) {
                await sock.sendMessage(from, { text: `❌ País no válido. Usa: ${validos.join(', ')}` });
                return;
            }
            await sock.sendMessage(from, { text: `🔍 Buscando 100 proxys ${pais.toUpperCase()}... 30s ⏳` });
            const lista = await getProxies(pais);
            if (!lista.length) {
                await sock.sendMessage(from, { text: `❌ No hay proxys de ${pais.toUpperCase()} ahora` });
                return;
            }
            let vivos = [];
            for (let p of lista.slice(0,100)) {
                if (await testProxy(p.ip, p.port)) vivos.push(`${p.ip}:${p.port}`);
            }
            if (!vivos.length) {
                await sock.sendMessage(from, { text: `⚠️ 0 vivos de 100 en ${pais.toUpperCase()}` });
                return;
            }
            if (vivos.length <= 20 && cant <= 20) {
                await sock.sendMessage(from, { text: `✅ *${pais.toUpperCase()} VIVOS ${vivos.length}/100*\n\n${vivos.join('\n')}` });
            } else {
                const file = `proxys_${pais}_${Date.now()}.txt`;
                fs.writeFileSync(file, vivos.slice(0,cant).join('\n'));
                await sock.sendMessage(from, { document: fs.readFileSync(file), mimetype: 'text/plain', fileName: file, caption: `✅ ${vivos.length} VIVOS de 100 - ${pais.toUpperCase()}` });
                fs.unlinkSync(file);
            }
        }
    });
}
startBot();

app.get('/', (req,res)=> res.send('SOLIN Bot Activo ✅'));
app.get('/check', async (req,res)=>{
    if(!sock) return res.json({error:'iniciando'});
    const jid = `${req.query.number}@s.whatsapp.net`;
    const [r] = await sock.onWhatsApp(jid);
    res.json({exists:!!r?.exists});
});
app.listen(process.env.PORT || 10000);
