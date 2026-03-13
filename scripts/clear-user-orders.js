/**
 * Limpa pedidos e itens comprados de um usuário (sem apagar a conta).
 *
 * USO:
 *   node scripts/clear-user-orders.js EMAIL --yes --env .env.local
 *   node scripts/clear-user-orders.js EMAIL --dry-run
 *
 * Remove:
 *   - Todos os documentos em orders onde customer.email == EMAIL
 *   - O documento userProducts/EMAIL
 *
 * NÃO remove a conta do usuário no Firebase Auth nem no Firestore (users/).
 */

function getArgValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function getFirstPositionalArg() {
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      if (arg === '--env') i++;
      continue;
    }
    return arg;
  }
  return undefined;
}

const envPath = getArgValue('--env') || '.env.local';
require('dotenv').config({ path: envPath });

const { getFirestore } = require('../lib/firebase-admin');
const force = process.argv.includes('--yes');
const dryRun = process.argv.includes('--dry-run');

async function clearUserOrders(email) {
  if (!email) {
    console.error('❌ Informe o e-mail: node scripts/clear-user-orders.js EMAIL --yes');
    process.exit(1);
  }

  if (!force && !dryRun) {
    console.error('❌ Operação bloqueada: use --yes para confirmar (ou --dry-run para simular).');
    process.exit(1);
  }

  const db = getFirestore();

  /* ── 1. Apagar pedidos ── */
  const ordersSnap = await db.collection('orders')
    .where('customer.email', '==', email)
    .get();

  if (ordersSnap.empty) {
    console.log(`ℹ️  Nenhum pedido encontrado para ${email}`);
  } else {
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let count = 0;
    let batchCount = 0;

    for (const doc of ordersSnap.docs) {
      if (!dryRun) {
        batch.delete(doc.ref);
        batchCount++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
      count++;
    }

    if (!dryRun && batchCount > 0) {
      await batch.commit();
    }

    console.log(`${dryRun ? '🧪' : '🗑️ '} ${count} pedido(s) ${dryRun ? 'seriam removido(s)' : 'removido(s)'}`);
  }

  /* ── 2. Apagar userProducts ── */
  const upRef = db.collection('userProducts').doc(email);
  const upDoc = await upRef.get();
  if (upDoc.exists) {
    if (!dryRun) {
      await upRef.delete();
    }
    console.log(`${dryRun ? '🧪' : '🗑️ '} userProducts/${email} ${dryRun ? 'seria removido' : 'removido'}`);
  } else {
    console.log(`ℹ️  userProducts/${email} não existia`);
  }

  console.log(`✅ ${dryRun ? 'Simulação concluída.' : 'Pronto!'} Conta do usuário mantida intacta.`);
  process.exit(0);
}

const emailArg = getFirstPositionalArg();
clearUserOrders(emailArg);
