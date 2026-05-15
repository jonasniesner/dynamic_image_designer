"""Dynamic Image Designer — custom panel for building drawcustom payloads."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import CONF_SHOW_SIDEBAR, DEFAULT_TITLE, DOMAIN, PANEL_FRONTEND_PATH
from .panel import OpenDisplayDesignerStaticView, async_get_panel_module_url

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    entry.async_on_unload(entry.add_update_listener(_update_listener))

    if not hass.data[DOMAIN].get("views_registered"):
        hass.http.register_view(OpenDisplayDesignerStaticView(hass))
        hass.data[DOMAIN]["views_registered"] = True
        _LOGGER.debug("Registered static view for %s", DOMAIN)

    if entry.options.get(CONF_SHOW_SIDEBAR, True):
        try:
            from homeassistant.components import panel_custom

            await panel_custom.async_register_panel(
                hass,
                frontend_url_path=PANEL_FRONTEND_PATH,
                webcomponent_name="opendisplay-designer-panel",
                sidebar_title=DEFAULT_TITLE,
                sidebar_icon="mdi:monitor-edit",
                module_url=await async_get_panel_module_url(hass),
                require_admin=False,
            )
            _LOGGER.info("Dynamic Image Designer panel registered")
        except (AttributeError, ImportError, RuntimeError, ValueError) as err:
            _LOGGER.warning("Failed to register panel: %s", err)
    else:
        _LOGGER.info("Dynamic Image Designer sidebar disabled in options")

    return True


async def _update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    entries = [e for e in hass.config_entries.async_entries(DOMAIN) if e.entry_id != entry.entry_id]
    if not entries:
        try:
            from homeassistant.components import frontend

            frontend.async_remove_panel(hass, PANEL_FRONTEND_PATH)
        except (AttributeError, ImportError, RuntimeError, ValueError):
            pass
    return True
