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
 * Retorna instância do Storage
 * NOTA: Storage não está sendo usado - arquivos são hospedados no Google Drive
 */
function getStorage() {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.storage();
}

/**
 * Cria um token de download temporário
 */
async function createDownloadToken(orderId, productId, expiresInHours = 24) {
  const db = getFirestore();
  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiresInHours);

  await db.collection('downloadTokens').doc(token).set({
    orderId,
    productId,
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    used: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return token;
}

/**
 * Valida token de download
 */
async function validateDownloadToken(token) {
  const db = getFirestore();
  const tokenDoc = await db.collection('downloadTokens').doc(token).get();

  if (!tokenDoc.exists) {
    return { valid: false, error: 'Token inválido' };
  }

  const data = tokenDoc.data();

  if (data.used) {
    return { valid: false, error: 'Token já utilizado' };
  }

  if (data.expiresAt.toDate() < new Date()) {
    return { valid: false, error: 'Token expirado' };
  }

  return { valid: true, data };
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
  getStorage,
  createDownloadToken,
  validateDownloadToken,
  markTokenAsUsed,
  generateSecureToken,
};
