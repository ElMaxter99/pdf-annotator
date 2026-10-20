// Karma config used by `npm run test:ci` (headless Chrome without sandbox, for CI containers).
module.exports = function (config) {
  config.set({
    frameworks: ['jasmine'],
    reporters: ['progress'],
    browsers: ['ChromeHeadlessCI'],
    customLaunchers: {
      ChromeHeadlessCI: { base: 'ChromeHeadless', flags: ['--no-sandbox'] },
    },
  });
};
