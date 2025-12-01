import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const isWatch = process.argv.includes("--watch");

// Shared build options
const baseConfig = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  logLevel: "info",
};

// Extension build configuration (Node.js environment)
const extensionConfig = {
  ...baseConfig,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension/extension.js",
  platform: "node",
  format: "cjs",
  external: ["vscode"],
  target: "node18",
};

// Webview build configuration (Browser environment)
const webviewConfig = {
  ...baseConfig,
  entryPoints: ["webview/main.ts"],
  outfile: "dist/webview/main.js",
  platform: "browser",
  format: "iife",
  target: "es2020",
  // Bundle all dependencies for browser
  external: [],
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
  },
};

/**
 * Copies CSS file to dist folder.
 */
function copyStyles() {
  const srcPath = "webview/styles.css";
  const destDir = "dist/webview";
  const destPath = path.join(destDir, "styles.css");

  // Ensure destination directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.copyFileSync(srcPath, destPath);
  console.log("✓ Copied styles.css to dist/webview/");
}

/**
 * Main build function.
 */
async function build() {
  try {
    if (isWatch) {
      // Watch mode - create contexts and watch
      const [extContext, webviewContext] = await Promise.all([
        esbuild.context(extensionConfig),
        esbuild.context(webviewConfig),
      ]);

      // Initial build
      await Promise.all([extContext.rebuild(), webviewContext.rebuild()]);
      copyStyles();

      // Watch for changes
      await Promise.all([extContext.watch(), webviewContext.watch()]);

      // Watch CSS file separately
      fs.watch("webview/styles.css", () => {
        copyStyles();
      });

      console.log("👀 Watching for changes...");
    } else {
      // Production build
      await Promise.all([
        esbuild.build(extensionConfig),
        esbuild.build(webviewConfig),
      ]);
      copyStyles();

      console.log("✅ Build completed successfully!");
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

build();

