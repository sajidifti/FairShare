import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';

const createItemSchema = z.object({
  name: z.string().min(2, 'Item name must be at least 2 characters'),
  price: z.number().positive('Price must be positive'),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  depreciationYears: z.number().int().min(1, 'Must be at least 1 year'),
});

export async function POST(
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
    const { name, price, purchaseDate, depreciationYears } = createItemSchema.parse(body);

    const result = dbHelpers.createItem(
      groupId,
      name,
      price,
      purchaseDate,
      depreciationYears,
      session.userId as number
    );

    return NextResponse.json({
      success: true,
      item: {
        id: result.lastInsertRowid,
        name,
        price,
        purchaseDate,
        depreciationYears,
        groupId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Create item error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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

    const items = dbHelpers.getGroupItems(groupId);

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Get items error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
