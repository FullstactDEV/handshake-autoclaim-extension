# Handshake Autoclaim

A Chrome extension (Manifest V3) that repeatedly clicks a button you choose on
[ai.joinhandshake.com](https://ai.joinhandshake.com), such as **"Start task"**, at random
intervals. It keeps clicking while the browser window is in the background.

## Features

- **Point-and-click binding.** Pick the button on the page instead of writing a selector.
- **Random cadence.** Each click waits a random 15–45 seconds by default. You can change
  the range in the popup.
- **Keeps running when unfocused.** It pauses only when the tab itself is hidden.
- **Survives page changes.** It finds the button again by its label and surrounding card
  title, not only by a CSS path.
- **Status badge** on the toolbar icon, plus a click count in the popup.

## Install

The extension isn't on the Chrome Web Store, so load it unpacked:

1. Clone this repository:
   ```sh
   git clone https://github.com/FullstactDEV/handshake-autoclaim-extension.git
   ```
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the cloned folder.
4. Optionally, pin **Handshake Autoclaim** to the toolbar.

## Usage

1. Open `https://ai.joinhandshake.com/fellow/projects`.
2. Click the extension icon, then click **Bind button**.
3. Hover over the button you want clicked. It gets an outline. Click it to bind it, or
   press **Esc** to cancel.
4. In the popup, turn on **Auto-click**.

To change the delay between clicks, open **Advanced: click cadence** in the popup and set
the minimum and maximum seconds (1–600).

### When it pauses

The extension clicks only when all of these are true:

- Auto-click is enabled.
- The tab is on a `/fellow/projects` page.
- The tab is visible. Another app on top of the window is fine, but a background tab or a
  minimized window is not.
- Exactly one visible, enabled button on the page matches the bound label.

### Status badge

| Badge | Meaning |
|-------|---------|
| ● green | Active and clicking |
| ⏸ amber | Paused because the tab is hidden or on the wrong page |
| ? grey | No button bound yet |
| ! red | The bound button isn't on the page |
| *(none)* | Disabled |

If the popup shows **Multiple matches — rebind**, more than one button has the same label
and the card title wasn't enough to tell them apart. Bind the button again.

## How it works

| File | Role |
|------|------|
| `manifest.json` | Extension manifest. Needs only the `storage` permission and access to `ai.joinhandshake.com`. |
| `content.js` | Runs on `/fellow/*` pages. Handles the button picker, finding the bound button, and the click loop. |
| `background.js` | Service worker that sets default settings and updates the toolbar badge. |
| `popup.html` / `popup.js` / `popup.css` | The toolbar popup: on/off switch, binding, activity, and cadence settings. |
| `content.css` | Styles for the picker outline, banner, and toast. |

When you bind a button, the extension saves three things:

- the button's visible text
- the first line of the card around it (to tell apart buttons with the same label)
- a CSS path, which is tried first to find the button quickly

All settings are saved in `chrome.storage.local`. Nothing is sent anywhere.

## Disclaimer

This project has no connection to Handshake. Automating clicks may break the site's terms
of service. Use it at your own risk.
