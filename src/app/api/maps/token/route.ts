import { NextResponse } from 'next/server';
import { SignJWT, importPKCS8 } from 'jose';

/**
 * Issues a short-lived MapKit JS auth token.
 *
 * Apple MapKit JS authenticates each map session with an ES256-signed
 * JWT, signed with a private key (.p8 file) you generate in the Apple
 * Developer portal. The token is bound to your Team ID, the Key ID,
 * and an `origin` (the host that's allowed to use it).
 *
 * Required env vars (set in Vercel project settings):
 *   APPLE_MAPS_TEAM_ID    — your 10-char Apple developer Team ID
 *   APPLE_MAPS_KEY_ID     — the 10-char Key ID printed when you create the MapKit key
 *   APPLE_MAPS_PRIVATE_KEY— full contents of the .p8 file (with BEGIN/END markers)
 *
 * Setup steps:
 *   1. Apple Developer portal → Certificates, IDs & Profiles → Keys → "+"
 *   2. Name it "occuro MapKit", check "MapKit JS", configure → register
 *   3. Download the .p8 (only once!) and copy the Key ID
 *   4. Find your Team ID in the top right of the developer portal
 *   5. Set the three env vars above (paste the .p8 contents *as-is*,
 *      including the BEGIN/END lines, into APPLE_MAPS_PRIVATE_KEY)
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const teamId = process.env.APPLE_MAPS_TEAM_ID;
  const keyId = process.env.APPLE_MAPS_KEY_ID;
  // Vercel env vars don't preserve real newlines — accept either real
  // newlines or `\n` escape sequences and normalize to real newlines.
  const rawKey = process.env.APPLE_MAPS_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!teamId || !keyId || !rawKey) {
    return NextResponse.json(
      { error: 'apple_maps_not_configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const privateKey = await importPKCS8(rawKey, 'ES256');
    const now = Math.floor(Date.now() / 1000);
    // 30-minute lifetime — long enough that the page doesn't constantly
    // refetch, short enough that a leaked token has limited blast radius.
    const expiresIn = 60 * 30;

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .sign(privateKey);

    return NextResponse.json(
      { token, expiresAt: now + expiresIn },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[maps/token] failed to sign:', e);
    return NextResponse.json(
      { error: 'token_signing_failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
