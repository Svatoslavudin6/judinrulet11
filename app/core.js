(() => {
  const STORAGE_KEY = 'echo_ai_lab_state_v1';
  const CHANNEL_NAME = 'echo_ai_lab_channel';
  const defaults = {
    model: {
      name: 'UniversalToyNet',
      inputSize: 64,
      hiddenSize: 48,
      outputSize: 32,
      learningRate: 0.01,
      mode: 'text',
      maxTokens: 64,
    },
    stats: { steps: 0, lastLoss: 0, samples: 0 },
    memory: {},
    outputs: { text: '', imagePrompt: '', audioPattern: [], videoPrompt: '' }
  };

  function loadState() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
    catch { return structuredClone(defaults); }
  }
  function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  let state = loadState();

  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  function publish(type, payload) {
    if (bc) bc.postMessage({ type, payload, at: Date.now() });
  }

  function tokenize(text, maxLen = state.model.maxTokens) {
    const clean = (text || '').toLowerCase().trim();
    const tokens = clean.split(/\s+/).filter(Boolean).slice(0, maxLen);
    return tokens.map(t => t.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 10007);
  }

  function updateModel(cfg) {
    state.model = { ...state.model, ...cfg };
    saveState(state); publish('model:update', state.model);
    return state.model;
  }

  function trainSample(sample) {
    const tokenIds = tokenize(sample.text || '');
    const strength = tokenIds.reduce((a, b) => a + b, 0) / Math.max(1, tokenIds.length);
    const key = (sample.text || '').toLowerCase().trim();
    if (!state.memory[key]) state.memory[key] = { count: 0, strength: 0, modalities: {} };
    state.memory[key].count += 1;
    state.memory[key].strength += strength * state.model.learningRate;
    state.memory[key].modalities = { ...state.memory[key].modalities, ...(sample.modalities || {}) };

    const loss = 1 / (1 + state.memory[key].count);
    state.stats.steps += 1;
    state.stats.samples += 1;
    state.stats.lastLoss = Number(loss.toFixed(4));

    state.outputs.text = `Эхо: ${sample.text || ''}`;
    state.outputs.imagePrompt = `img://${sample.text || 'empty'}|style=${sample.modalities?.image || 'default'}`;
    state.outputs.videoPrompt = `vid://${sample.text || 'empty'}|fps=12|len=3s`;
    state.outputs.audioPattern = tokenIds.slice(0, 32).map(v => (v % 100) / 100);

    saveState(state);
    publish('train:done', { stats: state.stats, key, item: state.memory[key], outputs: state.outputs });
    return { stats: state.stats, key, item: state.memory[key], outputs: state.outputs };
  }

  function infer(payload) {
    const key = (payload.text || '').toLowerCase().trim();
    const mem = state.memory[key];
    const tokens = tokenize(payload.text || '');
    const confidence = mem ? Math.min(0.99, 0.45 + mem.count * 0.03) : 0.15;
    const result = {
      input: payload,
      tokens,
      confidence,
      text: mem ? `Я помню: ${payload.text}` : `Я еще учусь: ${payload.text}`,
      image: mem?.modalities?.image ? `style:${mem.modalities.image}` : 'style:base',
      audio: tokens.slice(0, 24).map(x => (x % 80) / 80),
      video: mem?.modalities?.video ? `preset:${mem.modalities.video}` : 'preset:loop'
    };
    publish('infer:done', result);
    return result;
  }

  window.EchoCore = { loadState: () => state, updateModel, trainSample, infer, tokenize, saveState: () => saveState(state), channel: bc };
})();
