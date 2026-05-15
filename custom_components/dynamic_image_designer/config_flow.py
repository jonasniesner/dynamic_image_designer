"""Config flow for Dynamic Image Designer."""

from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import CONF_SHOW_SIDEBAR, DEFAULT_TITLE, DOMAIN


class OpenDisplayDesignerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is None:
            return self.async_show_form(
                step_id="user",
                data_schema=vol.Schema(
                    {
                        vol.Required(CONF_SHOW_SIDEBAR, default=True): selector.BooleanSelector(),
                    }
                ),
            )

        return self.async_create_entry(
            title=DEFAULT_TITLE,
            data={},
            options={CONF_SHOW_SIDEBAR: user_input[CONF_SHOW_SIDEBAR]},
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return OpenDisplayDesignerOptionsFlow(config_entry)


class OpenDisplayDesignerOptionsFlow(config_entries.OptionsFlow):
    """Options flow."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(
                title="",
                data={**self.config_entry.options, **user_input},
            )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_SHOW_SIDEBAR,
                        default=self.config_entry.options.get(CONF_SHOW_SIDEBAR, True),
                    ): selector.BooleanSelector(),
                }
            ),
        )
