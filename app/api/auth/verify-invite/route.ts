import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/lib/database';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        }

        const tokenRow = dbHelpers.getUserToken(token, 'signup');

        if (!tokenRow) {
            return NextResponse.json({ error: 'Invalid token', valid: false }, { status: 400 });
        }

        if (tokenRow.used) {
            return NextResponse.json({ error: 'Token already used', valid: false }, { status: 400 });
        }

        if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
            return NextResponse.json({ error: 'Token expired', valid: false }, { status: 400 });
        }

        return NextResponse.json({
            valid: true,
            email: tokenRow.email,
            name: tokenRow.name,
        });
    } catch (error) {
        console.error('Verify invite error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
