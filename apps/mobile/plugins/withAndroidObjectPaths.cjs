const { withAppBuildGradle } = require('expo/config-plugins');

// Android's bundled Ninja on Windows rejects paths above MAX_PATH.
// Let CMake hash long object paths; keep this setting across Expo prebuilds.
module.exports = function withAndroidObjectPaths(config) {
  return withAppBuildGradle(config, config => {
    if (config.modResults.language !== 'groovy') throw new Error('Expected Groovy app/build.gradle');
    const marker = '// Friends Table: Windows CMake object paths';
    if (!config.modResults.contents.includes(marker)) {
      config.modResults.contents += `\n${marker}\nandroid {\n    defaultConfig {\n        externalNativeBuild {\n            cmake {\n                arguments "-DCMAKE_OBJECT_PATH_MAX=240"\n            }\n        }\n    }\n}\n`;
    }
    return config;
  });
};
