const { getFirestore } = require('../lib/firebase-admin');
const admin = require('firebase-admin');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { page = 'unknown' } = req.query;
    // Sanitize page name: only allow safe characters, max 60 chars
    const safe  = page.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60) || 'unknown';
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const db = getFirestore();
    await db.collection('pageViews').doc(today).set(
      {
        total:               admin.firestore.FieldValue.increment(1),
        [`pages.${safe}`]:   admin.firestore.FieldValue.increment(1),
        date:                today,
        updatedAt:           new Date().toISOString(),
      },
      { merge: true },
    );

    // Return 1×1 transparent GIF so it can optionally be used as an img src
    res.setHeader('Content-Type', 'image/gif');
    res.status(200).end(
      Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64'),
    );
  } catch (_err) {
    // Silent fail — never break the page over analytics
    res.status(200).end();
  }
};
