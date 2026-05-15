"""Constants for Dynamic Image Designer."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "dynamic_image_designer"
OPENDISPLAY_DOMAIN: Final = "opendisplay"

# Sidebar / route id for panel_custom (frontend_url_path).
PANEL_FRONTEND_PATH: Final = "opendisplay-designer"

# JS/CSS must NOT live under the panel URL prefix: HA's panel router owns
# /opendisplay-designer/* and can return HTML instead of module JavaScript.
STATIC_URL: Final = "/opendisplay-designer-assets/static"
PANEL_MODULE_PATH: Final = f"{STATIC_URL}/panel/opendisplay-designer-panel.js"

CONF_SHOW_SIDEBAR: Final = "show_in_sidebar"

DEFAULT_TITLE: Final = "Dynamic Image Designer"
