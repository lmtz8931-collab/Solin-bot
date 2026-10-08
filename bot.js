const express = require('express');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const app = express();

// BORRA SESION VIEJA SI EXISTE
if (fs.existsSync('auth')) { fs.rmSync('auth', {recursive: true, force: true}); console.log('auth vieja borrada'); }
if (fs.existsSync('auth_info_baileys')) { fs.rmSync('auth_info_baileys', {recursive: true, force: true}); }

async function startBot(){
 console.log('=== INICIANDO BOT LIMPIO ===');
 const { state, saveCreds } = await useMultiFileAuthState('auth_new');
 const sock = makeWASocket({
   auth: state,
   logger: P({level:'silent'}),
   browser: ['SOLIN','Chrome','1.0']
 });
 sock.ev.on('creds.update', saveCreds);

 sock.ev.on('connection.update', async (u)=>{
   console.log('Estado:', u.connection);
   if(u.connection === 'open'){ console.log('✅ CONECTADO EXITOSAMENTE'); }
   if(u.connection === 'close'){
     console.log('Cerrado, reintentando...');
     let code = u.lastDisconnect?.error?.output?.statusCode;
     if(code !== DisconnectReason.loggedOut) setTimeout(startBot, 3000);
   }
 });

 if(!state.creds.registered){
   await new Promise(r=>setTimeout(r, 4000));
   try{
     console.log('Pidiendo codigo para 5218141407449...');
     let code = await sock.requestPairingCode('528141407449');
     console.log('============================');
     console.log('TU CODIGO NUEVO ES: ' + code);
     console.log('============================');
   }catch(e){ console.log('Error pidiendo codigo: ' + e); }
 }
}
startBot();
app.get('/',(req,res)=>res.send('OK'));
app.listen(process.env.PORT||10000,()=>console.log('Web ON'));
