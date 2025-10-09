import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional(),
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
    const { name, description } = createGroupSchema.parse(body);

    const result = dbHelpers.createGroup(name, description || null, session.userId as number);

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
        { error: 'Validation failed', details: error.errors },
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
