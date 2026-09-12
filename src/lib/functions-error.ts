/**
 * Fehlertext aus einer Edge-Function-Antwort holen. supabase-js liefert bei
 * Nicht-2xx nur einen FunctionsHttpError mit der Response im `context`; der
 * eigentliche Text (`{ error: '…' }`, bei unseren Functions deutsch) steckt
 * im Body und muss erst gelesen werden.
 */
export async function fehlertextAusFunktion(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    const body = (await context.clone().json()) as { error?: unknown };
    return typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : null;
  } catch {
    return null;
  }
}
