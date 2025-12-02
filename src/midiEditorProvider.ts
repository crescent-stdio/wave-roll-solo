import * as vscode from "vscode";
import * as crypto from "crypto";

/**
 * Custom document for MIDI files.
 * Holds the binary data of the MIDI file.
 */
interface MidiDocument extends vscode.CustomDocument {
  readonly uri: vscode.Uri;
  readonly data: Uint8Array;
}

/**
 * Appearance settings structure for persistence.
 * Matches the AppearanceSettings type from wave-roll.
 */
interface AppearanceSettings {
  paletteId: string;
  noteColor?: number;
  onsetMarker?: {
    shape: string;
    variant: "filled" | "outlined";
  };
}

/** Storage key prefix for appearance settings */
const APPEARANCE_STORAGE_PREFIX = "appearance:";

/**
 * Provider for the Wave Roll Solo custom editor.
 * Handles opening MIDI files and rendering them in a webview.
 */
export class MidiEditorProvider
  implements vscode.CustomReadonlyEditorProvider<MidiDocument>
{
  public static readonly viewType = "wave-roll-solo.preview";

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Gets the storage key for a file's appearance settings.
   */
  private getSettingsKey(uri: vscode.Uri): string {
    return `${APPEARANCE_STORAGE_PREFIX}${uri.toString()}`;
  }

  /**
   * Loads saved appearance settings for a file.
   */
  private loadAppearanceSettings(uri: vscode.Uri): AppearanceSettings | undefined {
    const key = this.getSettingsKey(uri);
    return this.context.globalState.get<AppearanceSettings>(key);
  }

  /**
   * Saves appearance settings for a file.
   */
  private async saveAppearanceSettings(
    uri: vscode.Uri,
    settings: AppearanceSettings
  ): Promise<void> {
    const key = this.getSettingsKey(uri);
    await this.context.globalState.update(key, settings);
  }

  /**
   * Opens a MIDI file and returns a custom document.
   */
  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<MidiDocument> {
    const data = await vscode.workspace.fs.readFile(uri);
    return {
      uri,
      data,
      dispose: () => {
        // Cleanup if needed
      },
    };
  }

  /**
   * Resolves the custom editor by setting up the webview.
   */
  async resolveCustomEditor(
    document: MidiDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Configure webview options
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview"),
      ],
    };

    // Generate HTML content with CSP
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "ready":
            // Webview is ready, send MIDI data and saved settings
            this.sendMidiData(webviewPanel.webview, document);
            break;

          case "get-settings":
            // Webview requests saved appearance settings
            {
              const settings = this.loadAppearanceSettings(document.uri);
              webviewPanel.webview.postMessage({
                type: "settings-loaded",
                settings: settings ?? null,
              });
            }
            break;

          case "save-settings":
            // Webview wants to save appearance settings
            {
              const settings = message.settings as AppearanceSettings;
              if (settings) {
                await this.saveAppearanceSettings(document.uri, settings);
              }
            }
            break;

          case "export-midi":
            // Handle MIDI export from webview
            {
              const { data: base64Data, filename } = message as {
                data: string;
                filename: string;
              };
              await this.handleMidiExport(document.uri, base64Data, filename);
            }
            break;

          case "error":
            vscode.window.showErrorMessage(
              `Wave Roll Solo: ${message.message}`
            );
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  /**
   * Handles MIDI export: saves the file to the same directory as the original.
   * If a file with the same name exists, appends a number (e.g., song_120bpm(1).mid).
   */
  private async handleMidiExport(
    originalUri: vscode.Uri,
    base64Data: string,
    suggestedFilename: string
  ): Promise<void> {
    try {
      // Convert base64 to Uint8Array
      const midiBytes = Buffer.from(base64Data, "base64");

      // Get the directory of the original file
      const originalDir = vscode.Uri.joinPath(originalUri, "..");

      // Find a unique filename (auto-increment if exists)
      const targetUri = await this.getUniqueFileUri(originalDir, suggestedFilename);

      // Write the file
      await vscode.workspace.fs.writeFile(targetUri, midiBytes);

      // Show success notification with the saved path
      const relativePath = vscode.workspace.asRelativePath(targetUri);
      vscode.window.showInformationMessage(
        `MIDI exported: ${relativePath}`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      vscode.window.showErrorMessage(
        `Failed to export MIDI: ${errorMsg}`
      );
    }
  }

  /**
   * Gets a unique file URI by appending (1), (2), etc. if the file already exists.
   */
  private async getUniqueFileUri(
    directory: vscode.Uri,
    filename: string
  ): Promise<vscode.Uri> {
    // Parse filename to base and extension
    const lastDotIndex = filename.lastIndexOf(".");
    const baseName = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;
    const extension = lastDotIndex > 0 ? filename.slice(lastDotIndex) : "";

    // Try original filename first
    let targetUri = vscode.Uri.joinPath(directory, filename);
    let counter = 0;

    while (await this.fileExists(targetUri)) {
      counter++;
      const newFilename = `${baseName}(${counter})${extension}`;
      targetUri = vscode.Uri.joinPath(directory, newFilename);
    }

    return targetUri;
  }

  /**
   * Checks if a file exists at the given URI.
   */
  private async fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sends MIDI data to the webview as Base64.
   */
  private sendMidiData(
    webview: vscode.Webview,
    document: MidiDocument
  ): void {
    const base64Data = Buffer.from(document.data).toString("base64");
    webview.postMessage({
      type: "midi-data",
      data: base64Data,
      filename: document.uri.path.split("/").pop() ?? "unknown.mid",
    });
  }

  /**
   * Generates the HTML content for the webview with proper CSP and nonce.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = crypto.randomUUID();

    // Get URIs for webview resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "dist",
        "webview",
        "main.js"
      )
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "dist",
        "webview",
        "styles.css"
      )
    );

    // Content Security Policy
    // Allow Salamander Grand Piano samples from tonejs.github.io
    // PixiJS requires 'unsafe-eval' for shader compilation
    // Tone.js requires blob: workers for audio scheduling
    // blob: in connect-src is required for loading MIDI data from Blob URLs
    const salamanderUrl = "https://tonejs.github.io";
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' 'unsafe-eval'`,
      `worker-src 'self' blob:`,
      `img-src ${webview.cspSource} data: blob:`,
      `font-src ${webview.cspSource}`,
      `connect-src ${webview.cspSource} ${salamanderUrl} blob:`,
      `media-src ${webview.cspSource} ${salamanderUrl}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${stylesUri}">
  <title>Wave Roll Solo</title>
</head>
<body>
  <div id="app">
    <div id="loading-container" class="status-container">
      <div class="spinner"></div>
      <p>Loading MIDI file...</p>
    </div>
    <div id="error-container" class="status-container hidden">
      <p class="error-icon">⚠️</p>
      <p id="error-message">An error occurred</p>
    </div>
    <div id="wave-roll-container" class="hidden"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

