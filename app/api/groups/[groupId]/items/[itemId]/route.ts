import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';
import { normalizeIncomingItemPayload } from '@/lib/item-utils';

const updateItemSchema = z.object({
  name: z.string().min(2, 'Item name must be at least 2 characters'),
  price: z.number().positive('Price must be positive'),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  depreciationDays: z.number().int().min(1, 'Must be at least 1 day'),
  periodType: z.enum(['days', 'years']).default('days'),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    const { groupId: groupIdStr, itemId: itemIdStr } = await params;
    const groupId = parseInt(groupIdStr);
    const itemId = parseInt(itemIdStr);

    // Check if user is in the group
    const membership = dbHelpers.isUserInGroup(session.userId as number, groupId);
    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      );
    }

  const raw = await request.json();
  const parsedRaw = normalizeIncomingItemPayload(raw);

  const parsed = updateItemSchema.parse({
    name: parsedRaw.name,
    price: parsedRaw.price,
    purchaseDate: parsedRaw.purchaseDate,
    depreciationDays: parsedRaw.depreciationDays,
    periodType: parsedRaw.periodType,
  });

  const result = dbHelpers.updateItem(itemId, parsed.name, parsed.price, parsed.purchaseDate, parsed.depreciationDays, parsed.periodType);

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
        name: parsed.name,
        price: parsed.price,
        purchaseDate: parsed.purchaseDate,
        // return canonical keys
        period_days: parsed.depreciationDays,
        period_type: parsed.periodType,
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
  { params }: { params: Promise<{ groupId: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    const { groupId: groupIdStr, itemId: itemIdStr } = await params;
    const groupId = parseInt(groupIdStr);
    const itemId = parseInt(itemIdStr);

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
