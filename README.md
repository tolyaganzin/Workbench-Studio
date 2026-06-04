# Workbench-Studio
here example of code: js/html/css. where you can see how to work with a live streaming and canvas. It's part frontend only.

## What you can to do?
- add multiple microphones
- add multiple cameras
- add multiple screans, windows or borwser tabs
- resize,change shape and pan work arrea or items inside
- switch between create and live mods
- update your layout at live stream
- change layers position of items
- remove or add items at any time
- start / stop live and check media at dev tools console tab


## How it runs?

- You should have Node.js installed first. `npm` and `npx` are included with Node.js.
- If Node.js is not installed, download it from https://nodejs.org.
- There are a few options below (terminal or VS Code tools):

### Run locally (universal)

You can start a simple static server from the project root on any device with Node.js installed.

Terminal (any OS):

```
cd /path/to/Workbench-Studio
npx http-server -p 8000
```

Or use the included npm script which uses `npx` (no global install required):

```
npm start
```

VS Code: open the `Workbench-Studio` folder in VS Code and run the **Serve Workbench-Studio** task (Run Build Task / `Cmd/Ctrl+Shift+B`) — it executes `npm start` in the integrated terminal.

If you want a different port, edit the `start` script in `package.json` or run `npx http-server -p <PORT>`.

This approach works across platforms and lets anyone open the project in VS Code and start the local server with the editor UI or the terminal.

### Run & Debug in VS Code

You can run the server and open the project from the VS Code Run and Debug tab.

- Open the `Run and Debug` view (left sidebar) or press `Ctrl/Cmd+Shift+D`.
- From the configuration dropdown choose one of:
  - `Run Server (npm start)` — launches the `npm start` script in the integrated terminal.
  - `Open in Chrome` — launches a Chrome window at `http://localhost:8000` (ensure Chrome is installed).
  - `Run server and open in browser` — a compound configuration that starts the server and opens Chrome.

To run: select a configuration and press the green "Start" button (or press `F5`).

Notes:
- The server runs in the integrated terminal; stop it there or in the Run panel.
- To change the port, update the `start` script in `package.json` or pass a different port when using `npx http-server`.

