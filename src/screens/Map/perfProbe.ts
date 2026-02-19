/**
 * ─── PERF PROBE (temporary — remove after profiling) ───────────────────────
 * Captures timing at each stage of the region-change pipeline so we can see
 * WHERE the lag actually lives instead of guessing.
 *
 * Usage: import { PerfProbe } from './perfProbe';
 *        PerfProbe.mark('stageName');
 */
export const PerfProbe = {
  samples: [] as { stage: string; ts: number; frame: number }[],
  frame: 0,
  lastReport: 0,
  mark(stage: string) {
    const now = performance.now();
    this.samples.push({ stage, ts: now, frame: this.frame });
    // Summarise every 2 s
    if (now - this.lastReport > 2000 && this.samples.length > 10) {
      this.report();
      this.lastReport = now;
    }
  },
  nextFrame() {
    this.frame++;
  },
  report() {
    // Group by frame, compute per-frame durations between stages
    const frames = new Map<number, { stage: string; ts: number }[]>();
    for (const s of this.samples) {
      if (!frames.has(s.frame)) frames.set(s.frame, []);
      frames.get(s.frame)!.push({ stage: s.stage, ts: s.ts });
    }
    const deltas: Record<string, number[]> = {};
    for (const [, stages] of frames) {
      stages.sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < stages.length; i++) {
        const prev = stages[i - 1]!;
        const curr = stages[i]!;
        const key = `${prev.stage}→${curr.stage}`;
        if (!deltas[key]) deltas[key] = [];
        deltas[key]!.push(curr.ts - prev.ts);
      }
      // Total frame time
      if (stages.length >= 2) {
        const first = stages[0]!;
        const last = stages[stages.length - 1]!;
        const key = `TOTAL(${first.stage}→${last.stage})`;
        if (!deltas[key]) deltas[key] = [];
        deltas[key]!.push(last.ts - first.ts);
      }
    }
    const lines = ['\n📊 PERF PROBE REPORT (last 2s):'];
    for (const [key, vals] of Object.entries(deltas)) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const max = Math.max(...vals);
      const sorted = [...vals].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? max;
      lines.push(
        `  ${key}: avg=${avg.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  max=${max.toFixed(1)}ms  n=${vals.length}`
      );
    }
    lines.push(`  frames=${frames.size}  samples=${this.samples.length}`);
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    this.samples = [];
  },
};
