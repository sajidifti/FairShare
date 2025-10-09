import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';

const joinGroupSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { inviteCode } = joinGroupSchema.parse(body);

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

    // Join the group
    const result = dbHelpers.joinGroup(group.id, session.userId as number);

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
        { error: 'Validation failed', details: error.errors },
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
