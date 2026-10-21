const crypto = require('node:crypto');
const readline = require('node:readline');
const { readStore, writeStore, hashPassword } = require('./store');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = prompt => new Promise(resolve => rl.question(prompt, resolve));

(async () => {
  const email = (await ask('Admin email: ')).trim().toLowerCase();
  const name = (await ask('Admin name: ')).trim();
  const password = await ask('Admin password (at least 12 characters): ');
  rl.close();
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 12) {
    console.error('Use a valid email, name, and password of at least 12 characters.');
    process.exitCode = 1;
    return;
  }
  const data = readStore();
  if (data.users.some(user => user.email === email)) {
    console.error('That email is already registered.');
    process.exitCode = 1;
    return;
  }
  data.users.push({ id: crypto.randomUUID(), name, email, password: hashPassword(password), role: 'admin', active: true, createdAt: new Date().toISOString() });
  writeStore(data);
  console.log(`Admin account created for ${email}.`);
})().catch(error => { console.error(error); process.exitCode = 1; rl.close(); });
