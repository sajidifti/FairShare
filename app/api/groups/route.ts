import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional(),
  // Optional owner join date for when the creator should be considered to have joined
  joinedAt: z.string().optional(),
});

export async function GET() {
  try {
    const session = await requireAuth();
    const groups = dbHelpers.getUserGroups(session.userId as number);
    
    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Get groups error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { name, description, joinedAt } = createGroupSchema.parse(body);

    // Normalize joinedAt to YYYY-MM-DD if provided
    let normalizedJoinedAt: string | undefined = undefined;
    if (joinedAt) {
      const d = new Date(joinedAt);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid joinedAt date' }, { status: 400 });
      }
      normalizedJoinedAt = d.toISOString().split('T')[0];
    }

    const result = dbHelpers.createGroup(name, description || null, session.userId as number, normalizedJoinedAt);

    return NextResponse.json({
      success: true,
      group: {
        id: result.lastInsertRowid,
        name,
        description,
        inviteCode: result.inviteCode,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Create group error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
