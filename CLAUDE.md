# CLAUDE.md - AI Assistant Guide for Global Explorer (Smart Travel Planner)

## Project Overview

AI-based real-time travel planning SPA that uses Google Gemini API and Leaflet maps to recommend destinations, calculate optimal routes, and estimate costs. The UI is in **Korean (한글)**.

## Tech Stack

- **Framework**: React 19 (client-side SPA, no backend)
- **Language**: TypeScript 5.8 (target ES2022, ESNext modules)
- **Build**: Vite 6.2 (dev server on port 3000)
- **Styling**: Tailwind CSS (loaded via CDN in `index.html`)
- **Maps**: Leaflet 1.9 (loaded via CDN in `index.html`)
- **AI**: Google Gemini API (`@google/genai`) — models: `gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-image`, `gemini-3-pro-preview`
- **External deps loaded via import map** in `index.html` (React, ReactDOM, Gemini from esm.sh)

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 3000, host 0.0.0.0)
npm run build        # Production build via Vite
npm run preview      # Preview production build
```

No test runner, linter, or formatter is configured.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |

Set in `.env.local` at the project root. Vite loads it via `loadEnv()` in `vite.config.ts` and exposes it as `process.env.GEMINI_API_KEY`.

## Project Structure

```
/
├── App.tsx                  # Main app component (multi-step wizard, all UI state)
├── index.tsx                # React DOM entry point
├── index.html               # HTML template (CDN imports for Tailwind, Leaflet, React)
├── types.ts                 # TypeScript interfaces (TravelConfig, TravelOption, Recommendation, SelectedItem)
├── vite.config.ts           # Vite config (port, env, path aliases)
├── tsconfig.json            # TypeScript config (path alias: @/* → ./*)
├── package.json             # Dependencies and scripts
├── metadata.json            # AI Studio app metadata
├── components/
│   ├── MapView.tsx          # Leaflet map with custom colored markers per place type
│   └── PlaceCard.tsx        # Simple place card component
└── services/
    └── geminiService.ts     # All Gemini API integration (destinations, flights, places, images, chat)
```

## Architecture

### No Router — Step-Based Navigation

The app uses a `step` state variable in `App.tsx` for navigation (values: `1, 2, 2.5, 2.7, 3, 4, 5`). No React Router is used.

| Step | Purpose |
|---|---|
| 1 | Travel configuration (purpose, budget, dates, pax, accommodations) |
| 2 | Destination selection (5 AI-recommended options with generated images) |
| 2.5 | Flight booking |
| 2.7 | Rental car selection |
| 3 | Hotels & attractions selection |
| 4 | Restaurant selection |
| 5 | Final itinerary summary with booking links |

### State Management

Pure React hooks — no Redux, Zustand, or Context API. Key patterns:
- `useState` for all UI/data state
- `useRef` for map instances and chat scroll refs
- `useMemo` for derived calculations (budget spent, estimated total, current map places)
- `useEffect` for geolocation, date syncing, chat auto-scroll

### Gemini Service (`services/geminiService.ts`)

All AI interactions go through this service. Key functions:
- `getTravelOptions()` — 5 destination recommendations
- `getMappedPlaces()` — place recommendations by type (hotels, restaurants, attractions, golf, rentals)
- `getFlights()` — flight options
- `generateDestinationImage()` — AI-generated landmark images
- `startChat()` — AI concierge chat session

Each function constructs a prompt, calls the Gemini API, and parses the JSON response. Responses are parsed by extracting JSON from markdown code blocks (```` ```json ... ``` ````).

### Key Data Types (`types.ts`)

- **TravelConfig** — User input: purpose, duration, pax, budget, dates, per-night/per-person costs
- **TravelOption** — Destination recommendation with routes, places, activities, cost breakdown, coordinates
- **Recommendation** — Individual place (hotel/restaurant/attraction) with pricing, rating, coordinates, booking URL
- **SelectedItem** — Recommendation extended with `actualCost`

## Coding Conventions

- **All UI text is in Korean** — maintain Korean for user-facing strings
- **Single-file dominant pattern** — `App.tsx` contains nearly all UI and state logic (~600 lines)
- **Inline Tailwind classes** — styling is done with Tailwind utility classes directly on elements
- **No semicolons** — codebase does not consistently use semicolons (mixed usage)
- **Path alias** — `@/` maps to project root (configured in both `tsconfig.json` and `vite.config.ts`)
- **CDN-loaded libraries** — React, ReactDOM, Leaflet, and Tailwind are loaded via CDN/import maps in `index.html`, not bundled
- **Cost calculations** — different item types use different multipliers (per person, per night, per group, etc.)
- **Budget tracking** — real-time budget display with color-coded warnings (green/amber/red)

## Styling Patterns

- Tailwind CSS utility classes throughout
- Glassmorphism effects via custom `.glass` class in `index.html`
- Custom animations defined in `<style>`: `loading-bar`, `fade-in`, `slide-in`, `zoom-in`
- Color scheme: indigo (primary), slate, emerald, amber, orange, rose
- Inter font family from Google Fonts
- Print styles (`@media print`) hide interactive elements
- Custom scrollbar styling

## Important Notes

- **No backend** — purely client-side; all data comes from Gemini API calls
- **No database** — state is ephemeral (in-memory React state only)
- **No authentication** — API key is the only credential
- **No tests** — no testing framework is set up
- **No linting/formatting** — no ESLint or Prettier configuration
- **No CI/CD** — no GitHub Actions or other pipeline configs
- **Geolocation** — app requests browser geolocation for user's current position
- **Print/PDF** — the itinerary summary (step 5) supports `window.print()` for PDF export
