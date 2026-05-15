import yaml from '../vendor/js-yaml.mjs';

/**
 * @param {unknown[]} payload
 */
export function dumpPayloadYaml(payload) {
  return yaml.dump(payload, { lineWidth: -1, indent: 2, noRefs: true });
}

/** @param {unknown} value */
export function formatYamlScalar(value) {
  if (typeof value === 'string') {
    if (
      value === '' ||
      /\r|\n/.test(value) ||
      /^\s|\s$/.test(value) ||
      /[:#'"[\]{}]|^- /.test(value) ||
      /^(?:true|false|null|yes|no|on|off|~\s*|\*[\w-]+)$/i.test(value) ||
      /^[-+]?\d+(?:\.\d+)?$/i.test(value)
    ) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return JSON.stringify(value);
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  return String(value);
}

/**
 * @param {unknown[]} payloadItems
 */
export function formatPayloadYamlBlock(payloadItems) {
  const lines = ['payload:'];
  if (!Array.isArray(payloadItems) || payloadItems.length === 0) {
    lines.push('  []');
    return lines.join('\n');
  }
  for (let i = 0; i < payloadItems.length; i += 1) {
    const item = payloadItems[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`payload[${i}] must be an object`);
    }
    const o = /** @type {Record<string, unknown>} */ (item);
    const t = o.type;
    if (typeof t !== 'string' || !t) {
      throw new Error(`payload[${i}] missing type`);
    }
    lines.push(`  - type: ${formatYamlScalar(t)}`);
    for (const [key, val] of Object.entries(o)) {
      if (key === 'type') continue;
      lines.push(`    ${key}: ${formatYamlScalar(val)}`);
    }
  }
  return lines.join('\n');
}

/**
 * Full automation snippet (copy-paste into YAML automations/scripts).
 */
export function buildServiceCallSnippet(deviceId, dataFields, payloadYamlBlock) {
  const { background, rotate, dither, ttl, refresh_type, dry_run } = dataFields;
  const lines = [
    'action: opendisplay.drawcustom',
    'target:',
    `  device_id: ${JSON.stringify(deviceId)}`,
    'data:',
    `  background: ${formatYamlScalar(background)}`,
    `  rotate: ${rotate}`,
    `  dither: ${dither}`,
    `  ttl: ${ttl}`,
    `  refresh_type: ${typeof refresh_type === 'string' ? JSON.stringify(refresh_type) : String(refresh_type)}`,
    `  dry-run: ${dry_run ? 'true' : 'false'}`,
  ];
  const payloadLines = payloadYamlBlock.split('\n').map((l) => `  ${l}`);
  lines.push(...payloadLines);
  return lines.join('\n');
}
