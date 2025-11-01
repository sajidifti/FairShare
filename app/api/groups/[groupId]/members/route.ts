import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';
import crypto from 'crypto';
import { hashPassword } from '@/lib/auth';

const updateMemberSchema = z.object({
  leaveDate: z.string().nullable(),
  joinedAt: z.string().optional(),
  memberId: z.number().optional(),
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

// Owner-only: invite or reset actions, or manually add member
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const session = await requireAuth();
    const groupId = parseInt(params.groupId);

    // Check role
    const role = dbHelpers.getUserRoleInGroup(session.userId as number, groupId);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Only group owner can add members' }, { status: 403 });
    }

    const body = await request.json();
    // Expect action: 'invite' or 'reset'. For invite: name, email, joinedAt(optional).
    const { action } = body as any;

    if (action === 'invite') {
      const { name, email, joinedAt } = body as { name: string; email: string; joinedAt?: string };
      if (!email || !name) {
        return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
      }

      // Check if user exists
      let user = dbHelpers.getUserByEmail(email);
      if (!user) {
        // create user with random temp password
        const temp = crypto.randomBytes(16).toString('hex');
        const pwHash = await hashPassword(temp);
        const res = dbHelpers.createUser(email, pwHash, name);
        user = dbHelpers.getUserById(res.lastInsertRowid as number);
      }

      // Add to group (with joinedAt if provided)
      dbHelpers.joinGroup(groupId, user.id, joinedAt as string | undefined);

      // Create signup token
      const token = crypto.randomBytes(24).toString('hex');
      // expires in 7 days
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      dbHelpers.createUserToken(user.id, token, 'signup', expiresAt);

  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const link = `${appUrl}/auth/accept-invite?token=${token}`;

      return NextResponse.json({ success: true, link, email, name });
    }

    if (action === 'reset') {
      const { userId } = body as { userId: number };
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

      const user = dbHelpers.getUserById(userId);
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      // create reset token
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      dbHelpers.createUserToken(user.id, token, 'reset', expiresAt);

  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  const link = `${appUrl}/auth/accept-invite?token=${token}`;
      return NextResponse.json({ success: true, link, userId: user.id, email: user.email });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Add member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
  const { leaveDate, memberId, joinedAt } = updateMemberSchema.parse(body);

    // Determine which group_member to update. By default a user can update their own leave date.
    let targetGroupMemberId = membership.id;

    if (memberId !== undefined && memberId !== null) {
      // Only owners can update another member's leave date
      const role = dbHelpers.getUserRoleInGroup(session.userId as number, groupId);
      if (role !== 'owner') {
        return NextResponse.json({ error: 'Only group owner can update other members' }, { status: 403 });
      }

      // Verify the memberId belongs to this group
      const members = dbHelpers.getGroupMembers(groupId);
      const found = members.find((m: any) => m.id === memberId);
      if (!found) {
        return NextResponse.json({ error: 'Member not found in this group' }, { status: 404 });
      }

      targetGroupMemberId = memberId;
    }

    // Update member leave date and/or joined_at
    const resultLeave = leaveDate !== undefined ? dbHelpers.updateMemberLeaveDate(targetGroupMemberId, leaveDate) : null;
    const resultJoined = joinedAt !== undefined ? dbHelpers.updateMemberJoinedAt(targetGroupMemberId, joinedAt) : null;

    return NextResponse.json({
      success: true,
      member: {
        id: targetGroupMemberId,
        leaveDate: leaveDate === undefined ? undefined : leaveDate,
        joinedAt: joinedAt === undefined ? undefined : joinedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
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
