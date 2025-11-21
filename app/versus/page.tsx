'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import Spline to avoid SSR issues
const Spline = dynamic(
  () => import('@splinetool/react-spline').then((mod) => mod.default),
  { ssr: false }
);

type Sport = 'nfl' | 'nba' | 'college-football' | 'college-basketball';

interface Team {
  id: string;
  name: string;
  abbreviation?: string;
}

interface SimulationResult {
  away_score: number;
  home_score: number;
  spread: number;
  total: number;
  away_win_probability: number;
  home_win_probability: number;
}

// Helper function to round scores based on sport (from Versus logic)
const roundScore = (score: number, sport: string): number => {
  if (sport === 'cfb' || sport === 'nfl' || sport === 'college-football') {
    if (score <= 2) {
      return 0;
    } else if (score > 2 && score < 4.5) {
      return 3;
    } else if (score >= 4.5 && score < 6) {
      return 6;
    } else {
      return Math.round(score);
    }
  } else {
    return Math.round(score);
  }
};

// Helper function to calculate win probability based on score difference
// Uses a logistic function to convert point spread into win probability
const calculateWinProbability = (homeScore: number, awayScore: number, sport: string): { home: number; away: number } => {
  const spread = homeScore - awayScore;
  
  // Different scaling factors for different sports
  // Higher values = more sensitive to score differences
  let k = 0.12; // Default for most sports
  
  if (sport === 'nba' || sport === 'college-basketball') {
    k = 0.10; // Basketball: slightly less sensitive (higher scoring games)
  } else if (sport === 'nfl' || sport === 'cfb' || sport === 'college-football') {
    k = 0.15; // Football: more sensitive (lower scoring games)
  }
  
  // Logistic function: P(home wins) = 1 / (1 + exp(-k * spread))
  // This gives 50% when spread = 0, and approaches 100% as spread increases
  const homeWinProb = 1 / (1 + Math.exp(-k * spread));
  
  // Clamp to reasonable bounds (never exactly 0% or 100% unless spread is very large)
  const home = Math.max(0.001, Math.min(0.999, homeWinProb));
  const away = 1 - home;
  
  return { home, away };
};

export default function VersusPage() {
  console.log('VersusPage component rendering');
  
  const [sport, setSport] = useState<Sport>('nfl');
  const [awayTeam, setAwayTeam] = useState<Team | null>(null);
  const [homeTeam, setHomeTeam] = useState<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [showAwayDropdown, setShowAwayDropdown] = useState(false);
  const [showHomeDropdown, setShowHomeDropdown] = useState(false);
  const [showSportDropdown, setShowSportDropdown] = useState(false);
  const [awaySearch, setAwaySearch] = useState('');
  const [homeSearch, setHomeSearch] = useState('');
  const [splineInstance, setSplineInstance] = useState<any>(null);
  const [splineLoaded, setSplineLoaded] = useState(false);
  const [splineError, setSplineError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Ratings - will be loaded from simulation API
  const [awayOffensiveNumericGrade, setAwayOffensiveNumericGrade] = useState(75);
  const [awayDefensiveNumericGrade, setAwayDefensiveNumericGrade] = useState(75);
  const [homeOffensiveNumericGrade, setHomeOffensiveNumericGrade] = useState(75);
  const [homeDefensiveNumericGrade, setHomeDefensiveNumericGrade] = useState(75);

  // Track current offensive and defensive ratings using refs (like Versus DOM elements)
  // Use refs to avoid triggering re-renders when updating
  const currentAwayOffensiveRatingRef = useRef<number | null>(null);
  const currentAwayDefensiveRatingRef = useRef<number | null>(null);
  const currentHomeOffensiveRatingRef = useRef<number | null>(null);
  const currentHomeDefensiveRatingRef = useRef<number | null>(null);
  
  // Track original API scores to use as baseline
  const originalAwayScoreRef = useRef<number | null>(null);
  const originalHomeScoreRef = useRef<number | null>(null);
  
  // Original values from API (for slider calculations)
  const [originalRatings, setOriginalRatings] = useState<{
    awayOffensiveNumericGrade: number;
    awayOffensiveRating: number;
    awayDefensiveNumericGrade: number;
    awayDefensiveRating: number;
    homeOffensiveNumericGrade: number;
    homeOffensiveRating: number;
    homeDefensiveNumericGrade: number;
    homeDefensiveRating: number;
    offensiveRange: number;
    defensiveRange: number;
    homeFieldAdvantage: number;
  } | null>(null);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    console.log('useEffect triggered, fetching teams for sport:', sport);
    fetchTeams();
  }, [sport]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if click is outside dropdown containers
      if (
        !target.closest('[data-dropdown-container]') &&
        !target.closest('[data-team-button]')
      ) {
        if (showAwayDropdown || showHomeDropdown || showSportDropdown) {
          console.log('Click outside detected - closing dropdowns');
          setShowAwayDropdown(false);
          setShowHomeDropdown(false);
          setShowSportDropdown(false);
        }
      }
    };

    if (showAwayDropdown || showHomeDropdown || showSportDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showAwayDropdown, showHomeDropdown, showSportDropdown]);

  // Reset ratings when teams change (but don't auto-simulate)
  useEffect(() => {
    if (!awayTeam || !homeTeam) {
      setOriginalRatings(null);
      setSimulationResult(null);
      // Reset sliders to default when teams are cleared
      setAwayOffensiveNumericGrade(75);
      setAwayDefensiveNumericGrade(75);
      setHomeOffensiveNumericGrade(75);
      setHomeDefensiveNumericGrade(75);
    } else {
      // When teams change, reset ratings to force new API call
      // Don't reset sliders - they'll be updated with API values when simulation runs
      setOriginalRatings(null);
      setSimulationResult(null);
    }
  }, [awayTeam, homeTeam]);


  // Recalculate scores when sliders change - EXACT Versus logic
  useEffect(() => {
    if (!originalRatings || !simulationResult || !awayTeam || !homeTeam || !sport) return;

    const newRange = 99 - 60;
    const hfa = originalRatings.homeFieldAdvantage || 1.25;

    // Check which slider changed
    const awayOffChanged = awayOffensiveNumericGrade !== originalRatings.awayOffensiveNumericGrade;
    const awayDefChanged = awayDefensiveNumericGrade !== originalRatings.awayDefensiveNumericGrade;
    const homeOffChanged = homeOffensiveNumericGrade !== originalRatings.homeOffensiveNumericGrade;
    const homeDefChanged = homeDefensiveNumericGrade !== originalRatings.homeDefensiveNumericGrade;

    // Get original API scores (the "truth" from the API)
    const originalAwayScore = originalAwayScoreRef.current ?? simulationResult.away_score;
    const originalHomeScore = originalHomeScoreRef.current ?? simulationResult.home_score;

    // If no sliders changed, restore original API scores and return
    if (!awayOffChanged && !awayDefChanged && !homeOffChanged && !homeDefChanged) {
      if (simulationResult.away_score !== originalAwayScore || simulationResult.home_score !== originalHomeScore) {
        setSimulationResult({
          away_score: originalAwayScore,
          home_score: originalHomeScore,
          spread: originalHomeScore - originalAwayScore,
          total: originalAwayScore + originalHomeScore,
          away_win_probability: simulationResult.away_win_probability,
          home_win_probability: simulationResult.home_win_probability,
        });
      }
      return;
    }

    // Calculate current ratings from current slider values (like Versus reads from DOM)
    // Always calculate fresh from sliders to ensure we have the latest values
    const currentAwayOff = (awayOffensiveNumericGrade - originalRatings.awayOffensiveNumericGrade) * originalRatings.offensiveRange / newRange + originalRatings.awayOffensiveRating;
    const currentAwayDef = (awayDefensiveNumericGrade - originalRatings.awayDefensiveNumericGrade) * originalRatings.defensiveRange / newRange + originalRatings.awayDefensiveRating;
    const currentHomeOff = (homeOffensiveNumericGrade - originalRatings.homeOffensiveNumericGrade) * originalRatings.offensiveRange / newRange + originalRatings.homeOffensiveRating;
    const currentHomeDef = (homeDefensiveNumericGrade - originalRatings.homeDefensiveNumericGrade) * originalRatings.defensiveRange / newRange + originalRatings.homeDefensiveRating;

    // Round all current ratings
    const roundedAwayOff = Math.round(currentAwayOff * 100) / 100;
    const roundedAwayDef = Math.round(currentAwayDef * 100) / 100;
    const roundedHomeOff = Math.round(currentHomeOff * 100) / 100;
    const roundedHomeDef = Math.round(currentHomeDef * 100) / 100;

    // Update refs
    currentAwayOffensiveRatingRef.current = roundedAwayOff;
    currentAwayDefensiveRatingRef.current = roundedAwayDef;
    currentHomeOffensiveRatingRef.current = roundedHomeOff;
    currentHomeDefensiveRatingRef.current = roundedHomeDef;

    // Calculate what the score would be with ORIGINAL ratings (for delta calculation)
    const calculatedOriginalAway = originalRatings.awayOffensiveRating - originalRatings.homeDefensiveRating + hfa;
    const calculatedOriginalHome = originalRatings.homeOffensiveRating - originalRatings.awayDefensiveRating + hfa;
    
    // Start with original API scores - these are our baseline
    let awayScore = originalAwayScore;
    let homeScore = originalHomeScore;

    // Versus logic: Each slider change only affects ONE score
    // Calculate the new score using current ratings, but use the API score as baseline
    if (awayOffChanged) {
      // Team1 (away) offense changed: team1Score = newOffensiveRating - team2CurrentDefensiveRating + hfa
      // If slider is back to original, use original API score
      if (awayOffensiveNumericGrade === originalRatings.awayOffensiveNumericGrade) {
        awayScore = originalAwayScore;
      } else {
        const newCalculatedAway = roundedAwayOff - roundedHomeDef + hfa;
        const delta = newCalculatedAway - calculatedOriginalAway;
        awayScore = Math.max(0, roundScore(originalAwayScore + delta, sport));
      }
      // Keep home score unchanged
    }

    if (homeOffChanged) {
      // Team2 (home) offense changed: team2Score = newOffensiveRating - team1CurrentDefensiveRating + hfa
      // If slider is back to original, use original API score
      if (homeOffensiveNumericGrade === originalRatings.homeOffensiveNumericGrade) {
        homeScore = originalHomeScore;
      } else {
        const newCalculatedHome = roundedHomeOff - roundedAwayDef + hfa;
        const delta = newCalculatedHome - calculatedOriginalHome;
        homeScore = Math.max(0, roundScore(originalHomeScore + delta, sport));
      }
      // Keep away score unchanged
    }

    if (awayDefChanged) {
      // Team1 (away) defense changed: team2Score = team2CurrentOffensiveRating - newDefensiveRating + hfa
      // If slider is back to original, use original API score
      if (awayDefensiveNumericGrade === originalRatings.awayDefensiveNumericGrade) {
        homeScore = originalHomeScore;
      } else {
        const newCalculatedHome = roundedHomeOff - roundedAwayDef + hfa;
        const delta = newCalculatedHome - calculatedOriginalHome;
        homeScore = Math.max(0, roundScore(originalHomeScore + delta, sport));
      }
      // Keep away score unchanged
    }

    if (homeDefChanged) {
      // Team2 (home) defense changed: team1Score = team1CurrentOffensiveRating - newDefensiveRating + hfa
      // If slider is back to original, use original API score
      if (homeDefensiveNumericGrade === originalRatings.homeDefensiveNumericGrade) {
        awayScore = originalAwayScore;
      } else {
        const newCalculatedAway = roundedAwayOff - roundedHomeDef + hfa;
        const delta = newCalculatedAway - calculatedOriginalAway;
        awayScore = Math.max(0, roundScore(originalAwayScore + delta, sport));
      }
      // Keep home score unchanged
    }

    // Calculate spread and total
    const spread = homeScore - awayScore;
    const total = awayScore + homeScore;

    // Calculate win probabilities
    let k = 0.13;
    if (sport === 'nba' || sport === 'college-basketball') {
      k = 0.13;
    } else if (sport === 'nfl' || sport === 'college-football') {
      k = 0.15;
    }
    const homeWinProb = 1 / (1 + Math.exp(-k * spread));
    const home = Math.max(0.001, Math.min(0.999, homeWinProb));
    const away = 1 - home;

    // Only update if scores changed
    if (awayScore !== simulationResult.away_score || homeScore !== simulationResult.home_score) {
      setSimulationResult({
        away_score: awayScore,
        home_score: homeScore,
        spread: spread,
        total: total,
        away_win_probability: away,
        home_win_probability: home,
      });
    }
  }, [awayOffensiveNumericGrade, awayDefensiveNumericGrade, homeOffensiveNumericGrade, homeDefensiveNumericGrade, originalRatings, awayTeam, homeTeam, sport]);

  // Don't auto-recalculate - only recalculate when Run Simulation is clicked

  const fetchTeams = async () => {
    setLoadingTeams(true);
    try {
      console.log('Fetching teams for sport:', sport);
      const response = await fetch(`/api/versus/teams?sport=${sport}`);
      console.log('Teams response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Teams API error:', errorText);
        throw new Error(`Failed to fetch teams: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Teams API response:', data);
      
      // API route now returns an array directly
      const teamsList = Array.isArray(data) ? data : [];
      console.log('Processed teams list:', teamsList);
      
      if (teamsList.length === 0) {
        console.warn('No teams found in response');
      }
      
      setTeams(teamsList);
      setAwayTeam(null);
      setHomeTeam(null);
      setSimulationResult(null);
    } catch (error) {
      console.error('Error fetching teams:', error);
      alert(`Error loading teams: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingTeams(false);
    }
  };

  const runSimulation = async () => {
    if (!awayTeam || !homeTeam) {
      alert('Please select both away and home teams');
      return;
    }

    // If we already have originalRatings (from a previous simulation), 
    // the useEffect will automatically recalculate scores when sliders change
    // No need to manually recalculate here - just return
    if (originalRatings) {
      return;
    }

    // First time simulation - call the API to get initial ratings
    setLoading(true);
    try {
      console.log('Running initial simulation with:', {
        sport,
        awayTeamId: awayTeam.id,
        homeTeamId: homeTeam.id,
      });

      const response = await fetch('/api/versus/simulation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sport,
          awayTeamId: awayTeam.id,
          homeTeamId: homeTeam.id,
        }),
      });

      console.log('Simulation response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Simulation API error:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        throw new Error(errorData.error || `Simulation failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Simulation result:', data);
      
      // Transform the API response to match the expected frontend format
      // API returns: { team: [{name, score, winProbability, venue, ...}, ...], outcome: {pointSpread, totalPoints, winProbability} }
      const teams = data.team || [];
      
      // Match teams by name to ensure we get the correct team data
      // The API might return teams in a different order than we expect
      const awayTeamData = teams.find((t: any) => 
        t.name === awayTeam.name || 
        t.name?.toLowerCase() === awayTeam.name?.toLowerCase() ||
        t.abbreviation === awayTeam.abbreviation ||
        t.abbreviation?.toLowerCase() === awayTeam.abbreviation?.toLowerCase()
      ) || teams.find((t: any) => t.venue === 'Away') || teams[0];
      
      const homeTeamData = teams.find((t: any) => 
        t.name === homeTeam.name || 
        t.name?.toLowerCase() === homeTeam.name?.toLowerCase() ||
        t.abbreviation === homeTeam.abbreviation ||
        t.abbreviation?.toLowerCase() === homeTeam.abbreviation?.toLowerCase()
      ) || teams.find((t: any) => t.venue === 'Home') || teams[1];
      
      console.log('Team matching:', {
        selectedAway: awayTeam.name,
        selectedHome: homeTeam.name,
        apiAway: awayTeamData?.name,
        apiHome: homeTeamData?.name,
        apiAwayVenue: awayTeamData?.venue,
        apiHomeVenue: homeTeamData?.venue,
        apiAwayAbbr: awayTeamData?.abbreviation,
        apiHomeAbbr: homeTeamData?.abbreviation,
        allTeams: teams.map((t: any) => ({ name: t.name, venue: t.venue, abbreviation: t.abbreviation })),
      });
      
      const outcome = data.outcome || {};
      
      const transformed = {
        away_score: awayTeamData?.score || 0,
        home_score: homeTeamData?.score || 0,
        spread: outcome.pointSpread || 0,
        total: outcome.totalPoints || 0,
        away_win_probability: (awayTeamData?.winProbability || 0) / 100,
        home_win_probability: (homeTeamData?.winProbability || 0) / 100,
      };
      
      setSimulationResult(transformed);
      
      // Store original API scores in refs
      originalAwayScoreRef.current = transformed.away_score;
      originalHomeScoreRef.current = transformed.home_score;
      
      console.log('Stored original API scores:', {
        awayScore: transformed.away_score,
        homeScore: transformed.home_score,
        awayScoreRef: originalAwayScoreRef.current,
        homeScoreRef: originalHomeScoreRef.current,
      });
      
      // Update original ratings from simulation response
      if (data.team && Array.isArray(data.team) && data.team.length >= 2) {
        const apiAwayOffGrade = awayTeamData.offensiveNumericGrade || 75;
        const apiAwayDefGrade = awayTeamData.defensiveNumericGrade || 75;
        const apiHomeOffGrade = homeTeamData.offensiveNumericGrade || 75;
        const apiHomeDefGrade = homeTeamData.defensiveNumericGrade || 75;

        console.log('Storing original ratings:', {
          selectedAway: awayTeam.name,
          selectedHome: homeTeam.name,
          apiAwayName: awayTeamData?.name,
          apiHomeName: homeTeamData?.name,
          apiAwayOffGrade,
          apiHomeOffGrade,
          apiAwayOffRating: awayTeamData.offensiveRating,
          apiHomeOffRating: homeTeamData.offensiveRating,
        });

        // Check if this is a new team selection (originalRatings was null before this call)
        const isNewTeamSelection = !originalRatings;

        const ratings = {
          awayOffensiveNumericGrade: apiAwayOffGrade,
          awayOffensiveRating: awayTeamData.offensiveRating || 0,
          awayDefensiveNumericGrade: apiAwayDefGrade,
          awayDefensiveRating: awayTeamData.defensiveRating || 0,
          homeOffensiveNumericGrade: apiHomeOffGrade,
          homeOffensiveRating: homeTeamData.offensiveRating || 0,
          homeDefensiveNumericGrade: apiHomeDefGrade,
          homeDefensiveRating: homeTeamData.defensiveRating || 0,
          offensiveRange: data.offensiveRange || 20,
          defensiveRange: data.defensiveRange || 20,
          homeFieldAdvantage: homeTeamData.homeFieldAdvantage || 1.25,
        };
        setOriginalRatings(ratings);
        
        // Initialize current ratings from API (like Versus initializes DOM elements)
        currentAwayOffensiveRatingRef.current = awayTeamData.offensiveRating || 0;
        currentAwayDefensiveRatingRef.current = awayTeamData.defensiveRating || 0;
        currentHomeOffensiveRatingRef.current = homeTeamData.offensiveRating || 0;
        currentHomeDefensiveRatingRef.current = homeTeamData.defensiveRating || 0;
        
        // Always update slider values with API values when new teams are selected
        // This ensures sliders show accurate ratings for the new teams
        if (isNewTeamSelection) {
          // New teams - always update with API values
          setAwayOffensiveNumericGrade(apiAwayOffGrade);
          setAwayDefensiveNumericGrade(apiAwayDefGrade);
          setHomeOffensiveNumericGrade(apiHomeOffGrade);
          setHomeDefensiveNumericGrade(apiHomeDefGrade);
        } else {
          // Re-simulation with same teams - preserve user adjustments if they changed from default
          if (awayOffensiveNumericGrade === 75) {
            setAwayOffensiveNumericGrade(apiAwayOffGrade);
          }
          if (awayDefensiveNumericGrade === 75) {
            setAwayDefensiveNumericGrade(apiAwayDefGrade);
          }
          if (homeOffensiveNumericGrade === 75) {
            setHomeOffensiveNumericGrade(apiHomeOffGrade);
          }
          if (homeDefensiveNumericGrade === 75) {
            setHomeDefensiveNumericGrade(apiHomeDefGrade);
          }
        }
      }
    } catch (error) {
      console.error('Simulation error:', error);
      alert(error instanceof Error ? error.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredAwayTeams = teams.filter((team) =>
    team.name.toLowerCase().includes(awaySearch.toLowerCase()) ||
    team.abbreviation?.toLowerCase().includes(awaySearch.toLowerCase())
  );

  const filteredHomeTeams = teams.filter((team) =>
    team.name.toLowerCase().includes(homeSearch.toLowerCase()) ||
    team.abbreviation?.toLowerCase().includes(homeSearch.toLowerCase())
  );

  const sportLabels: Record<Sport, string> = {
    nfl: 'NFL',
    nba: 'NBA',
    'college-football': 'College Football',
    'college-basketball': 'College Basketball',
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'rgb(16, 21, 26)', pointerEvents: 'auto' }}>
      {/* Spline Background */}
      <div 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'auto' }}
        onMouseMove={(e) => {
          if (splineInstance) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
            const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
            try {
              // Spline interaction - try different methods to find and move objects
              if (splineInstance.findObjectByName) {
                // Try common object names
                const objectNames = ['Sphere', 'ParticleSphere', 'Particle', 'Group', 'Object'];
                for (const name of objectNames) {
                  const obj = splineInstance.findObjectByName(name);
                  if (obj) {
                    // Apply very exaggerated movement based on mouse position
                    if (obj.position) {
                      obj.position.x = x * 2.5;
                      obj.position.y = -y * 2.5;
                    }
                    // Add strong rotation for very pronounced effect
                    if (obj.rotation) {
                      obj.rotation.y = x * 1.2;
                      obj.rotation.x = y * 1.2;
                    }
                    // Add scale effect for even more exaggeration
                    if (obj.scale) {
                      const distance = Math.sqrt(x * x + y * y);
                      const scale = 1 + distance * 0.3;
                      obj.scale.x = scale;
                      obj.scale.y = scale;
                      obj.scale.z = scale;
                    }
                    break;
                  }
                }
              }
              // Alternative: try accessing objects through scene
              if (splineInstance.scene && splineInstance.scene.children) {
                const findAndMove = (children: any[]) => {
                  for (const child of children) {
                    if (child.name && (child.name.toLowerCase().includes('sphere') || child.name.toLowerCase().includes('particle'))) {
                      if (child.position) {
                        child.position.x = x * 2.5;
                        child.position.y = -y * 2.5;
                      }
                      // Add strong rotation
                      if (child.rotation) {
                        child.rotation.y = x * 1.2;
                        child.rotation.x = y * 1.2;
                      }
                      // Add scale effect
                      if (child.scale) {
                        const distance = Math.sqrt(x * x + y * y);
                        const scale = 1 + distance * 0.3;
                        child.scale.x = scale;
                        child.scale.y = scale;
                        child.scale.z = scale;
                      }
                    }
                    if (child.children) {
                      findAndMove(child.children);
                    }
                  }
                };
                findAndMove(splineInstance.scene.children);
              }
            } catch (err) {
              // Silently fail if interaction doesn't work
            }
          }
        }}
        onMouseLeave={() => {
          // Reset position when mouse leaves
          if (splineInstance) {
            try {
              if (splineInstance.findObjectByName) {
                const objectNames = ['Sphere', 'ParticleSphere', 'Particle', 'Group', 'Object'];
                for (const name of objectNames) {
                  const obj = splineInstance.findObjectByName(name);
                  if (obj) {
                    if (obj.position) {
                      obj.position.x = 0;
                      obj.position.y = 0;
                    }
                    if (obj.rotation) {
                      obj.rotation.y = 0;
                      obj.rotation.x = 0;
                    }
                    if (obj.scale) {
                      obj.scale.x = 1;
                      obj.scale.y = 1;
                      obj.scale.z = 1;
                    }
                    break;
                  }
                }
              }
              if (splineInstance.scene && splineInstance.scene.children) {
                const resetObjects = (children: any[]) => {
                  for (const child of children) {
                    if (child.name && (child.name.toLowerCase().includes('sphere') || child.name.toLowerCase().includes('particle'))) {
                      if (child.position) {
                        child.position.x = 0;
                        child.position.y = 0;
                      }
                      if (child.rotation) {
                        child.rotation.y = 0;
                        child.rotation.x = 0;
                      }
                      if (child.scale) {
                        child.scale.x = 1;
                        child.scale.y = 1;
                        child.scale.z = 1;
                      }
                    }
                    if (child.children) {
                      resetObjects(child.children);
                    }
                  }
                };
                resetObjects(splineInstance.scene.children);
              }
            } catch (err) {
              // Silently fail
            }
          }
        }}
      >
        <Spline 
          scene="https://prod.spline.design/I9cBnG1M2TY0k9XG/scene.splinecode"
          onLoad={(spline: any) => {
            console.log('Spline loaded successfully', spline);
            setSplineLoaded(true);
            setSplineInstance(spline);
          }}
          onError={(error: any) => {
            console.error('Spline loading error:', error);
            setSplineError(true);
          }}
        />
      </div>

      {/* Content Overlay */}
      <div style={{ 
        position: 'relative', 
        zIndex: 1000, 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        pointerEvents: 'auto',
      }}>
        {/* Header - Fixed at top */}
        <div style={{
          position: 'absolute',
          top: isMobile ? '20px' : '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: isMobile ? 'calc(100% - 40px)' : 'auto',
          padding: isMobile ? '12px 20px' : '20px 40px',
          zIndex: 1001,
          background: 'rgba(255, 255, 255, 0.05)',
          boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(3px)',
          borderRadius: '999px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isMobile ? '2px' : '4px',
        }}>
          <h1 style={{
            fontSize: isMobile ? '18px' : '28px',
            fontWeight: '300',
            margin: 0,
            textAlign: 'center',
            color: '#ffffff',
            fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
            letterSpacing: isMobile ? '0.5px' : '1px',
            textTransform: 'uppercase',
          }}>
            Game Simulations
          </h1>
          <div style={{
            fontSize: isMobile ? '8px' : '10px',
            fontWeight: '300',
            color: 'rgba(255, 255, 255, 0.6)',
            fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}>
            Powered by{' '}
            <a
              href="https://www.versussportssimulator.com/NFL/simulations"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'rgba(255, 255, 255, 0.8)',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 1)';
                e.currentTarget.style.textDecoration = 'underline';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                e.currentTarget.style.textDecoration = 'none';
              }}
            >
              Versus Sports Simulator
            </a>
          </div>
        </div>

        {/* Main Content - Centered */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: isMobile ? '80px' : '100px',
          padding: isMobile ? '0 16px' : '0',
        }}>

        {/* Sport, Away, Home Selection - Horizontal Pills */}
        <div style={{
          display: 'flex',
          gap: isMobile ? '8px' : '16px',
          marginBottom: isMobile ? '24px' : '40px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          width: isMobile ? '100%' : 'auto',
        }}>
          {/* Sport Selection */}
          <div style={{ position: 'relative', zIndex: 1001 }} data-dropdown-container>
            <button
              type="button"
              data-team-button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Sport button clicked');
                setShowSportDropdown(!showSportDropdown);
                setShowAwayDropdown(false);
                setShowHomeDropdown(false);
              }}
              style={{
                padding: isMobile ? '12px 20px' : '14px 28px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.05)',
                boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(3px)',
                border: 'none',
                color: '#ffffff',
                fontSize: isMobile ? '12px' : '14px',
                fontWeight: '400',
                fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                pointerEvents: 'auto',
                position: 'relative',
                zIndex: 1001,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                minWidth: isMobile ? '100px' : '150px',
                width: isMobile ? 'calc(33.33% - 6px)' : 'auto',
                touchAction: 'manipulation',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
            >
              {sportLabels[sport]}
            </button>

            {showSportDropdown && (
              <div 
                data-dropdown-container
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 2px)',
                  left: 0,
                  background: 'rgba(255, 255, 255, 0.05)',
                  boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
                  backdropFilter: 'blur(3px)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px',
                  minWidth: isMobile ? '100%' : '150px',
                  width: isMobile ? '100%' : 'auto',
                  zIndex: 1003,
                  pointerEvents: 'auto',
                }}>
                {(['nfl', 'nba', 'college-football', 'college-basketball'] as Sport[]).map((sportOption) => (
                  <div
                    key={sportOption}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Sport selected:', sportOption);
                      setSport(sportOption);
                      setShowSportDropdown(false);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '999px',
                      cursor: 'pointer',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: '400',
                      fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
                      marginBottom: '4px',
                      transition: 'all 0.2s ease',
                      background: sport === sportOption ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      position: 'relative',
                      zIndex: 1004,
                      pointerEvents: 'auto',
                    }}
                    onMouseEnter={(e) => {
                      if (sport !== sportOption) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (sport !== sportOption) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    {sportLabels[sportOption]}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Away Team Selection */}
          <div style={{ position: 'relative', zIndex: 1001, width: isMobile ? '100%' : 'auto' }} data-dropdown-container>
            <button
              type="button"
              data-team-button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Away team button clicked');
                setShowAwayDropdown(!showAwayDropdown);
                setShowHomeDropdown(false);
              }}
              style={{
                padding: isMobile ? '12px 16px' : '14px 28px',
                borderRadius: '999px',
                background: awayTeam
                  ? 'rgba(255, 255, 255, 0.2)'
                  : 'rgba(255, 255, 255, 0.05)',
                boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(3px)',
                border: 'none',
                color: '#ffffff',
                fontSize: isMobile ? '11px' : '14px',
                fontWeight: '400',
                fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: isMobile ? '0' : '150px',
                width: isMobile ? '100%' : 'auto',
                pointerEvents: 'auto',
                position: 'relative',
                zIndex: 1001,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                touchAction: 'manipulation',
              }}
              onMouseEnter={(e) => {
                if (!awayTeam) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }
              }}
              onMouseLeave={(e) => {
                if (!awayTeam) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }
              }}
            >
              {awayTeam ? awayTeam.name : 'Away Team'}
            </button>

            {showAwayDropdown && (
              <div 
                data-dropdown-container
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                position: 'absolute',
                ...(simulationResult ? {
                  top: 'calc(100% + 2px)',
                  bottom: 'auto',
                } : {
                  bottom: 'calc(100% + 2px)',
                  top: 'auto',
                }),
                left: 0,
                right: isMobile ? 0 : 'auto',
                background: 'rgba(255, 255, 255, 0.05)',
                boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(3px)',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                minWidth: isMobile ? '100%' : '250px',
                maxWidth: isMobile ? '100%' : 'none',
                maxHeight: isMobile ? '300px' : '200px',
                overflow: 'auto',
                zIndex: 1003,
                pointerEvents: 'auto',
              }}>
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={awaySearch}
                  onChange={(e) => setAwaySearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    marginBottom: '8px',
                    fontSize: '14px',
                  }}
                  autoFocus
                />
                {loadingTeams ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#ffffff' }}>Loading...</div>
                ) : filteredAwayTeams.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#ffffff' }}>
                    {teams.length === 0 ? 'No teams found. Check console for errors.' : 'No teams match your search.'}
                  </div>
                ) : (
                  filteredAwayTeams.map((team) => (
                    <div
                      key={team.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Away team selected:', team.name);
                        setAwayTeam(team);
                        setShowAwayDropdown(false);
                        setAwaySearch('');
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: '#ffffff',
                        marginBottom: '4px',
                        transition: 'all 0.2s ease',
                        background: awayTeam?.id === team.id ? 'rgba(102, 126, 234, 0.3)' : 'transparent',
                        position: 'relative',
                        zIndex: 1004,
                        pointerEvents: 'auto',
                      }}
                      onMouseEnter={(e) => {
                        if (awayTeam?.id !== team.id) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (awayTeam?.id !== team.id) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {team.name} {team.abbreviation && `(${team.abbreviation})`}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Home Team Selection */}
          <div style={{ position: 'relative', zIndex: 1001, width: isMobile ? '100%' : 'auto' }} data-dropdown-container>
            <button
              type="button"
              data-team-button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Home team button clicked');
                setShowHomeDropdown(!showHomeDropdown);
                setShowAwayDropdown(false);
              }}
              style={{
                padding: isMobile ? '12px 16px' : '14px 28px',
                borderRadius: '999px',
                background: homeTeam
                  ? 'rgba(255, 255, 255, 0.2)'
                  : 'rgba(255, 255, 255, 0.05)',
                boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(3px)',
                border: 'none',
                color: '#ffffff',
                fontSize: isMobile ? '11px' : '14px',
                fontWeight: '400',
                fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: isMobile ? '0' : '150px',
                width: isMobile ? '100%' : 'auto',
                pointerEvents: 'auto',
                position: 'relative',
                zIndex: 1001,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                touchAction: 'manipulation',
              }}
              onMouseEnter={(e) => {
                if (!homeTeam) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }
              }}
              onMouseLeave={(e) => {
                if (!homeTeam) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }
              }}
            >
              {homeTeam ? homeTeam.name : 'Home Team'}
            </button>

            {showHomeDropdown && (
              <div 
                data-dropdown-container
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                position: 'absolute',
                ...(simulationResult ? {
                  top: 'calc(100% + 2px)',
                  bottom: 'auto',
                } : {
                  bottom: 'calc(100% + 2px)',
                  top: 'auto',
                }),
                left: 0,
                right: isMobile ? 0 : 'auto',
                background: 'rgba(255, 255, 255, 0.05)',
                boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(3px)',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                minWidth: isMobile ? '100%' : '250px',
                maxWidth: isMobile ? '100%' : 'none',
                maxHeight: isMobile ? '300px' : '200px',
                overflow: 'auto',
                zIndex: 1003,
                pointerEvents: 'auto',
              }}>
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={homeSearch}
                  onChange={(e) => setHomeSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    marginBottom: '8px',
                    fontSize: '14px',
                  }}
                  autoFocus
                />
                {loadingTeams ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#ffffff' }}>Loading...</div>
                ) : filteredHomeTeams.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#ffffff' }}>
                    {teams.length === 0 ? 'No teams found. Check console for errors.' : 'No teams match your search.'}
                  </div>
                ) : (
                  filteredHomeTeams.map((team) => (
                    <div
                      key={team.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Home team selected:', team.name);
                        setHomeTeam(team);
                        setShowHomeDropdown(false);
                        setHomeSearch('');
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: '#ffffff',
                        marginBottom: '4px',
                        transition: 'all 0.2s ease',
                        background: homeTeam?.id === team.id ? 'rgba(102, 126, 234, 0.3)' : 'transparent',
                        position: 'relative',
                        zIndex: 1004,
                        pointerEvents: 'auto',
                      }}
                      onMouseEnter={(e) => {
                        if (homeTeam?.id !== team.id) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (homeTeam?.id !== team.id) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {team.name} {team.abbreviation && `(${team.abbreviation})`}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Simulation Results - Above Center */}
        {simulationResult && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? '12px' : '16px',
            marginBottom: isMobile ? '24px' : '40px',
            alignItems: 'center',
            width: isMobile ? '100%' : 'auto',
            padding: isMobile ? '0 8px' : '0',
          }}>
            {/* Score - Bold at Top */}
            <div style={{
              fontSize: isMobile ? '28px' : '42px',
              fontWeight: '300',
              color: '#ffffff',
              fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
              padding: isMobile ? '16px 24px' : '24px 48px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.05)',
              boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(3px)',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: isMobile ? '6px' : '8px',
              transition: 'all 0.3s ease',
              width: isMobile ? '100%' : 'auto',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '16px', flexWrap: isMobile ? 'wrap' : 'nowrap', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: isMobile ? '10px' : '12px' }}>{awayTeam?.abbreviation || 'AWAY'}</div>
                  <div style={{ fontSize: isMobile ? '8px' : '12px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: '300', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '1px' }}>Away</div>
                </div>
                <div>{simulationResult.away_score} - {simulationResult.home_score}</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: isMobile ? '10px' : '12px' }}>{homeTeam?.abbreviation || 'HOME'}</div>
                  <div style={{ fontSize: isMobile ? '8px' : '12px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: '300', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '1px' }}>Home</div>
                </div>
              </div>
            </div>

            {/* Spread, Total, Win % - Pills */}
            <div style={{
              display: 'flex',
              gap: isMobile ? '8px' : '16px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              width: isMobile ? '100%' : 'auto',
            }}>
              <div style={{
                padding: isMobile ? '12px 16px' : '16px 24px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.05)',
                boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(3px)',
                border: 'none',
                transition: 'all 0.2s ease',
                flex: isMobile ? '1' : 'none',
                minWidth: isMobile ? 'calc(33.33% - 6px)' : 'auto',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}>
                <div style={{ fontSize: isMobile ? '9px' : '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '1px' }}>Spread</div>
                <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '300', color: '#ffffff', fontFamily: "'Helvetica Neue', 'Arial', sans-serif" }}>
                  {simulationResult.spread > 0 ? '+' : ''}{simulationResult.spread.toFixed(1)}
                </div>
              </div>

              <div style={{
                padding: isMobile ? '12px 16px' : '16px 24px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.05)',
                boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(3px)',
                border: 'none',
                transition: 'all 0.2s ease',
                flex: isMobile ? '1' : 'none',
                minWidth: isMobile ? 'calc(33.33% - 6px)' : 'auto',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}>
                <div style={{ fontSize: isMobile ? '9px' : '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '1px' }}>Total</div>
                <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '300', color: '#ffffff', fontFamily: "'Helvetica Neue', 'Arial', sans-serif" }}>
                  {simulationResult.total.toFixed(1)}
                </div>
              </div>

              <div style={{
                padding: isMobile ? '12px 16px' : '16px 24px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.05)',
                boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(3px)',
                border: 'none',
                transition: 'all 0.2s ease',
                flex: isMobile ? '1' : 'none',
                minWidth: isMobile ? 'calc(33.33% - 6px)' : 'auto',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}>
                <div style={{ fontSize: isMobile ? '9px' : '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '1px' }}>Home Win %</div>
                <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '300', color: '#ffffff', fontFamily: "'Helvetica Neue', 'Arial', sans-serif" }}>
                  {(simulationResult.home_win_probability * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Run Simulation Button - Big Green Button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Run simulation button clicked');
            runSimulation();
          }}
          disabled={loading || !awayTeam || !homeTeam}
          style={{
            padding: isMobile ? '18px 32px' : '16px 48px',
            borderRadius: '999px',
            background: loading || !awayTeam || !homeTeam
              ? 'rgba(255, 255, 255, 0.05)'
              : 'rgba(255, 255, 255, 0.1)',
            boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(3px)',
            border: 'none',
            color: '#ffffff',
            fontSize: isMobile ? '13px' : '14px',
            fontWeight: '400',
            fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
            cursor: loading || !awayTeam || !homeTeam ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: isMobile ? '24px' : '40px',
            pointerEvents: 'auto',
            position: 'relative',
            zIndex: 1001,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            width: isMobile ? 'calc(100% - 32px)' : 'auto',
            touchAction: 'manipulation',
            minHeight: isMobile ? '48px' : 'auto',
          }}
          onMouseEnter={(e) => {
            if (!loading && awayTeam && homeTeam) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading && awayTeam && homeTeam) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }
          }}
        >
          {loading ? 'Running Simulation...' : 'Run Simulation'}
        </button>

        </div>

        {/* Right Side - Sliders Section - Positioned Absolutely - Only show after first simulation */}
        {(awayTeam && homeTeam && originalRatings) && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? '16px' : '20px',
            width: isMobile ? 'calc(100% - 32px)' : '240px',
            padding: isMobile ? '16px' : '16px 20px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            boxShadow: '5px 5px 30px rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(3px)',
            border: 'none',
            fontSize: isMobile ? '11px' : '12px',
            position: isMobile ? 'relative' : 'fixed',
            top: isMobile ? 'auto' : '120px',
            right: isMobile ? 'auto' : '20px',
            left: isMobile ? '16px' : 'auto',
            marginTop: isMobile ? '24px' : '0',
            marginBottom: isMobile ? '24px' : '0',
            maxHeight: isMobile ? 'none' : 'calc(100vh - 160px)',
            overflowY: 'auto',
            zIndex: 1001,
          }}>
            {/* Away Team Ratings */}
            {awayTeam && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: '400', color: '#ffffff', marginBottom: '8px', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {awayTeam.name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <span>Off</span>
                      <span>{Math.round(awayOffensiveNumericGrade)}</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="99"
                      value={awayOffensiveNumericGrade}
                      onChange={(e) => {
                        const newGrade = Number(e.target.value);
                        setAwayOffensiveNumericGrade(newGrade);
                      }}
                      style={{
                        width: '100%',
                        height: '4px',
                        borderRadius: '999px',
                        background: 'linear-gradient(to right, #667eea, #764ba2)',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <span>Def</span>
                      <span>{Math.round(awayDefensiveNumericGrade)}</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="99"
                      value={awayDefensiveNumericGrade}
                      onChange={(e) => {
                        const newGrade = Number(e.target.value);
                        setAwayDefensiveNumericGrade(newGrade);
                      }}
                      style={{
                        width: '100%',
                        height: '4px',
                        borderRadius: '999px',
                        background: 'linear-gradient(to right, #f093fb, #f5576c)',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Home Team Ratings */}
            {homeTeam && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: '400', color: '#ffffff', marginBottom: '8px', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {homeTeam.name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <span>Off</span>
                      <span>{Math.round(homeOffensiveNumericGrade)}</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="99"
                      value={homeOffensiveNumericGrade}
                      onChange={(e) => {
                        const newGrade = Number(e.target.value);
                        setHomeOffensiveNumericGrade(newGrade);
                      }}
                      style={{
                        width: '100%',
                        height: '4px',
                        borderRadius: '999px',
                        background: 'linear-gradient(to right, #30cfd0, #330867)',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', fontFamily: "'Helvetica Neue', 'Arial', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <span>Def</span>
                      <span>{Math.round(homeDefensiveNumericGrade)}</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="99"
                      value={homeDefensiveNumericGrade}
                      onChange={(e) => {
                        const newGrade = Number(e.target.value);
                        setHomeDefensiveNumericGrade(newGrade);
                      }}
                      style={{
                        width: '100%',
                        height: '4px',
                        borderRadius: '999px',
                        background: 'linear-gradient(to right, #fa709a, #fee140)',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Click outside to close dropdowns - Using useEffect instead of overlay */}
    </div>
  );
}

