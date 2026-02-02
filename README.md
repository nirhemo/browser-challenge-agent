# Browser Navigation Challenge Agent

An automated agent that solves the 30-step Browser Navigation Challenge.

## Overview

This agent uses Playwright to automate browser interactions and solve various challenge types including:
- Closing popup modals (with fake X buttons)
- Scrolling to reveal content
- Clicking reveal/code buttons
- Selecting correct radio button options
- Handling hover interactions
- Drag and drop challenges
- Extracting and submitting 6-character codes (alphanumeric)

## Requirements

- Node.js 18+
- npm

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

## Usage

```bash
# Run the agent
npm start

# Or directly
node agent.js
```

## How It Works

1. **Navigation**: Opens the challenge URL and clicks START
2. **Popup Handling**: Dismisses popups using real close buttons (Dismiss, Close, Accept) - not fake X buttons
3. **Challenge Detection**: Identifies the current step and challenge type
4. **Challenge Solving**: 
   - Scrolls to reveal hidden content
   - Clicks "Code Revealed" type buttons
   - Handles radio button modals by selecting "correct" options
   - Triggers hover events on hover-sensitive elements
5. **Code Extraction**: Finds 6-character alphanumeric codes (e.g., KKKKKK, 4ULC4U)
6. **Submission**: Enters the code and clicks Submit
7. **Progress Tracking**: Monitors step completion and handles stuck states

## Metrics Tracked

- Total time taken
- Steps completed (out of 30)
- Individual step times
- Success/failure status
- Estimated token usage and cost
- Error logging

## Output Files

After running, the agent generates:
- `metrics.json` - Detailed run statistics
- `final-screenshot.png` - Screenshot of final state

## Example Run

```
╔════════════════════════════════════════════╗
║  Browser Navigation Challenge Agent        ║
║  Target: 30 steps in under 5 minutes       ║
╚════════════════════════════════════════════╝

Navigating to challenge...
Starting challenge...

=== Step 1/30 ===
  Code: UUUUUU
  ✓ Submitted

=== Step 2/30 ===
  Code: YUQLGC
  ✓ Submitted

... (continues for all 30 steps)

╔════════════════════════════════════════════╗
║              FINAL RESULTS                 ║
╠════════════════════════════════════════════╣
║  Status: ✅ SUCCESS                        ║
║  Steps Completed: 30/30                    ║
║  Total Time: 180.5s                        ║
║  Under 5 min: ✅ YES                       ║
║  Est. Tokens: 15000                        ║
║  Est. Cost: $0.0450                        ║
╚════════════════════════════════════════════╝
```

## Known Limitations

- Some challenge types may require additional handlers
- Performance varies based on network latency
- Headless mode not recommended (some challenges detect it)

## License

MIT
