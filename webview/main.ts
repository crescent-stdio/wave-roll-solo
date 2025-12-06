import { createWaveRollPlayer } from "wave-roll";
import type { AppearanceSettings, MidiExportOptions } from "wave-roll";

// Extended player interface with new VS Code integration APIs
interface WaveRollPlayerExtended {
  dispose(): void;
  applyAppearanceSettings(settings: AppearanceSettings): void;
  onAppearanceChange(
    callback: (settings: AppearanceSettings) => void
  ): () => void;
  onFileAddRequest(callback: () => void): () => void;
  onAudioFileAddRequest(callback: () => void): () => void;
  addFileFromData(data: ArrayBuffer | string, filename: string): Promise<void>;
}

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
let playerInstance: WaveRollPlayerExtended | null = null;
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
  // Create a new ArrayBuffer copy to ensure compatibility with Blob constructor
  const buffer = new ArrayBuffer(midiBytes.length);
  new Uint8Array(buffer).set(midiBytes);
  const blob = new Blob([buffer], { type: "audio/midi" });
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
  if (!waveRollContainer) {
    throw new Error("WaveRoll container not found");
  }

  // Cleanup previous instance and blob URL
  if (playerInstance) {
    playerInstance.dispose();
    playerInstance = null;
  }
  revokeBlobUrl();

  // Create Blob URL from MIDI bytes
  currentBlobUrl = createMidiBlobUrl(midiBytes);

  // Create the WaveRoll player with the Blob URL
  // Multi-file mode enabled (soloMode: false) for file comparison features
  try {
    const playerOptions = {
      // Disable solo mode to enable multi-file comparison features
      soloMode: false,
      // Default highlight to file colors for clearer baseline view
      defaultHighlightMode: "file",
      // Use WebGL for better compatibility in VS Code webview environment
      // Keep light background and hide waveform band (like solo mode styling)
      pianoRoll: {
        rendererPreference: "webgl",
        showWaveformBand: false,
        backgroundColor: 0xffffff,
      },
      // Use custom export handler to save MIDI to original file location
      midiExport: createMidiExportOptions(),
      // Disable drag & drop in VS Code webview; click-to-open only
      allowFileDrop: false,
    } as Parameters<typeof createWaveRollPlayer>[2] & {
      allowFileDrop?: boolean;
    };

    playerInstance = (await createWaveRollPlayer(
      waveRollContainer,
      [
        {
          path: currentBlobUrl,
          name: filename,
        },
      ],
      playerOptions
    )) as unknown as WaveRollPlayerExtended;

    // Setup file add request callback to use VS Code file dialog
    setupFileAddRequestListener();

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
        playerInstance.applyAppearanceSettings(message.settings);
      }
      pendingSettingsRequest = false;
      break;

    case "file-added":
      // Handle file added via VS Code file dialog
      handleFileAdded(message.data, message.filename);
      break;
  }
}

/**
 * Handles a file added via VS Code file dialog.
 * Uses the player's addFileFromData API to add the file.
 */
async function handleFileAdded(
  base64Data: string,
  filename: string
): Promise<void> {
  if (!playerInstance) {
    console.error("[WaveRoll] Cannot add file: player not initialized");
    return;
  }

  try {
    await playerInstance.addFileFromData(base64Data, filename);
  } catch (error) {
    console.error("[WaveRoll] Error adding file:", error);
    const errorMsg =
      error instanceof Error ? error.message : "Failed to add file";
    vscode.postMessage({
      type: "error",
      message: errorMsg,
    });
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
  appearanceChangeUnsubscribe = playerInstance.onAppearanceChange(
    (settings) => {
      // Don't save if we're still loading initial settings
      if (pendingSettingsRequest) return;

      saveAppearanceSettings(settings);
    }
  );
}

// State for file add request listeners
let fileAddRequestUnsubscribe: (() => void) | null = null;
let audioFileAddRequestUnsubscribe: (() => void) | null = null;

/**
 * Setup file add request listeners.
 * When user clicks "Add MIDI Files" or "Add Audio File" button,
 * send message to VS Code extension to open native file dialog.
 */
function setupFileAddRequestListener(): void {
  if (!playerInstance) {
    return;
  }

  // Unsubscribe previous listeners if exists
  if (fileAddRequestUnsubscribe) {
    fileAddRequestUnsubscribe();
    fileAddRequestUnsubscribe = null;
  }
  if (audioFileAddRequestUnsubscribe) {
    audioFileAddRequestUnsubscribe();
    audioFileAddRequestUnsubscribe = null;
  }

  // Subscribe to MIDI file add requests
  fileAddRequestUnsubscribe = playerInstance.onFileAddRequest(() => {
    // Request VS Code to show MIDI file dialog
    vscode.postMessage({ type: "add-midi-files" });
  });

  // Subscribe to audio file add requests
  audioFileAddRequestUnsubscribe = playerInstance.onAudioFileAddRequest(() => {
    // Request VS Code to show audio file dialog
    vscode.postMessage({ type: "add-audio-file" });
  });
}

/**
 * Converts a Blob to Base64 string.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/midi;base64,")
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Creates MIDI export options for VS Code extension integration.
 * Uses custom mode to send the exported MIDI to the extension for saving.
 */
function createMidiExportOptions(): MidiExportOptions {
  return {
    mode: "custom",
    onExport: async (blob: Blob, filename: string) => {
      // Convert blob to base64 for sending via postMessage
      const base64Data = await blobToBase64(blob);

      // Send to extension for saving to original file location
      vscode.postMessage({
        type: "export-midi",
        data: base64Data,
        filename,
      });
    },
  };
}

/**
 * Waits for container layout to be ready with valid dimensions.
 * In VS Code webview, the container may not have accurate dimensions immediately
 * after being shown, so we poll until we get a stable width > 0.
 */
async function waitForContainerLayout(
  container: HTMLElement,
  timeoutMs: number = 2000
): Promise<void> {
  const startTime = Date.now();
  const minWidth = 100; // Minimum expected width in pixels

  return new Promise<void>((resolve, reject) => {
    const checkLayout = () => {
      const now = Date.now();
      const elapsed = now - startTime;

      if (elapsed > timeoutMs) {
        reject(
          new Error(
            `Container layout timeout: width=${container.clientWidth}px after ${timeoutMs}ms`
          )
        );
        return;
      }

      const width = container.clientWidth;
      const height = container.clientHeight;

      // Check if container has valid dimensions
      if (width >= minWidth && height > 0) {
        // Double-check with one more frame to ensure stability
        requestAnimationFrame(() => {
          const stableWidth = container.clientWidth;
          const stableHeight = container.clientHeight;
          if (
            stableWidth >= minWidth &&
            stableHeight > 0 &&
            Math.abs(stableWidth - width) < 10
          ) {
            // Dimensions are stable, proceed
            resolve();
          } else {
            // Dimensions changed, check again
            checkLayout();
          }
        });
      } else {
        // Not ready yet, check again after a short delay
        setTimeout(checkLayout, 16); // ~60fps polling
      }
    };

    // Start checking after initial animation frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        checkLayout();
      });
    });
  });
}

/**
 * Processes received MIDI data.
 */
async function handleMidiData(
  base64Data: string,
  filename: string
): Promise<void> {
  try {
    // Show the container before initializing (so it has dimensions)
    setStatus("ready");

    // Wait for container layout to be ready with valid dimensions
    // This is critical in VS Code webview where layout calculation may be delayed
    if (waveRollContainer) {
      await waitForContainerLayout(waveRollContainer);
    }

    // Decode base64 to bytes
    const midiBytes = decodeBase64ToUint8Array(base64Data);

    // Initialize the WaveRoll player
    await initializeWaveRollPlayer(midiBytes, filename);
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
    if (fileAddRequestUnsubscribe) {
      fileAddRequestUnsubscribe();
      fileAddRequestUnsubscribe = null;
    }
    if (audioFileAddRequestUnsubscribe) {
      audioFileAddRequestUnsubscribe();
      audioFileAddRequestUnsubscribe = null;
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
