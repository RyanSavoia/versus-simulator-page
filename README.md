# Versus Sports Simulator

A modern web application for running sports game simulations powered by the Versus Sports Simulator API.

## Features

- 🏈 **Multi-Sport Support**: NFL, NBA, College Football, and College Basketball
- 🎯 **Real-time Simulations**: Get instant game predictions with scores, spreads, and win probabilities
- 🎚️ **Interactive Rating Adjustments**: Fine-tune team offensive and defensive ratings with sliders
- 📱 **Mobile Optimized**: Fully responsive design for all device sizes
- 🎨 **Modern UI**: Beautiful glassmorphic design with 3D Spline background

## Tech Stack

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Spline** - 3D interactive backgrounds
- **Versus Sports Simulator API** - Game simulation data

## Getting Started

### Prerequisites

- Node.js 20+ installed
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/versus-simulator-page.git
cd versus-simulator-page
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3005](http://localhost:3005) in your browser

## Usage

1. Select a sport from the dropdown (NFL, NBA, College Football, or College Basketball)
2. Choose an Away team and Home team
3. Click "Run Simulation" to get game predictions
4. Adjust team ratings using the sliders to see how changes affect the outcome
5. View updated scores, spreads, totals, and win probabilities in real-time

## Project Structure

```
app/
├── api/
│   └── versus/          # API routes for Versus Sports Simulator
│       ├── simulation/  # Game simulation endpoint
│       ├── teams/       # Team listing endpoint
│       └── team/        # Individual team data endpoint
├── versus/
│   └── page.tsx         # Main simulator interface
└── layout.tsx           # Root layout component
```

## Development

### Available Scripts

- `npm run dev` - Start development server on port 3005
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## License

This project is for personal/educational use.

## Acknowledgments

- Powered by [Versus Sports Simulator](https://www.versussportssimulator.com/NFL/simulations)

