import * as vscode from "vscode";
import { MidiEditorProvider } from "./midiEditorProvider";

/**
 * Activates the Wave Roll Solo extension.
 * Registers the custom editor provider for MIDI files.
 */
export function activate(context: vscode.ExtensionContext): void {
  const provider = new MidiEditorProvider(context);

  const registration = vscode.window.registerCustomEditorProvider(
    MidiEditorProvider.viewType,
    provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    }
  );

  context.subscriptions.push(registration);
}

/**
 * Deactivates the extension.
 */
export function deactivate(): void {
  // Cleanup if needed
}

