// Pinoy Torn web client — ISANG setting lang ang babaguhin.
// One setting only. Copy this into the game client and point it at the server.
//
//   Local test:  const API_URL = 'http://localhost:3000';
//   Live VPS:    const API_URL = 'https://api.pinoytorn.ph';  // o IP: http://123.45.67.89:3000
//
// Lahat ng tawag ng client ay `${API_URL}/api/...` at WebSocket sa
// `${API_URL.replace('http','ws')}/ws?token=...` — walang ibang URL na hard-coded.
const API_URL = 'http://localhost:3000';

// Halimbawa ng paggamit (fetch):
//   const res = await fetch(`${API_URL}/api/auth/login`, {
//     method: 'POST', headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ username, password })
//   });
//   const { token } = await res.json();
//   // Kasunod na tawag: headers: { Authorization: 'Bearer ' + token }
//
// WebSocket (chat / live feed):
//   const ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws?token=${token}`);
//   ws.onmessage = (e) => console.log(JSON.parse(e.data));
//
// I-export kung gumagamit ng module system:
// module.exports = { API_URL };
// export { API_URL };
