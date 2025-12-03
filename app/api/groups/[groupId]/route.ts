import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const session = await requireAuth();
    const { groupId: groupIdStr } = await params;
    const groupId = parseInt(groupIdStr);

    // Check if user is in the group
    const membership = dbHelpers.isUserInGroup(session.userId as number, groupId);
    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      );
    }

    // Get group details
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Get group members
    const members = dbHelpers.getGroupMembers(groupId);
  const currentUserRole = dbHelpers.getUserRoleInGroup(session.userId as number, groupId);

    // Get group items
    const items = dbHelpers.getGroupItems(groupId);

    return NextResponse.json({
      group: {
        ...group,
        members,
        items,
        currentUserRole,
      },
    });
  } catch (error) {
    console.error('Get group error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
