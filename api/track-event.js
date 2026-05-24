const { isClientEventAllowed, recordEvent } = require('../lib/analytics-events');
const { getSupabaseConfig } = require('../lib/supabase'); // helpers vêm de lib/analytics-events.js

module.exports = async function trackEventHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    if (!getSupabaseConfig()) {
      // Falha silenciosa: tracking não pode quebrar o cliente.
      return res.status(204).end();
    }

    const body = req.body || {};
    const eventName = String(body.event_name || '').slice(0, 64);

    if (!eventName || !isClientEventAllowed(eventName)) {
      return res.status(204).end();
    }

    await recordEvent({
      eventName,
      sessionId: body.session_id,
      properties: body.properties || {},
      source: 'web',
    });

    return res.status(204).end();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[track-event]', error.message);
    }
    return res.status(204).end();
  }
};
