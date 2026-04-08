// Recommendation engine — classifies models against detected hardware

const OFFICE_OVERHEAD_VRAM = 2.0;
const OFFICE_OVERHEAD_RAM = 5.0;
const DEDICATED_OVERHEAD_VRAM = 0.5;
const DEDICATED_OVERHEAD_RAM = 2.0;
const APPLE_SILICON_MEMORY_FACTOR = 0.7;

const officeTalk = {
  smooth: [
    "Run this while Zoom is screaming and Chrome has 20 tabs open. No sweat.",
    "Keep Slack, Spotify, and your IDE running. This model barely notices.",
    "Your daily workflow won't skip a beat. This runs in the background quietly.",
  ],
  balanced: [
    "Close a few Chrome tabs and maybe pause that 4K YouTube video first.",
    "Runs alongside light work, but don't expect buttery multitasking.",
    "Your fans might get louder. Close heavy apps for a smoother experience.",
  ],
  heavy: [
    "This needs your whole machine. Close everything. Even Slack. Especially Slack.",
    "Your laptop will sound like a jet engine. Clear the runway first.",
    "Technically possible but your other apps will freeze. Proceed with patience.",
  ],
};

const dedicatedTalk = {
  smooth: [
    "Plenty of headroom. Fast, responsive, smooth experience.",
    "This model was made for your hardware. Enjoy.",
  ],
  balanced: [
    "Will use most of your available memory. Expect moderate speeds.",
    "It fits, but it's a tight squeeze. Don't expect instant responses.",
  ],
  heavy: [
    "Too large for your hardware. Will swap to disk and run at a crawl.",
    "Your machine can't load this model. Consider a smaller quantization.",
  ],
};

// Integrated GPU specific talk — models always run on CPU via RAM
const integratedTalk = {
  smooth: [
    "Runs on your CPU using system RAM. No GPU needed — and it'll still be snappy.",
    "Your integrated GPU sits this one out. CPU handles it fine.",
  ],
  balanced: [
    "CPU-only inference. Slower than a GPU, but it works. Be patient with long responses.",
    "Your CPU can load this, but it'll chew through your RAM. Close some apps.",
  ],
  heavy: [
    "Way too big for your RAM. This model needs a discrete GPU or more memory.",
    "Not happening with integrated graphics and your current RAM. Need a GPU upgrade.",
  ],
};

function pickRealTalk(tier, workloadMode, isIntegrated) {
  if (isIntegrated) {
    const pool = integratedTalk[tier];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = workloadMode === 'office' ? officeTalk[tier] : dedicatedTalk[tier];
  return pool[Math.floor(Math.random() * pool.length)];
}

const tierEmoji = { smooth: '✅', balanced: '⚠️', heavy: '❌' };

export function classifyModel(model, hardware, workloadMode) {
  const ramOverhead = workloadMode === 'office' ? OFFICE_OVERHEAD_RAM : DEDICATED_OVERHEAD_RAM;
  const vramOverhead = workloadMode === 'office' ? OFFICE_OVERHEAD_VRAM : DEDICATED_OVERHEAD_VRAM;

  const totalModelNeed = model.fileSizeGB + model.kvCacheGB;
  const availableRAM = (hardware.systemRAM || 0) - ramOverhead;
  const isIntegrated = hardware.isIntegrated || hardware.gpuType === 'integrated';

  // For integrated GPUs: everything runs on CPU via system RAM
  // There is no useful VRAM — classify purely by RAM fit
  if (isIntegrated) {
    if (availableRAM >= totalModelNeed * 1.2) {
      // Comfortable fit in RAM with headroom
      const talk = pickRealTalk('smooth', workloadMode, true);
      return {
        tier: 'smooth',
        label: 'SMOOTH',
        emoji: '🟢',
        color: '#00FF88',
        speed: model.expectedTPS.mid, // CPU inference = mid speed at best
        realTalk: `${tierEmoji.smooth} ${talk}`,
        inferenceMode: 'CPU',
      };
    } else if (availableRAM >= totalModelNeed) {
      const talk = pickRealTalk('balanced', workloadMode, true);
      return {
        tier: 'balanced',
        label: 'TIGHT FIT',
        emoji: '🟡',
        color: '#FFB800',
        speed: model.expectedTPS.low,
        realTalk: `${tierEmoji.balanced} ${talk}`,
        inferenceMode: 'CPU',
      };
    } else {
      const talk = pickRealTalk('heavy', workloadMode, true);
      return {
        tier: 'heavy',
        label: 'TOO HEAVY',
        emoji: '🔴',
        color: '#FF3366',
        speed: 0,
        realTalk: `${tierEmoji.heavy} ${talk}`,
        inferenceMode: 'CPU',
      };
    }
  }

  // Apple Silicon: unified memory — use 70% as effective VRAM
  let effectiveVRAM = (hardware.vram || 0) - vramOverhead;
  if (hardware.isAppleSilicon && hardware.systemRAM) {
    effectiveVRAM = hardware.systemRAM * APPLE_SILICON_MEMORY_FACTOR - vramOverhead;
  }

  // Discrete GPU path
  if (effectiveVRAM >= totalModelNeed) {
    const talk = pickRealTalk('smooth', workloadMode, false);
    return {
      tier: 'smooth',
      label: 'SMOOTH',
      emoji: '🟢',
      color: '#00FF88',
      speed: model.expectedTPS.high,
      realTalk: `${tierEmoji.smooth} ${talk}`,
      inferenceMode: 'GPU',
    };
  } else if (availableRAM >= totalModelNeed) {
    const talk = pickRealTalk('balanced', workloadMode, false);
    return {
      tier: 'balanced',
      label: 'BALANCED',
      emoji: '🟡',
      color: '#FFB800',
      speed: model.expectedTPS.mid,
      realTalk: `${tierEmoji.balanced} ${talk}`,
      inferenceMode: 'CPU',
    };
  } else {
    const talk = pickRealTalk('heavy', workloadMode, false);
    return {
      tier: 'heavy',
      label: 'TOO HEAVY',
      emoji: '🔴',
      color: '#FF3366',
      speed: model.expectedTPS.low,
      realTalk: `${tierEmoji.heavy} ${talk}`,
      inferenceMode: 'N/A',
    };
  }
}

export function classifyAllModels(models, hardware, workloadMode) {
  const classified = models.map((model) => ({
    ...model,
    classification: classifyModel(model, hardware, workloadMode),
  }));

  const tierOrder = { smooth: 0, balanced: 1, heavy: 2 };
  classified.sort((a, b) => {
    const tierDiff = tierOrder[a.classification.tier] - tierOrder[b.classification.tier];
    if (tierDiff !== 0) return tierDiff;
    return (b.fileSizeGB + b.kvCacheGB) - (a.fileSizeGB + a.kvCacheGB);
  });

  let topPickSet = false;
  for (const m of classified) {
    m.isTopPick = false;
    if (!topPickSet && (m.classification.tier === 'smooth' || m.classification.tier === 'balanced')) {
      m.isTopPick = true;
      topPickSet = true;
    }
  }

  return classified;
}

export function findBottleneck(hardware) {
  if (hardware.isIntegrated || hardware.gpuType === 'integrated') {
    return `Integrated GPU — models run on CPU using System RAM (${hardware.systemRAM || '?'} GB)`;
  }
  if (!hardware.vram && !hardware.systemRAM) return 'Unknown';
  if ((hardware.vram || 0) <= (hardware.systemRAM || 0)) {
    return `GPU VRAM (${hardware.vram} GB)`;
  }
  return `System RAM (${hardware.systemRAM} GB)`;
}

export function getUpgradeTiers(hardware) {
  const isIntegrated = hardware.isIntegrated || hardware.gpuType === 'integrated';
  const effectiveMemory = isIntegrated ? (hardware.systemRAM || 0) : (hardware.vram || 0);
  const label = isIntegrated ? 'RAM' : 'VRAM';
  const tiers = [];

  const upgradeLevels = [
    { mem: 8, models: ['Llama 3.2 3B', 'Gemma 2 2B', 'Phi-3 Mini'] },
    { mem: 16, models: ['Llama 3.1 8B', 'Mistral 7B', 'Qwen 2.5 7B'] },
    { mem: 24, models: ['Phi-3 Medium', 'Qwen 2.5 14B', 'DeepSeek R1 14B'] },
    { mem: 32, models: ['Gemma 2 27B', 'Qwen 2.5 32B', 'Code Llama 34B'] },
    { mem: 64, models: ['Llama 3.1 70B', 'Mixtral 8x7B'] },
  ];

  const currentModels = upgradeLevels.find((t) => effectiveMemory <= t.mem) || upgradeLevels[0];
  tiers.push({ mem: effectiveMemory, label: `Current (${effectiveMemory}GB ${label})`, models: currentModels.models, isCurrent: true });

  for (const tier of upgradeLevels) {
    if (tier.mem > effectiveMemory) {
      tiers.push({ mem: tier.mem, label: `${tier.mem}GB ${label}`, models: tier.models, isCurrent: false });
    }
    if (tiers.length >= 4) break;
  }

  return tiers;
}

export function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  if (platform.includes('mac') || ua.includes('macintosh')) return 'mac';
  if (platform.includes('linux') || ua.includes('linux')) return 'linux';
  return 'windows';
}
