/**
 * seed-users-collection.js
 * 
 * Lê todos os usuários do Firebase Auth e cria documentos
 * faltantes na coleção `users` do Firestore.
 * 
 * USO:
 *   node scripts/seed-users-collection.js
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error('❌ Credenciais Firebase não configuradas. Verifique .env.local');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
    })
});

const auth = admin.auth();
const db   = admin.firestore();

async function seedUsers() {
    console.log('🔍 Listando usuários do Firebase Auth...\n');

    let allUsers = [];
    let pageToken;

    // Busca todos os usuários (paginado de 1000 em 1000)
    do {
        const result = await auth.listUsers(1000, pageToken);
        allUsers = allUsers.concat(result.users);
        pageToken = result.pageToken;
    } while (pageToken);

    console.log(`👤 ${allUsers.length} usuário(s) encontrado(s) no Auth\n`);

    let created = 0;
    let skipped = 0;

    for (const user of allUsers) {
        const ref  = db.collection('users').doc(user.uid);
        const snap = await ref.get();

        if (snap.exists) {
            console.log(`  ⏭  Já existe: ${user.email || user.uid}`);
            skipped++;
            continue;
        }

        const provider = user.providerData?.[0]?.providerId || 'email';

        await ref.set({
            uid:       user.uid,
            email:     user.email || '',
            name:      user.displayName || '',
            photoURL:  user.photoURL || '',
            provider:  provider === 'google.com' ? 'google' : 'email',
            createdAt: user.metadata.creationTime
                ? admin.firestore.Timestamp.fromDate(new Date(user.metadata.creationTime))
                : admin.firestore.FieldValue.serverTimestamp(),
            purchases: 0,
        });

        console.log(`  ✅ Criado: ${user.email || user.uid}`);
        created++;
    }

    console.log(`\n✔  Concluído — ${created} criado(s), ${skipped} já existiam.`);
    process.exit(0);
}

seedUsers().catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
});
