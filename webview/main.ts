import { createWaveRollPlayer } from "wave-roll";
import type { AppearanceSettings } from "wave-roll";

// Declare VS Code API type
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// Initialize VS Code API
const vscode = acquireVsCodeApi();

// UI Elements
let loadingContainer: HTMLElement | null;
let errorContainer: HTMLElement | null;
let waveRollContainer: HTMLElement | null;
let errorMessage: HTMLElement | null;

// State
let playerInstance: Awaited<ReturnType<typeof createWaveRollPlayer>> | null =
  null;
let currentBlobUrl: string | null = null;
let appearanceChangeUnsubscribe: (() => void) | null = null;
let pendingSettingsRequest: boolean = false;

/**
 * Decodes a Base64 string to Uint8Array.
 */
function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Creates a Blob URL from MIDI bytes.
 * Remember to call revokeBlobUrl() when done.
 */
function createMidiBlobUrl(midiBytes: Uint8Array): string {
  const blob = new Blob([midiBytes], { type: "audio/midi" });
  return URL.createObjectURL(blob);
}

/**
 * Revokes the current Blob URL to free memory.
 */
function revokeBlobUrl(): void {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

/**
 * Updates the UI state (loading, error, ready).
 */
function setStatus(
  status: "loading" | "error" | "ready",
  message?: string
): void {
  if (!loadingContainer || !errorContainer || !waveRollContainer) {
    return;
  }

  loadingContainer.classList.toggle("hidden", status !== "loading");
  errorContainer.classList.toggle("hidden", status !== "error");
  waveRollContainer.classList.toggle("hidden", status !== "ready");

  if (status === "error" && errorMessage && message) {
    errorMessage.textContent = message;
  }
}

/**
 * Initializes the WaveRoll player with MIDI data.
 */
async function initializeWaveRollPlayer(
  midiBytes: Uint8Array,
  filename: string
): Promise<void> {
  console.log("[WaveRoll] initializeWaveRollPlayer called");

  if (!waveRollContainer) {
    throw new Error("WaveRoll container not found");
  }

  // Cleanup previous instance and blob URL
  if (playerInstance) {
    console.log("[WaveRoll] Disposing previous player instance");
    playerInstance.dispose();
    playerInstance = null;
  }
  revokeBlobUrl();

  // Create Blob URL from MIDI bytes
  console.log("[WaveRoll] Creating Blob URL from MIDI bytes...");
  currentBlobUrl = createMidiBlobUrl(midiBytes);
  console.log("[WaveRoll] Blob URL created:", currentBlobUrl);

  // Create the WaveRoll player with the Blob URL
  // Use soloMode to hide evaluation UI, file sections, and waveform band
  console.log("[WaveRoll] Creating WaveRoll player...");
  try {
    playerInstance = await createWaveRollPlayer(
      waveRollContainer,
      [
        {
          path: currentBlobUrl,
          name: filename,
          type: "midi",
        },
      ],
      {
        soloMode: true,
        // Use WebGL for better compatibility in VS Code webview environment
        pianoRoll: { rendererPreference: 'webgl' },
      }
    );

    // Set readonly mode: disable file add/remove in VS Code context
    playerInstance.setPermissions({
      canAddFiles: false,
      canRemoveFiles: false,
    });

    console.log("[WaveRoll] WaveRoll player created successfully!");

    // Request saved appearance settings from extension
    requestSavedSettings();

    // Setup listener to save appearance changes
    setupAppearanceChangeListener();
  } catch (playerError) {
    console.error("[WaveRoll] createWaveRollPlayer() failed:", playerError);
    throw playerError;
  }
}

/**
 * Handles messages from the extension host.
 */
function handleMessage(event: MessageEvent): void {
  const message = event.data;

  switch (message.type) {
    case "midi-data":
      handleMidiData(message.data, message.filename);
      break;

    case "settings-loaded":
      // Apply saved appearance settings if available
      if (message.settings && playerInstance) {
        console.log("[WaveRoll] Applying saved appearance settings:", message.settings);
        playerInstance.applyAppearanceSettings(message.settings);
      }
      pendingSettingsRequest = false;
      break;
  }
}

/**
 * Request saved appearance settings from extension.
 */
function requestSavedSettings(): void {
  pendingSettingsRequest = true;
  vscode.postMessage({ type: "get-settings" });
}

/**
 * Save appearance settings to extension.
 */
function saveAppearanceSettings(settings: AppearanceSettings): void {
  vscode.postMessage({
    type: "save-settings",
    settings,
  });
}

/**
 * Subscribe to appearance changes and save them.
 */
function setupAppearanceChangeListener(): void {
  if (!playerInstance) return;

  // Unsubscribe previous listener if exists
  if (appearanceChangeUnsubscribe) {
    appearanceChangeUnsubscribe();
    appearanceChangeUnsubscribe = null;
  }

  // Subscribe to appearance changes
  appearanceChangeUnsubscribe = playerInstance.onAppearanceChange((settings) => {
    // Don't save if we're still loading initial settings
    if (pendingSettingsRequest) return;

    console.log("[WaveRoll] Appearance changed, saving:", settings);
    saveAppearanceSettings(settings);
  });
}

/**
 * Processes received MIDI data.
 */
async function handleMidiData(
  base64Data: string,
  filename: string
): Promise<void> {
  console.log("[WaveRoll] handleMidiData called, filename:", filename);
  console.log("[WaveRoll] base64Data length:", base64Data.length);

  try {
    // Show the container before initializing (so it has dimensions)
    setStatus("ready");

    // Wait for layout to settle after showing the container
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    // Decode base64 to bytes
    console.log("[WaveRoll] Decoding base64 to Uint8Array...");
    const midiBytes = decodeBase64ToUint8Array(base64Data);
    console.log("[WaveRoll] Decoded MIDI bytes length:", midiBytes.length);

    // Initialize the WaveRoll player
    console.log("[WaveRoll] Initializing WaveRoll player...");
    await initializeWaveRollPlayer(midiBytes, filename);
    console.log("[WaveRoll] WaveRoll player initialized successfully!");
  } catch (error) {
    console.error("[WaveRoll] Error in handleMidiData:", error);
    const errorMsg =
      error instanceof Error ? error.message : "Failed to load MIDI file";
    setStatus("error", errorMsg);

    // Notify extension host about the error
    vscode.postMessage({
      type: "error",
      message: errorMsg,
    });
  }
}

/**
 * Initializes the webview when DOM is ready.
 */
function initialize(): void {
  // Get UI elements
  loadingContainer = document.getElementById("loading-container");
  errorContainer = document.getElementById("error-container");
  waveRollContainer = document.getElementById("wave-roll-container");
  errorMessage = document.getElementById("error-message");

  // Listen for messages from extension
  window.addEventListener("message", handleMessage);

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    if (appearanceChangeUnsubscribe) {
      appearanceChangeUnsubscribe();
      appearanceChangeUnsubscribe = null;
    }
    if (playerInstance) {
      playerInstance.dispose();
      playerInstance = null;
    }
    revokeBlobUrl();
  });

  // Notify extension that webview is ready
  vscode.postMessage({ type: "ready" });
}

// Initialize when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
