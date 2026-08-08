/**
 * CRM BYTE — Client-Side Crypto (WebCrypto API)
 * For zero-knowledge vault operations in the browser.
 * The master password NEVER leaves the client.
 */

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes (GCM standard)
const SALT_LENGTH = 16; // bytes

/**
 * Derive an AES-256 key from a password using PBKDF2.
 */
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext using AES-256-GCM with a password.
 * @returns {{ ciphertext: string, iv: string, salt: string }}
 */
export async function encrypt(plaintext, password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bufferToHex(new Uint8Array(encrypted)),
    iv: bufferToHex(iv),
    salt: bufferToHex(salt),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM with a password.
 */
export async function decrypt(ciphertextHex, password, ivHex, saltHex) {
  const decoder = new TextDecoder();
  const salt = hexToBuffer(saltHex);
  const iv = hexToBuffer(ivHex);
  const ciphertext = hexToBuffer(ciphertextHex);
  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return decoder.decode(decrypted);
}

/**
 * Capture a photo from the camera for biometric verification.
 * @returns {Promise<string>} Base64-encoded JPEG image
 */
export async function captureCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
  });

  const video = document.createElement('video');
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();

  // Wait for video to stabilize
  await new Promise((r) => setTimeout(r, 1000));

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // Stop camera
  stream.getTracks().forEach((track) => track.stop());

  return canvas.toDataURL('image/jpeg', 0.8);
}

// ─── Hex Utilities ──────────────────────────────────────────
function bufferToHex(buffer) {
  return Array.from(buffer).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

export default { encrypt, decrypt, captureCamera };
