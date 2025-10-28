/* Polyfill Promise.withResolvers for browsers that lack it. */

type Resolver<T> = (value: T | PromiseLike<T>) => void;
type Rejecter = (reason?: unknown) => void;

type PromiseWithResolversResult<T> = {
  promise: Promise<T>;
  resolve: Resolver<T>;
  reject: Rejecter;
};

type PromiseWithResolversFn = <T>() => PromiseWithResolversResult<T>;

const promiseConstructor = Promise as PromiseConstructor & {
  withResolvers?: PromiseWithResolversFn;
};

if (typeof promiseConstructor.withResolvers !== 'function') {
  promiseConstructor.withResolvers = function <T>() {
    let resolve!: Resolver<T>;
    let reject!: Rejecter;

    const promise = new Promise<T>((res, rej) => {
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
