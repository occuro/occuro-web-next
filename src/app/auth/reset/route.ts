import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const cookieStore = await cookies();

  // Delete ALL cookies
  for (const cookie of cookieStore.getAll()) {
    cookieStore.delete(cookie.name);
  }

  // Redirect to login
  const url = new URL('/auth/login', request.url);
  return NextResponse.redirect(url);
}
