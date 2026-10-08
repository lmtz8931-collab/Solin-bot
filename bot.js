const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const app = express();

async function startBot(){
 console.log('Iniciando bot...');
 const {state, saveCreds} = await useMultiFileAuthState('auth');
 const {version} = await fetchLatestBaileysVersion();
 const sock = makeWASocket({version, auth: state, logger: P({level:'silent'})});
 sock.ev.on('creds.update', saveCreds);

 if(!state.creds.registered){
   console.log('No registrado, pidiendo codigo...');
   setTimeout(async()=>{
     const num = '5218141407449';
     try{
       let code = await sock.requestPairingCode(num);
       console.log('============================');
       console.log('CODIGO: ' + code);
       console.log('============================');
     }catch(e){ console.log('Error codigo: ' + e.message) }
   }, 5000);
 }

 sock.ev.on('connection.update', (u)=>{
   console.log('Connection:', u.connection);
   if(u.connection==='open') console.log('✅ CONECTADO EXITOSAMENTE');
   if(u.connection==='close'){
     console.log('Cerrado:', u.lastDisconnect?.error?.message);
     if(u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
   }
 });
}
startBot();
app.get('/',(req,res)=>res.send('BOT ON'));
app.listen(process.env.PORT||10000,()=>console.log('Web en puerto 10000'));
