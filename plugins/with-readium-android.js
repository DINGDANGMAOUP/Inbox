const { withAppBuildGradle, withGradleProperties, withProjectBuildGradle } = require("@expo/config-plugins");

const DESUGAR_DEP = 'coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")';
const KOTLIN_VERSION = "2.3.20";
const READIUM_RESOLUTION_STRATEGY = `configurations.configureEach {
    resolutionStrategy {
        force "org.jetbrains.kotlinx:kotlinx-datetime:0.7.1"
        force "org.jetbrains.kotlinx:kotlinx-datetime-jvm:0.7.1"
    }
}`;
const READIUM_RUNTIME_DEPS = [
  'implementation("androidx.annotation:annotation:1.10.0")',
  'implementation("com.jakewharton.timber:timber:5.0.1")',
  `implementation("org.jetbrains.kotlin:kotlin-reflect:${KOTLIN_VERSION}")`,
  'implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")',
  'implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.7.1")',
  'implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.10.0")',
  'implementation("org.jsoup:jsoup:1.22.2")',
];

function setGradleProperty(properties, key, value) {
  const existing = properties.find((property) => property.type === "property" && property.key === key);
  if (existing) {
    existing.value = value;
  } else {
    properties.push({ type: "property", key, value });
  }
}

function setKotlinGradlePluginVersion(contents) {
  return contents.replace(
    /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]+)?['"]\)/,
    `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}')`,
  );
}

function configureReadiumAppBuild(contents) {
  let next = contents
    .replaceAll("androidx.annotation:annotation:1.9.1", "androidx.annotation:annotation:1.10.0")
    .replaceAll("org.jetbrains.kotlin:kotlin-reflect:2.1.20", `org.jetbrains.kotlin:kotlin-reflect:${KOTLIN_VERSION}`)
    .replaceAll("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1", "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    .replaceAll("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1", "org.jetbrains.kotlinx:kotlinx-datetime:0.7.1")
    .replaceAll("org.jetbrains.kotlinx:kotlinx-datetime-jvm:0.6.1", "org.jetbrains.kotlinx:kotlinx-datetime-jvm:0.7.1")
    .replaceAll("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3", "org.jetbrains.kotlinx:kotlinx-serialization-json:1.10.0")
    .replaceAll("org.jsoup:jsoup:1.18.1", "org.jsoup:jsoup:1.22.2");

  if (!next.includes("org.jetbrains.kotlinx:kotlinx-datetime-jvm:0.7.1")) {
    next = next.replace(
      /\nandroid\s*\{\n/,
      (match) => `\n${READIUM_RESOLUTION_STRATEGY}\n${match}`,
    );
  }

  if (!next.includes("coreLibraryDesugaringEnabled true")) {
    if (/compileOptions\s*\{/.test(next)) {
      next = next.replace(
        /compileOptions\s*\{/,
        (match) => `${match}\n        coreLibraryDesugaringEnabled true`,
      );
    } else {
      const marker = "    compileSdk rootProject.ext.compileSdkVersion\n";
      if (!next.includes(marker)) {
        throw new Error("with-readium-android: cannot find app compileSdk block");
      }
      next = next.replace(
        marker,
        `${marker}\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }\n`,
      );
    }
  }

  if (!next.includes("com.android.tools:desugar_jdk_libs")) {
    next = next.replace(
      /dependencies\s*\{\n/,
      (match) => `${match}    ${DESUGAR_DEP}\n`,
    );
  }

  const missingDeps = READIUM_RUNTIME_DEPS.filter((dependency) => !next.includes(dependency));
  if (missingDeps.length) {
    next = next.replace(
      /dependencies\s*\{\n/,
      (match) => `${match}${missingDeps.map((dependency) => `    ${dependency}\n`).join("")}`,
    );
  }

  return next;
}

module.exports = function withReadiumAndroid(config) {
  config = withGradleProperties(config, (config) => {
    setGradleProperty(config.modResults, "android.kotlinVersion", KOTLIN_VERSION);
    return config;
  });

  config = withProjectBuildGradle(config, (config) => {
    config.modResults.contents = setKotlinGradlePluginVersion(config.modResults.contents);
    return config;
  });

  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = configureReadiumAppBuild(config.modResults.contents);
    return config;
  });
};
