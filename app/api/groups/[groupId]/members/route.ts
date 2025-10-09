import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';

const updateMemberSchema = z.object({
  leaveDate: z.string().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const session = await requireAuth();
    const groupId = parseInt(params.groupId);

    // Check if user is in the group
    const membership = dbHelpers.isUserInGroup(session.userId as number, groupId);
    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      );
    }

    const members = dbHelpers.getGroupMembers(groupId);

    return NextResponse.json({ members });
  } catch (error) {
    console.error('Get members error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const session = await requireAuth();
    const groupId = parseInt(params.groupId);

    // Check if user is in the group
    const membership = dbHelpers.isUserInGroup(session.userId as number, groupId);
    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { leaveDate } = updateMemberSchema.parse(body);

    // Update member leave date
    const result = dbHelpers.updateMemberLeaveDate(membership.id, leaveDate);

    return NextResponse.json({
      success: true,
      member: {
        id: membership.id,
        leaveDate,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Update member error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
