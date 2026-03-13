/**
 * cleanup-legacy-fields.js
 *
 * Remove campos legados de `products` e `orders`.
 *
 * Campos removidos de `products`:
 *   - imageUrl   (substituído por `image` / `images[]`)
 *   - fileUrl    (substituído por `downloadUrl`)
 *
 * Campos removidos de `orders`:
 *   - buyerEmail  (substituído por `customer.email`)
 *   - amount      (substituído por `totalAmount`)
 *   - productId   (substituído por `items[]`)
 *
 * NOTA — userProducts como UID vs E-mail:
 *   A migração de userProducts/{email} → userProducts/{uid} foi ADIADA
 *   intencionalmente. O motivo: o checkout permite compra sem conta (guest),
 *   então o webhook nunca tem UID garantido. Migrar agora quebraria downloads
 *   de usuários que compraram sem estar logados. Quando o checkout exigir login
 *   obrigatório, a migração pode ser feita com segurança.
 *
 * USO:
 *   node scripts/cleanup-legacy-fields.js --env .env.local
 *   node scripts/cleanup-legacy-fields.js --dry-run --env .env.local   (simula sem alterar)
 */

function getArgValue(flag) {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const envPath = getArgValue('--env') || '.env.local';
require('dotenv').config({ path: envPath });
const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');

const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replaceAll(String.raw`\n`, '\n')
    : undefined;

if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error(`❌ Credenciais Firebase não configuradas. Verifique ${envPath}`);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
    })
});

const db  = admin.firestore();
const DEL = admin.firestore.FieldValue.delete();

if (DRY_RUN) console.log('⚠️  MODO DRY-RUN — nenhuma alteração será feita\n');

/* ─── helpers ─────────────────────────────────────────── */

async function cleanCollection(collName, legacyFields) {
    console.log(`\n📦 Limpando coleção: ${collName}`);
    console.log(`   Campos a remover: ${legacyFields.join(', ')}`);

    const snap   = await db.collection(collName).get();
    let updated  = 0;
    let skipped  = 0;
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
        const data    = doc.data();
        const toDelete = {};
        legacyFields.forEach(f => { if (f in data) toDelete[f] = DEL; });

        if (Object.keys(toDelete).length === 0) {
            skipped++;
            continue;
        }

        if (!DRY_RUN) {
            batch.update(doc.ref, toDelete);
            batchCount++;
            if (batchCount >= BATCH_SIZE) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }

        console.log(`  ${DRY_RUN ? '[dry]' : '✅'} ${doc.id} → removeu: ${Object.keys(toDelete).join(', ')}`);
        updated++;
    }

    if (!DRY_RUN && batchCount > 0) await batch.commit();

    console.log(`   → ${updated} doc(s) ${DRY_RUN ? 'seriam atualizados' : 'atualizados'}, ${skipped} sem campos legados`);
    return updated;
}

/* ─── main ────────────────────────────────────────────── */

async function main() {
    console.log('🧹 Iniciando limpeza de campos legados\n');

    let totalUpdated = 0;

    // 1. Limpar products
    totalUpdated += await cleanCollection('products', ['imageUrl', 'fileUrl']);

    // 2. Limpar orders
    totalUpdated += await cleanCollection('orders', ['buyerEmail', 'amount', 'productId']);

    console.log('\n─────────────────────────────────────────────────');
    if (DRY_RUN) {
        console.log('⚠️  DRY-RUN concluído. Nada foi alterado.');
        console.log(`   Seriam atualizados: ${totalUpdated} doc(s)`);
    } else {
        console.log('✔  Limpeza concluída.');
        console.log(`   Atualizados: ${totalUpdated} doc(s)`);
    }
    console.log('─────────────────────────────────────────────────\n');

    process.exit(0);
}

main().catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
});
