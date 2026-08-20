// Per the chapter policies doc: 4 professional events, 2 service, 2
// fundraising, 2 social, at 10 pts/event. Lower threshold halves each.
// Override per-deployment via the STANDARD_THRESHOLDS_JSON /
// LOWER_THRESHOLDS_JSON env vars (JSON object of category -> minimum, plus
// a "total" key).
const DEFAULT_STANDARD_THRESHOLDS = {
  professional: 40,
  service: 20,
  fundraising: 20,
  social: 20,
  total: 100,
};

const DEFAULT_LOWER_THRESHOLDS = {
  professional: 20,
  service: 10,
  fundraising: 10,
  social: 10,
  total: 50,
};

function loadThresholds(envVar, fallback) {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    console.error(`Failed to parse ${envVar} as JSON; using default thresholds`);
    return fallback;
  }
}

export function getStandardThresholds() {
  return loadThresholds('STANDARD_THRESHOLDS_JSON', DEFAULT_STANDARD_THRESHOLDS);
}

export function getLowerThresholds() {
  return loadThresholds('LOWER_THRESHOLDS_JSON', DEFAULT_LOWER_THRESHOLDS);
}
