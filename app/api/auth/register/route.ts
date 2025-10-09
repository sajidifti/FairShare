import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hashPassword, createSession } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = registerSchema.parse(body);

    // Check if user already exists
    const existingUser = dbHelpers.getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const result = dbHelpers.createUser(email, passwordHash, name);

    // Create session
    await createSession(result.lastInsertRowid as number, email, name);

    return NextResponse.json({
      success: true,
      user: {
        id: result.lastInsertRowid,
        name,
        email,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
