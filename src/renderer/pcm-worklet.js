// Audio worklet that forwards microphone audio in fixed blocks (0.25 s at 16 kHz) for captions.
class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 4000;
    this.buf = new Float32Array(this.size);
    this.fill = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      let i = 0;
      while (i < ch.length) {
        const n = Math.min(ch.length - i, this.size - this.fill);
        this.buf.set(ch.subarray(i, i + n), this.fill);
        this.fill += n;
        i += n;
        if (this.fill === this.size) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(this.size);
          this.fill = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm-tap', PcmTap);
