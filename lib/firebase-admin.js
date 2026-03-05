const admin = require('firebase-admin');

let firebaseApp;

/**
 * Inicializa Firebase Admin SDK
 * Suporta tanto desenvolvimento local quanto Vercel
 */
function initializeFirebase() {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    let credential;
    let projectId;

    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
      // Production: use env vars
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      });
      projectId = process.env.FIREBASE_PROJECT_ID;
    } else {
      // Local dev: use service account JSON file
      const path = require('path');
      const fs = require('fs');
      const dir = path.join(__dirname, '..');
      const jsonFile = fs.readdirSync(dir).find(f => f.endsWith('.json') && f.includes('firebase-adminsdk'));
      if (!jsonFile) throw new Error('No Firebase service account JSON found and env vars not set.');
      const serviceAccount = JSON.parse(fs.readFileSync(path.join(dir, jsonFile), 'utf8'));
      credential = admin.credential.cert(serviceAccount);
      projectId = serviceAccount.project_id;
    }

    firebaseApp = admin.initializeApp({
      credential,
      storageBucket: `${projectId}.appspot.com`,
    });

    console.log('Firebase Admin initialized successfully');
    return firebaseApp;
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
  }
}

/**
 * Retorna instância do Firestore
 */
function getFirestore() {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.firestore();
}

/**
 * Cria um token de download permanente (sem expiração, reutilizável)
 */
async function createDownloadToken(orderId, productId, expiresInHours = null) {
  const db = getFirestore();
  const token = generateSecureToken();

  await db.collection('downloadTokens').doc(token).set({
    orderId,
    productId,
    permanent: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return token;
}

/**
 * Valida token de download (sem restrição de uso ou expiração)
 */
async function validateDownloadToken(token) {
  const db = getFirestore();
  const tokenDoc = await db.collection('downloadTokens').doc(token).get();

  if (!tokenDoc.exists) {
    return { valid: false, error: 'Token inválido' };
  }

  return { valid: true, data: tokenDoc.data() };
}

/**
 * Marca token como usado
 */
async function markTokenAsUsed(token) {
  const db = getFirestore();
  await db.collection('downloadTokens').doc(token).update({
    used: true,
    usedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Gera token seguro
 */
function generateSecureToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  initializeFirebase,
  getFirestore,
  createDownloadToken,
  validateDownloadToken,
  markTokenAsUsed,
  generateSecureToken,
};
