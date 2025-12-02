# Wave Roll Solo

A lightweight VS Code extension for viewing and playing MIDI files with an interactive piano roll visualization.

Built on top of [**WaveRoll**](https://github.com/crescent-stdio/wave-roll) - an interactive JavaScript library for MIDI piano roll visualization.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **Piano Roll Visualization**: View MIDI files as an interactive piano roll display powered by the [wave-roll](https://www.npmjs.com/package/wave-roll) library
- **Audio Playback**: Play MIDI files directly in VS Code using Tone.js synthesis
- **Tempo Control**: Adjust playback tempo with an interactive tempo control
- **MIDI Export**: Export MIDI files with modified tempo settings
- **Format Support**: Supports `.mid` and `.midi` file extensions

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **"WaveRoll Solo"**
4. Click **Install**

Or install directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=crescent-stdio.wave-roll-solo).

## Usage

1. Open any `.mid` or `.midi` file in VS Code
2. The file will automatically open in the Wave Roll Solo viewer
3. Use the player controls to interact with the MIDI file

## Controls

- **Play/Pause**: Start or pause MIDI playback
- **Stop**: Stop playback and reset to beginning
- **Tempo**: Click the BPM badge to adjust playback tempo
- **Export**: Export MIDI with the current tempo setting

## Related Projects

- **WaveRoll Library**: [GitHub](https://github.com/crescent-stdio/wave-roll) | [NPM](https://www.npmjs.com/package/wave-roll)
- **Web Demo**: [https://crescent-stdio.github.io/wave-roll/](https://crescent-stdio.github.io/wave-roll/)
- **Standalone Demo**: [https://crescent-stdio.github.io/wave-roll/standalone.html](https://crescent-stdio.github.io/wave-roll/standalone.html)

## Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Setup

```bash
cd wave-roll-solo
pnpm install
```

### Build

```bash
# Production build
pnpm build

# Watch mode (development)
pnpm watch
```

### Debug

1. Open the extension folder in VS Code
2. Press `F5` to launch Extension Development Host
3. Open a MIDI file in the development host

## Tech Stack

- **[wave-roll](https://www.npmjs.com/package/wave-roll)**: Interactive piano roll rendering engine for comparative MIDI visualization
- **[Tone.js](https://tonejs.github.io/)**: Web Audio synthesis framework
- **[@tonejs/midi](https://github.com/Tonejs/Midi)**: MIDI file parsing
- **[esbuild](https://esbuild.github.io/)**: Fast JavaScript bundler

## License

MIT
