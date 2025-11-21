import { NextResponse } from 'next/server';

const VERSUS_API_BASE = 'https://www.versussportssimulator.com/api/v1';
const APP_ID = 'AU0MUED7RMIT8YSBKJPKNIQDJ7ZWIJHT';
const API_KEY = 'YS0FH0UPXDT7HP70JXJCMEHRHKR1GI7Q';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      sport,
      awayTeamId,
      homeTeamId,
    } = body;

    if (!sport || !awayTeamId || !homeTeamId) {
      return NextResponse.json(
        { error: 'Missing required fields: sport, awayTeamId, homeTeamId' },
        { status: 400 }
      );
    }

    // Versus API uses GET with path parameters: simulation/:sport/:homeTeam/:awayTeam
    // Note: The API documentation shows homeTeam first, then awayTeam in the path
    const endpoint = `${VERSUS_API_BASE}/simulation/${sport}/${homeTeamId}/${awayTeamId}`;
    
    console.log('[Versus Simulation] Request:', {
      sport,
      homeTeamId,
      awayTeamId,
      endpoint,
    });

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'app-id': APP_ID,
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'cache-control': 'no-cache',
      },
    });

    console.log('[Versus Simulation] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Versus Simulation] Response error:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('[Versus Simulation] Success! Data:', data);
    
    // Return the full API response so frontend can access all team data including ratings
    // Frontend will transform it as needed
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Versus Simulation] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

