'use strict';

const NVIDIA_SMI_ARGS = [
  '--query-gpu=utilization.gpu,temperature.gpu,memory.used',
  '--format=csv,noheader,nounits'
];

/**
 * Parse the first line of `nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,memory.used
 * --format=csv,noheader,nounits`. Returns null when the output is not usable.
 */
function parseNvidiaSmi(stdout) {
  const first = String(stdout || '').trim().split('\n')[0] || '';
  const p = first.split(',').map((s) => parseFloat(s));
  if (p.length < 3 || p.slice(0, 3).some((v) => Number.isNaN(v))) return null;
  return { util: p[0], temp: p[1], memMB: p[2] };
}

module.exports = { NVIDIA_SMI_ARGS, parseNvidiaSmi };
