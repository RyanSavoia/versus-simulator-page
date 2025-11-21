import { NextResponse } from 'next/server';

const VERSUS_API_BASE = 'https://www.versussportssimulator.com/api/v1';
const APP_ID = 'AU0MUED7RMIT8YSBKJPKNIQDJ7ZWIJHT';
const API_KEY = 'YS0FH0UPXDT7HP70JXJCMEHRHKR1GI7Q';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get('sport') || 'nfl';

    // Versus API uses path parameters: teams/:sport/:premium
    // Use 'true' for premium (all teams) or 'false' for freemium teams
    const premium = 'true'; // Set to 'false' for freemium access
    const response = await fetch(`${VERSUS_API_BASE}/teams/${sport}/${premium}`, {
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
      console.error('[Versus Teams] API error:', response.status, errorText);
      throw new Error(`Versus API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Versus Teams] Success! Response:', data);
    
    // Transform response to match frontend expectations
    // API returns: { sport: "NFL", team: [{name: "..."}, ...] }
    // Frontend expects: [{id: "...", name: "...", abbreviation: "..."}, ...]
    const teams = (data.team || []).map((team: any, index: number) => ({
      id: team.name, // Use name as ID since API uses names
      name: team.name,
      abbreviation: team.abbreviation || team.name.substring(0, 3).toUpperCase(),
    }));
    
    return NextResponse.json(teams);
  } catch (error) {
    console.error('[Versus Teams] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}


