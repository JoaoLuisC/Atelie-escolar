/**
 * Limpa pedidos e itens comprados de um usuário (sem apagar a conta).
 *
 * USO:
 *   node scripts/clear-user-orders.js EMAIL
 *
 * Remove:
 *   - Todos os documentos em orders onde customer.email == EMAIL
 *   - O documento userProducts/EMAIL
 *
 * NÃO remove a conta do usuário no Firebase Auth nem no Firestore (users/).
 */

require('dotenv').config({ path: '.env.local' });
const { getFirestore } = require('../lib/firebase-admin');

async function clearUserOrders(email) {
  if (!email) {
    console.error('❌ Informe o e-mail: node scripts/clear-user-orders.js EMAIL');
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
    const batch = db.batch();
    ordersSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`🗑️  ${ordersSnap.size} pedido(s) removido(s)`);
  }

  /* ── 2. Apagar userProducts ── */
  const upRef = db.collection('userProducts').doc(email);
  const upDoc = await upRef.get();
  if (upDoc.exists) {
    await upRef.delete();
    console.log(`🗑️  userProducts/${email} removido`);
  } else {
    console.log(`ℹ️  userProducts/${email} não existia`);
  }

  console.log('✅ Pronto! Conta do usuário mantida intacta.');
  process.exit(0);
}

clearUserOrders(process.argv[2]);
