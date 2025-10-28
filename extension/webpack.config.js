const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

const distPath = path.resolve(__dirname, "dist");

function createTerserPlugin() {
  return new TerserPlugin({
    parallel: true,
    extractComments: false,
    terserOptions: {
      compress: {
        passes: 2,
        drop_debugger: true
      },
      mangle: true,
      format: {
        comments: false
      }
    }
  });
}

const staticAssets = [
  { from: "manifest.json", to: "manifest.json" },
  { from: "assets", to: "assets", noErrorOnMissing: true },
  { from: "popup/popup.html", to: "popup/popup.html" },
  { from: "popup/popup.css", to: "popup/popup.css" },
  { from: "dashboard/index.html", to: "dashboard/index.html" },
  { from: "dashboard/dashboard.css", to: "dashboard/dashboard.css" },
  { from: "src/content/content.css", to: "src/content/content.css" }
];

const backgroundConfig = {
  name: "background",
  mode: "production",
  target: "webworker",
  entry: {
    background: "./src/background.js"
  },
  output: {
    path: distPath,
    filename: "src/[name].js",
    clean: true,
    module: true,
    chunkFormat: "module"
  },
  experiments: {
    outputModule: true
  },
  optimization: {
    minimize: true,
    minimizer: [createTerserPlugin()]
  },
  devtool: false,
  performance: {
    hints: false
  }
};

const appConfig = {
  name: "app",
  mode: "production",
  target: "web",
  entry: {
    "src/content/content": "./src/content/content.js",
    "popup/popup": "./popup/popup.js",
    "dashboard/dashboard": "./dashboard/dashboard.js"
  },
  output: {
    path: distPath,
    filename: "[name].js"
  },
  optimization: {
    minimize: true,
    minimizer: [createTerserPlugin()]
  },
  devtool: false,
  performance: {
    hints: false
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: staticAssets
    })
  ],
  resolve: {
    extensions: [".js"]
  }
};

module.exports = [backgroundConfig, appConfig];
