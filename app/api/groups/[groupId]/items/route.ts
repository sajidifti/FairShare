import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { dbHelpers } from '@/lib/database';
import { normalizeIncomingItemPayload } from '@/lib/item-utils';

const createItemSchema = z.object({
  name: z.string().min(2, 'Item name must be at least 2 characters'),
  price: z.number().positive('Price must be positive'),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  depreciationDays: z.number().int().min(1, 'Must be at least 1 day'),
  periodType: z.enum(['days', 'years']).default('days'),
});

export async function POST(
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

    const raw = await request.json();
    const parsedRaw = normalizeIncomingItemPayload(raw);

    // Validate required fields using existing schema
    const parsed = createItemSchema.parse({
      name: parsedRaw.name,
      price: parsedRaw.price,
      purchaseDate: parsedRaw.purchaseDate,
      depreciationDays: parsedRaw.depreciationDays,
      periodType: parsedRaw.periodType,
    });

    // pass the normalized value + period type to db helper (it will compute years/days as appropriate)
    const result = dbHelpers.createItem(
      groupId,
      parsed.name,
      parsed.price,
      parsed.purchaseDate,
      parsed.depreciationDays,
      parsed.periodType,
      session.userId as number
    );

    return NextResponse.json({
      success: true,
      item: {
        id: result.lastInsertRowid,
        name: parsed.name,
        price: parsed.price,
        purchaseDate: parsed.purchaseDate,
        // return canonical keys for clarity
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

    console.error('Create item error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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
