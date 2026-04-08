// Hardware detection via WebGPU API and browser APIs

const KNOWN_GPUS = {
  // NVIDIA
  'rtx 4090': { vram: 24, type: 'discrete' },
  'rtx 4080 super': { vram: 16, type: 'discrete' },
  'rtx 4080': { vram: 16, type: 'discrete' },
  'rtx 4070 ti super': { vram: 16, type: 'discrete' },
  'rtx 4070 ti': { vram: 12, type: 'discrete' },
  'rtx 4070 super': { vram: 12, type: 'discrete' },
  'rtx 4070': { vram: 12, type: 'discrete' },
  'rtx 4060 ti': { vram: 8, type: 'discrete' },
  'rtx 4060': { vram: 8, type: 'discrete' },
  'rtx 3090 ti': { vram: 24, type: 'discrete' },
  'rtx 3090': { vram: 24, type: 'discrete' },
  'rtx 3080 ti': { vram: 12, type: 'discrete' },
  'rtx 3080': { vram: 10, type: 'discrete' },
  'rtx 3070 ti': { vram: 8, type: 'discrete' },
  'rtx 3070': { vram: 8, type: 'discrete' },
  'rtx 3060 ti': { vram: 8, type: 'discrete' },
  'rtx 3060': { vram: 12, type: 'discrete' },
  'rtx 2080 ti': { vram: 11, type: 'discrete' },
  'rtx 2080 super': { vram: 8, type: 'discrete' },
  'rtx 2080': { vram: 8, type: 'discrete' },
  'rtx 2070 super': { vram: 8, type: 'discrete' },
  'rtx 2070': { vram: 8, type: 'discrete' },
  'rtx 2060 super': { vram: 8, type: 'discrete' },
  'rtx 2060': { vram: 6, type: 'discrete' },
  'gtx 1080 ti': { vram: 11, type: 'discrete' },
  'gtx 1080': { vram: 8, type: 'discrete' },
  'gtx 1070 ti': { vram: 8, type: 'discrete' },
  'gtx 1070': { vram: 8, type: 'discrete' },
  'gtx 1060': { vram: 6, type: 'discrete' },
  'gtx 1050 ti': { vram: 4, type: 'discrete' },
  'gtx 1050': { vram: 2, type: 'discrete' },
  // AMD discrete
  'rx 7900 xtx': { vram: 24, type: 'discrete' },
  'rx 7900 xt': { vram: 20, type: 'discrete' },
  'rx 7900 gre': { vram: 16, type: 'discrete' },
  'rx 7800 xt': { vram: 16, type: 'discrete' },
  'rx 7700 xt': { vram: 12, type: 'discrete' },
  'rx 7600 xt': { vram: 16, type: 'discrete' },
  'rx 7600': { vram: 8, type: 'discrete' },
  'rx 6950 xt': { vram: 16, type: 'discrete' },
  'rx 6900 xt': { vram: 16, type: 'discrete' },
  'rx 6800 xt': { vram: 16, type: 'discrete' },
  'rx 6800': { vram: 16, type: 'discrete' },
  'rx 6700 xt': { vram: 12, type: 'discrete' },
  'rx 6600 xt': { vram: 8, type: 'discrete' },
  'rx 6600': { vram: 8, type: 'discrete' },
  // Apple Silicon (unified memory)
  'apple m1': { vram: 8, type: 'apple' },
  'apple m1 pro': { vram: 16, type: 'apple' },
  'apple m1 max': { vram: 32, type: 'apple' },
  'apple m1 ultra': { vram: 64, type: 'apple' },
  'apple m2': { vram: 8, type: 'apple' },
  'apple m2 pro': { vram: 16, type: 'apple' },
  'apple m2 max': { vram: 32, type: 'apple' },
  'apple m2 ultra': { vram: 64, type: 'apple' },
  'apple m3': { vram: 8, type: 'apple' },
  'apple m3 pro': { vram: 18, type: 'apple' },
  'apple m3 max': { vram: 36, type: 'apple' },
  'apple m3 ultra': { vram: 72, type: 'apple' },
  'apple m4': { vram: 16, type: 'apple' },
  'apple m4 pro': { vram: 24, type: 'apple' },
  'apple m4 max': { vram: 36, type: 'apple' },
};

// Integrated GPUs — these share system RAM, no real dedicated VRAM for LLMs
const INTEGRATED_GPU_PATTERNS = [
  'iris xe', 'iris plus', 'iris pro',
  'uhd graphics', 'uhd 7', 'uhd 6', 'uhd 5',
  'hd graphics',
  'intel(r) graphics',
  'radeon graphics',      // AMD APU integrated (Ryzen iGPU)
  'radeon vega',          // Older AMD APU
  'radeon 780m', 'radeon 760m', 'radeon 740m', 'radeon 680m',
  'adreno',               // Mobile (Qualcomm)
  'mali',                 // Mobile (ARM)
];

function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    const match = ua.match(/Chrome\/(\d+)/);
    return `Chrome ${match ? match[1] : ''}`;
  }
  if (ua.includes('Edg')) {
    const match = ua.match(/Edg\/(\d+)/);
    return `Edge ${match ? match[1] : ''}`;
  }
  if (ua.includes('Firefox')) {
    const match = ua.match(/Firefox\/(\d+)/);
    return `Firefox ${match ? match[1] : ''}`;
  }
  if (ua.includes('Safari') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/(\d+)/);
    return `Safari ${match ? match[1] : ''}`;
  }
  if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
  return 'Unknown Browser';
}

function isIntegratedGPU(gpuName) {
  const lower = (gpuName || '').toLowerCase();
  return INTEGRATED_GPU_PATTERNS.some((p) => lower.includes(p));
}

function isAppleSilicon(gpuName) {
  return (gpuName || '').toLowerCase().includes('apple');
}

function lookupGPU(description) {
  const lower = (description || '').toLowerCase();
  const sortedKeys = Object.keys(KNOWN_GPUS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) return { name: key, ...KNOWN_GPUS[key] };
  }
  return null;
}

export async function detectHardware() {
  const profile = {
    gpu: null,
    gpuType: 'unknown',   // 'discrete' | 'integrated' | 'apple' | 'unknown'
    vram: null,            // Dedicated VRAM in GB (null for integrated)
    cpuCores: navigator.hardwareConcurrency || null,
    // navigator.deviceMemory caps at 8 on most browsers — note this limitation
    systemRAM: navigator.deviceMemory || null,
    systemRAMCapped: true, // Flag that browser caps this value
    browser: detectBrowser(),
    webgpuSupported: false,
    isAppleSilicon: false,
    isIntegrated: false,
  };

  if ('gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        profile.webgpuSupported = true;
        let info;
        if (adapter.requestAdapterInfo) {
          info = await adapter.requestAdapterInfo();
        } else if (adapter.info) {
          info = adapter.info;
        } else {
          info = {};
        }

        const rawGpuName = info.description || info.device || '';
        profile.gpu = rawGpuName || 'Unknown GPU';
        profile.isAppleSilicon = isAppleSilicon(rawGpuName);
        profile.isIntegrated = isIntegratedGPU(rawGpuName);

        // Look up in known GPU database
        const knownMatch = lookupGPU(rawGpuName);
        if (knownMatch) {
          profile.gpuType = knownMatch.type;
          profile.vram = knownMatch.vram;
          profile.isAppleSilicon = knownMatch.type === 'apple';
          profile.isIntegrated = false; // Known discrete or apple
        } else if (profile.isIntegrated) {
          profile.gpuType = 'integrated';
          profile.vram = 0; // Integrated GPUs share system RAM
        } else {
          // Unknown GPU — try buffer size heuristic
          profile.gpuType = 'unknown';
          try {
            const device = await adapter.requestDevice();
            const maxBuffer = device.limits.maxBufferSize;
            const bufferGB = maxBuffer / (1024 ** 3);
            if (bufferGB > 16) profile.vram = 24;
            else if (bufferGB > 8) profile.vram = 16;
            else if (bufferGB > 4) profile.vram = 8;
            else if (bufferGB > 2) profile.vram = 4;
            else profile.vram = 2;
            device.destroy();
          } catch {
            profile.vram = null;
          }
        }
      }
    } catch (e) {
      console.warn('WebGPU detection failed:', e);
    }
  }

  return profile;
}
