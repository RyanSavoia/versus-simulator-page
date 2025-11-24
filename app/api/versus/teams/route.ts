import { NextResponse } from 'next/server';

const VERSUS_API_BASE = 'https://www.versussportssimulator.com/api/v1';
const APP_ID = 'AU0MUED7RMIT8YSBKJPKNIQDJ7ZWIJHT';
const API_KEY = 'YS0FH0UPXDT7HP70JXJCMEHRHKR1GI7Q';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const frontendSport = searchParams.get('sport') || 'nfl';

    // Map frontend sport names to Versus API sport identifiers
    // Try multiple possible identifiers for college sports
    const sportMap: Record<string, string[]> = {
      'nfl': ['nfl'],
      'nba': ['nba'],
      'college-football': ['cfb', 'college-football', 'cf'],  // Try multiple variations
      'college-basketball': ['cbb', 'college-basketball', 'ncaab', 'cb'], // Try multiple variations
    };

    const possibleSports = sportMap[frontendSport] || [frontendSport];

    // Versus API uses path parameters: teams/:sport/:premium
    // Use 'true' for premium (all teams) or 'false' for freemium teams
    const premium = 'true'; // Set to 'false' for freemium access
    
    let response: Response | null = null;
    let lastError: string = '';
    let apiSport = '';

    // Try each possible sport identifier until one works
    for (const sport of possibleSports) {
      apiSport = sport;
      const endpoint = `${VERSUS_API_BASE}/teams/${apiSport}/${premium}`;
      console.log('[Versus Teams] Trying endpoint:', endpoint);

      response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'app-id': APP_ID,
          'api-key': API_KEY,
          'Content-Type': 'application/json',
          'cache-control': 'no-cache',
        },
      });

      console.log('[Versus Teams] Response status:', response.status, response.statusText);

      if (response.ok) {
        console.log('[Versus Teams] Success with sport identifier:', apiSport);
        break; // Success! Exit the loop
      }

      // If not OK, try to get error message
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          lastError = JSON.stringify(errorData);
        } catch {
          lastError = await response.text();
        }
      } else {
        // HTML error page - this endpoint doesn't exist
        lastError = `Endpoint not found (${response.status})`;
      }
      
      console.log(`[Versus Teams] Failed with ${apiSport}, trying next...`);
    }

    if (!response || !response.ok) {
      console.error('[Versus Teams] All sport identifiers failed. Last error:', lastError);
      throw new Error(`Versus API error: Could not find valid endpoint. Tried: ${possibleSports.join(', ')}. Last error: ${lastError}`);
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


