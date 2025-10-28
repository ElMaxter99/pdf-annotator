if (typeof ArrayBuffer !== 'undefined') {
  const { prototype } = ArrayBuffer;
  const isFiniteNumber = Number.isFinite || ((num) => isFinite(num));

  const toValidLength = (value, fallback) => {
    if (value === undefined) {
      return fallback;
    }

    const numeric = Number(value);
    if (!isFiniteNumber(numeric) || numeric <= 0) {
      return 0;
    }

    return Math.trunc(numeric);
  };

  if (typeof prototype.transferToFixedLength !== 'function') {
    Object.defineProperty(prototype, 'transferToFixedLength', {
      configurable: true,
      writable: true,
      value(newLength) {
        const targetLength = toValidLength(newLength, this.byteLength);
        const targetBuffer = new ArrayBuffer(targetLength);
        const sourceView = new Uint8Array(this);
        const targetView = new Uint8Array(targetBuffer);
        const copyLength = Math.min(targetLength, sourceView.byteLength);
        targetView.set(sourceView.subarray(0, copyLength));
        return targetBuffer;
      },
    });
  }

  if (typeof prototype.transfer !== 'function') {
    Object.defineProperty(prototype, 'transfer', {
      configurable: true,
      writable: true,
      value(newLength) {
        const targetLength = toValidLength(newLength, this.byteLength);
        return prototype.transferToFixedLength.call(this, targetLength);
      },
    });
  }
}

if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    let resolve;
    let reject;

    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return {
      promise,
      resolve,
      reject,
    };
  };
}

import './pdf.worker.min.mjs';
