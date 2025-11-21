import { NextResponse } from 'next/server';

const VERSUS_API_BASE = 'https://www.versussportssimulator.com/api/v1';
const APP_ID = 'AU0MUED7RMIT8YSBKJPKNIQDJ7ZWIJHT';
const API_KEY = 'YS0FH0UPXDT7HP70JXJCMEHRHKR1GI7Q';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get('sport') || 'nfl';
    const team = searchParams.get('team');

    if (!team) {
      return NextResponse.json(
        { error: 'Missing required parameter: team' },
        { status: 400 }
      );
    }

    // Versus API: teams/:sport/:team
    const response = await fetch(`${VERSUS_API_BASE}/teams/${sport}/${team}`, {
      method: 'GET',
      headers: {
        'app-id': APP_ID,
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'cache-control': 'no-cache',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Versus Team] API error:', response.status, errorText);
      throw new Error(`Versus API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Versus Team] Success! Response:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Versus Team] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

