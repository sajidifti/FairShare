import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';

const updateItemSchema = z.object({
  name: z.string().min(2, 'Item name must be at least 2 characters'),
  price: z.number().positive('Price must be positive'),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  depreciationYears: z.number().int().min(1, 'Must be at least 1 year'),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { groupId: string; itemId: string } }
) {
  try {
    const session = await requireAuth();
    const groupId = parseInt(params.groupId);
    const itemId = parseInt(params.itemId);

    // Check if user is in the group
    const membership = dbHelpers.isUserInGroup(session.userId as number, groupId);
    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, price, purchaseDate, depreciationYears } = updateItemSchema.parse(body);

    const result = dbHelpers.updateItem(itemId, name, price, purchaseDate, depreciationYears);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      item: {
        id: itemId,
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

    console.error('Update item error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { groupId: string; itemId: string } }
) {
  try {
    const session = await requireAuth();
    const groupId = parseInt(params.groupId);
    const itemId = parseInt(params.itemId);

    // Check if user is in the group
    const membership = dbHelpers.isUserInGroup(session.userId as number, groupId);
    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      );
    }

    const result = dbHelpers.deleteItem(itemId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Item deleted successfully',
    });
  } catch (error) {
    console.error('Delete item error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
