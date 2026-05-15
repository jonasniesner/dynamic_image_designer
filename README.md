# Dynamic Image Designer

Home Assistant custom integration that adds a sidebar panel for designing **OpenDisplay** `drawcustom` image payloads visually.

Currently supports **OpenDisplay** devices. Additional integrations may be added later using the same editor workflow.

## Features

- YAML payload editor with parse errors and diagnostics
- Live sketch preview, HA dry-run preview, and overlay mode
- Drag-and-drop elements, move/resize handles, undo/redo
- Built-in payload templates and automation YAML export
- Virtual canvas size for layout without a physical device

## Requirements

- Home Assistant **2024.1** or newer
- [OpenDisplay](https://github.com/OpenDisplay-org/Home_Assistant_Integration) integration installed and configured
- At least one OpenDisplay device in the device registry (optional: use virtual sketch mode)

## Installation

### HACS (recommended)

1. Add this repository as a [custom repository](https://hacs.xyz/docs/faq/custom_repositories/) in HACS (**Integrations**).
2. Install **Dynamic Image Designer**.
3. Restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration** and add **Dynamic Image Designer**.
5. Open the **Dynamic Image Designer** panel from the sidebar.

### Manual

1. Copy `custom_components/dynamic_image_designer` into your Home Assistant `config/custom_components/` directory.
2. Restart Home Assistant.
3. Add the integration under **Settings → Devices & services**.

## Configuration

On first setup you can choose whether the panel appears in the sidebar. This can be changed later under the integration **Options**.

## Usage

1. Select an OpenDisplay device (or **Virtual device** for local sketch-only editing).
2. Edit the payload YAML or add elements from the palette.
3. Use **HA preview now** for a dry-run render, or **Send to tag** to push to the device.
4. Expand **Service options & export** to copy an automation snippet.

Keyboard shortcuts in the YAML editor:

- `Ctrl/Cmd+Z` — undo
- `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` — redo

## Support

Open an issue on this repository’s issue tracker (see `manifest.json`).

## License

MIT — see [LICENSE](LICENSE).
