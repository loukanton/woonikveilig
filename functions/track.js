// Cloudflare Pages Function: POST /track
// Records one share event in D1 (channel, score, postcode) for the share
// funnel. Tracking must never break the UX: every failure path returns a
// silent 204.
//
// The endpoint is public by nature (sendBeacon can't authenticate), so keep
// the attack surface small: only known channels are accepted and fields are
// length-capped. If junk rows ever show up in /stats, tightening can go here.

const CHANNELS = new Set(['whatsapp', 'x', 'linkedin', 'email', 'copy', 'native']);

// The table is created once per isolate at most; after the first successful
// write the check is skipped. Schema: ts, channel, score ("7,5"), pc (the
// postcode or buurtcode from the share URL, not the display name).
let tableEnsured = false;

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return new Response(null, { status: 204 });
  try {
    const { channel, score, pc } = await request.json();
    const ch = String(channel || '');
    if (!CHANNELS.has(ch)) return new Response(null, { status: 204 });

    if (!tableEnsured) {
      await env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS shares (ts TEXT DEFAULT CURRENT_TIMESTAMP, channel TEXT, score TEXT, pc TEXT)'
      ).run();
      tableEnsured = true;
    }
    await env.DB.prepare('INSERT INTO shares (channel, score, pc) VALUES (?, ?, ?)')
      .bind(ch, score != null ? String(score).slice(0, 8) : null, pc != null ? String(pc).slice(0, 12) : null)
      .run();
  } catch (err) {
    // ignore silently
  }
  return new Response(null, { status: 204 });
};
