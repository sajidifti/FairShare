import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';

const joinGroupSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required'),
  // Optional joining date in ISO (YYYY-MM-DD) or full datetime string
  joinedAt: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
  const body = await request.json();
  const { inviteCode, joinedAt } = joinGroupSchema.parse(body);

    // Normalize joinedAt to YYYY-MM-DD if provided
    let normalizedJoinedAt: string | undefined = undefined;
    if (joinedAt) {
      const d = new Date(joinedAt);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid joinedAt date' }, { status: 400 });
      }
      normalizedJoinedAt = d.toISOString().split('T')[0];
    }

    // Find group by invite code
    const group = dbHelpers.getGroupByInviteCode(inviteCode);
    if (!group) {
      return NextResponse.json(
        { error: 'Invalid invite code' },
        { status: 404 }
      );
    }

    // Check if user is already in the group
    const existingMembership = dbHelpers.isUserInGroup(session.userId as number, group.id);
    if (existingMembership) {
      return NextResponse.json(
        { error: 'You are already a member of this group' },
        { status: 400 }
      );
    }

  // Join the group (optionally with a supplied joinedAt)
  const result = dbHelpers.joinGroup(group.id, session.userId as number, normalizedJoinedAt);

    return NextResponse.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Join group error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
