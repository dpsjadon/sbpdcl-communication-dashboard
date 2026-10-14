const { spawn } = require('child_process');
const path = require('path');

const PORT = 8098;

console.log('=== STARTING SBPDCL NON-COMMUNICATION DASHBOARD SERVICE ===');
console.log(`Starting Express server on port ${PORT}...`);

const serverProcess = spawn('node', ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'inherit'
});

serverProcess.on('error', err => {
  console.error('Server error:', err);
});

serverProcess.on('exit', code => {
  console.log(`Server process exited with code ${code}`);
});
