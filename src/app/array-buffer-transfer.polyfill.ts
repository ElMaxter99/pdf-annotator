export {};

declare global {
  interface ArrayBuffer {
    transfer?(newLength?: number): ArrayBuffer;
    transferToFixedLength?(newLength?: number): ArrayBuffer;
  }
}

const arrayBufferConstructor = typeof ArrayBuffer !== 'undefined' ? ArrayBuffer : null;

if (arrayBufferConstructor) {
  const { prototype } = arrayBufferConstructor;

  const isFiniteNumber = Number.isFinite ?? ((num: number) => isFinite(num));

  const toValidLength = (value: number | undefined, fallback: number) => {
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
      value(this: ArrayBuffer, newLength?: number) {
        const targetLength = toValidLength(newLength, this.byteLength);
        const targetBuffer = new arrayBufferConstructor(targetLength);
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
      value(this: ArrayBuffer, newLength?: number) {
        const targetLength = toValidLength(newLength, this.byteLength);
        const transferToFixedLength = prototype.transferToFixedLength as (
          this: ArrayBuffer,
          newLength?: number,
        ) => ArrayBuffer;
        return transferToFixedLength.call(this, targetLength);
      },
    });
  }
}

