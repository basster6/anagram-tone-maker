// Audio through the pedal from the browser: play into the reamp input, record
// the chain output. The browser port of measure.py's Rig.
//
// Browsers open the Anagram as a stereo device. Output 9 (the reamp input) is
// reached by telling macOS to use channel 9 for stereo left (Audio MIDI Setup);
// a browser that exposes all nine outputs uses channel 9 directly. The dry
// instrument input (input 3) is out of reach, so only the chain output is
// recorded.
(function (root) {
  const AT = (root.AT = root.AT || {});
  const FS = 48000;

  // The recorder: jobs record [from, to) in context frames, the meter reports levels.
  // The same code runs in an AudioWorklet, or on the main thread where a page
  // opened from file:// may not load a worklet.
  const CORE = `
  class RecCore {
    constructor(post) { this.post = post; this.jobs = []; this.meterEvery = 0; this.peak = 0; this.sum = 0; this.count = 0; }
    message(m) {
      if (m.cmd === "arm") this.jobs.push({ id: m.id, from: m.from, to: m.to, buf: new Float32Array(m.to - m.from) });
      if (m.cmd === "meter") this.meterEvery = m.every || 0;
    }
    process(a, b, f0) {
      const n = a.length;
      for (let i = this.jobs.length - 1; i >= 0; i--) {
        const j = this.jobs[i];
        const lo = Math.max(f0, j.from), hi = Math.min(f0 + n, j.to);
        for (let f = lo; f < hi; f++) j.buf[f - j.from] = (a[f - f0] + b[f - f0]) * 0.5;
        if (f0 + n >= j.to) { this.post({ id: j.id, buf: j.buf }, [j.buf.buffer]); this.jobs.splice(i, 1); }
      }
      if (this.meterEvery) {
        for (let i = 0; i < n; i++) { const v = (a[i] + b[i]) * 0.5, x = Math.abs(v); if (x > this.peak) this.peak = x; this.sum += v * v; }
        this.count += n;
        if (this.count >= this.meterEvery) {
          this.post({ meter: { peak: this.peak, rms: Math.sqrt(this.sum / this.count) } });
          this.peak = 0; this.sum = 0; this.count = 0;
        }
      }
    }
  }`;
  const WORKLET = CORE + `
  class Rec extends AudioWorkletProcessor {
    constructor() { super(); this.core = new RecCore((m, t) => this.port.postMessage(m, t || [])); this.port.onmessage = (e) => this.core.message(e.data); }
    process(inputs) {
      const inp = inputs[0];
      if (inp && inp.length) this.core.process(inp[0], inp[1] || inp[0], currentFrame);
      return true;
    }
  }
  registerProcessor("at-rec", Rec);`;
  const RecCore = new Function(CORE + "; return RecCore;")();

  const dbOf = x => 20 * Math.log10(Math.max(x, 1e-12));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  class Rig {
    constructor() {
      this.ctx = null; this.latency = null; this.outChannel = null; this.jobs = new Map(); this.nextJob = 1; this.onmeter = null;
    }

    static async devices() {
      try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); }
      catch (e) {
        const err = new Error("Microphone access was not allowed, so the browser hides the audio devices.");
        err.code = "no-permission"; throw err;
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      const pick = kind => list.filter(d => d.kind === kind && /anagram/i.test(d.label)).sort((a, b) => (a.deviceId === "default") - (b.deviceId === "default"))[0];
      return { input: pick("audioinput"), output: pick("audiooutput") };
    }

    async open() {
      if (this.ctx) return this;
      const { input, output } = await Rig.devices();
      if (!input || !output) { const err = new Error("No Anagram audio device. Plug the pedal in over USB."); err.code = "no-device"; throw err; }
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: { exact: input.deviceId }, channelCount: { ideal: 2 }, sampleRate: FS,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext({ sampleRate: FS, latencyHint: "interactive" });
      if (ctx.sampleRate !== FS) throw new Error(`The browser opened audio at ${ctx.sampleRate} Hz; the pedal runs at 48 kHz.`);
      if (!ctx.setSinkId) throw new Error("This browser cannot choose an audio output. Use Chrome or Edge.");
      await ctx.setSinkId(output.deviceId);
      const src = ctx.createMediaStreamSource(this.stream);
      const onMessage = m => {
        if (m.meter) { this.onmeter && this.onmeter({ peakDb: +dbOf(m.meter.peak).toFixed(1), rmsDb: +dbOf(m.meter.rms).toFixed(1) }); return; }
        const done = this.jobs.get(m.id); if (done) { this.jobs.delete(m.id); done(m.buf); }
      };
      try {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(url);
        this.rec = new AudioWorkletNode(ctx, "at-rec", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: "explicit" });
        this.rec.port.onmessage = e => onMessage(e.data);
        this.send = m => this.rec.port.postMessage(m);
      } catch {
        // file:// pages cannot load a worklet; record on the main thread instead
        const core = new RecCore(onMessage);
        this.rec = ctx.createScriptProcessor(1024, 2, 1);
        this.rec.onaudioprocess = e => {
          const ib = e.inputBuffer, a = ib.getChannelData(0), b = ib.numberOfChannels > 1 ? ib.getChannelData(1) : a;
          core.process(a, b, Math.round(e.playbackTime * FS) - ib.length);
        };
        this.send = m => core.message(m);
      }
      const mute = ctx.createGain(); mute.gain.value = 0;
      src.connect(this.rec); this.rec.connect(mute); mute.connect(ctx.destination);
      const channels = ctx.destination.maxChannelCount >= 9 ? 9 : 2;
      ctx.destination.channelCount = channels; ctx.destination.channelCountMode = "explicit"; ctx.destination.channelInterpretation = "discrete";
      this.merge = ctx.createChannelMerger(channels); this.merge.connect(ctx.destination);
      this.channels = channels;
      this.ctx = ctx;
      await ctx.resume();
      return this;
    }

    async close() {
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.ctx) await this.ctx.close();
      this.ctx = null; this.latency = null; this.outChannel = null;
    }

    meter(on) { this.send && this.send({ cmd: "meter", every: on ? 2400 : 0 }); }

    // Record `frames` frames starting at context frame `from`.
    _record(from, frames) {
      const id = this.nextJob++;
      return new Promise(resolve => { this.jobs.set(id, resolve); this.send({ cmd: "arm", id, from, to: from + frames }); });
    }

    async _play(signal, tailSeconds, channel) {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, Math.max(1, signal.length), FS);
      buf.copyToChannel(signal instanceof Float32Array ? signal : Float32Array.from(signal), 0);
      const node = ctx.createBufferSource(); node.buffer = buf;
      node.connect(this.merge, 0, channel);
      const startFrame = Math.round((ctx.currentTime + 0.2) * FS);
      const recording = this._record(startFrame, signal.length + Math.round(tailSeconds * FS));
      node.start(startFrame / FS);
      const wet = await recording;
      node.disconnect();
      return wet;
    }

    // Which output channel reaches the chain: channel 9 when the browser has
    // nine, otherwise whichever stereo side macOS was told to send to output 9.
    async findReampChannel() {
      await this.open();
      const candidates = this.channels === 9 ? [8] : [0, 1];
      const probe = AT.dsp.tone(440, 0.4, -24);
      for (const ch of candidates) {
        const wet = await this._play(probe, 0.6, ch);
        if (dbOf(AT.dsp.rms(wet)) > -60) { this.outChannel = ch; return ch; }
      }
      this.outChannel = null;
      return null;
    }

    async ready() {
      await this.open();
      if (this.outChannel == null && (await this.findReampChannel()) == null) {
        const err = new Error("Nothing came back from the reamp input.");
        err.code = "no-reamp"; throw err;
      }
    }

    async calibrate() {
      const played = AT.dsp.sweep(100, 10000, 0.5, -24);
      const wet = await this._play(played, 0.6, this.outChannel);
      this.latency = AT.dsp.latencySamples(played, wet);
      return this.latency;
    }

    // Play a mono signal through the chain. With align, sample 0 of the result
    // is where sample 0 of the signal came back.
    async run(signal, tail = 0.3, align = true) {
      await this.ready();
      let shift = 0;
      if (align) { shift = this.latency != null ? this.latency : await this.calibrate(); tail += shift / FS; }
      const wet = await this._play(signal, tail, this.outChannel);
      return shift ? wet.subarray(shift) : wet;
    }

    // The instrument feeds the same chain, so a note played during a measurement lands in it.
    async waitForQuiet({ thresholdDbfs = -45, hold = 1.0, timeout = 90, notify } = {}) {
      await this.open();
      const started = Date.now();
      let quietSince = null, warned = false;
      while (true) {
        const level = dbOf(Math.max(...(await this._record(Math.round(this.ctx.currentTime * FS), FS / 4)).map(Math.abs)));
        const now = Date.now();
        if (level <= thresholdDbfs) { quietSince = quietSince || now; if (now - quietSince >= hold * 1000) return; }
        else { quietSince = null; if (!warned && notify) { notify("waiting-quiet"); warned = true; } }
        if (now - started > timeout * 1000) throw new Error("The pedal's output never went quiet. Mute the instrument and try again.");
      }
    }

    // ---------- measurements (measure.py's measure_*) ----------
    async measureAll({ quick = false, notify, signal } = {}) {
      const D = AT.dsp, t0 = Date.now();
      const check = () => { if (signal && signal.aborted) throw new Error("cancelled"); };
      await this.ready();
      await this.waitForQuiet({ notify });
      const step = (s) => notify && notify(s);
      step("noise");
      const report = { noise: D.noise(await this.run(new Float32Array(FS), 0, false)), response: [] };
      for (const level of quick ? D.SWEEP_LEVELS_DBFS.slice(0, 1) : D.SWEEP_LEVELS_DBFS) {
        check(); step("response");
        const played = D.sweep(20, 20000, 6.0, level);
        report.response.push(D.analyzeResponse(played, await this.run(played, 3.0, false), level));
      }
      if (!quick) {
        report.distortion = [];
        for (const level of D.TONE_LEVELS_DBFS) for (const freq of D.DIST_FREQS_HZ) {
          check(); step("distortion");
          report.distortion.push(D.distortionPoint(await this.run(D.tone(freq, 0.9, level), 0.05), freq, level));
        }
        const curve = [];
        for (const level of D.LADDER_DBFS) {
          check(); step("dynamics");
          curve.push(D.ladderPoint(await this.run(D.tone(110, 0.8, level), 0.02), level));
        }
        report.dynamics = D.analyzeStep(await this.run(D.stepSignal(110), 0.05), 110, curve);
      }
      report.seconds = +((Date.now() - t0) / 1000).toFixed(1);
      report.via = "browser";
      return report;
    }

    // A recorded dry take through whatever the pedal is playing now.
    async reamp(dry, { notify } = {}) {
      await this.ready();
      await this.waitForQuiet({ notify });
      const wet = await this.run(dry, 3.0, false);
      return AT.dsp.alignTake(dry, wet);
    }

    // The chain output while the player plays.
    async capture(seconds) {
      await this.open();
      this.meter(true);
      try { return await this._record(Math.round((this.ctx.currentTime + 0.05) * FS), Math.round(seconds * FS)); }
      finally { this.meter(false); }
    }
  }

  AT.Rig = Rig;
  AT.rigSleep = sleep;
})(typeof globalThis !== "undefined" ? globalThis : window);
