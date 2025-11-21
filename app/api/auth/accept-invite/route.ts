import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { dbHelpers } from '@/lib/database';
import { hashPassword, createSession } from '@/lib/auth';

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).optional(),
  password: z.string().min(6),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, name, password } = acceptSchema.parse(body);

    const tokenRow = dbHelpers.getUserToken(token);
    if (!tokenRow) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    if (tokenRow.used) return NextResponse.json({ error: 'Token already used' }, { status: 400 });
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 400 });
    }

    const userId = tokenRow.user_id;
    const user = dbHelpers.getUserById(userId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // update password
    const pwHash = await hashPassword(password);
    dbHelpers.updateUserPassword(userId, pwHash);

    // update name if provided
    if (name) dbHelpers.updateUserName(userId, name);

    // mark token used
    dbHelpers.markUserTokenUsed(token);

    // create session
    await createSession(userId, user.email, name || user.name);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    console.error('Accept invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
