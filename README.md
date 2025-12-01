# Wave Roll Solo - Single MIDI Player

A lightweight VS Code extension for viewing and playing MIDI files with a piano roll visualization.

## Features

- **Piano Roll Visualization**: View MIDI files as an interactive piano roll display
- **Audio Playback**: Play MIDI files directly in VS Code using Tone.js synthesis
- **Format Support**: Supports `.mid` and `.midi` file extensions

## Usage

1. Open any `.mid` or `.midi` file in VS Code
2. The file will automatically open in the Wave Roll Solo viewer
3. Use the play/stop controls to listen to the MIDI file

## Controls

- **Play/Pause**: Start or pause MIDI playback
- **Stop**: Stop playback and reset to beginning

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

- **wave-roll**: Piano roll rendering engine
- **Tone.js**: Web Audio synthesis
- **@tonejs/midi**: MIDI file parsing
- **esbuild**: Fast bundling

## License

MIT

