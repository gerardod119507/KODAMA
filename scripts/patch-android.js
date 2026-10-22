const fs = require('fs');
const path = require('path');

console.log('=== Iniciando scripts/patch-android.js ===');

// 1. Actualizar android/variables.gradle
const vPath = path.join(process.cwd(), 'android', 'variables.gradle');
if (fs.existsSync(vPath)) {
  let v = fs.readFileSync(vPath, 'utf8');
  v = v.replace(/minSdkVersion\s*=\s*\d+/g, 'minSdkVersion = 24');
  v = v.replace(/compileSdkVersion\s*=\s*\d+/g, 'compileSdkVersion = 35');
  v = v.replace(/targetSdkVersion\s*=\s*\d+/g, 'targetSdkVersion = 35');
  fs.writeFileSync(vPath, v, 'utf8');
  console.log('✓ android/variables.gradle actualizado (minSdk: 24, compileSdk: 35, targetSdk: 35)');
}

// 2. Asegurar android/app/build.gradle
const bPath = path.join(process.cwd(), 'android', 'app', 'build.gradle');
if (fs.existsSync(bPath)) {
  let b = fs.readFileSync(bPath, 'utf8');
  b = b.replace(/minSdkVersion\s+22/g, 'minSdkVersion 24');
  b = b.replace(/compileSdkVersion\s+34/g, 'compileSdkVersion 35');
  b = b.replace(/targetSdkVersion\s+34/g, 'targetSdkVersion 35');
  fs.writeFileSync(bPath, b, 'utf8');
  console.log('✓ android/app/build.gradle verificado');
}

// 3. Inyectar permisos y overrideLibrary en AndroidManifest.xml
const mPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(mPath)) {
  let m = fs.readFileSync(mPath, 'utf8');

  if (!m.includes('xmlns:tools=')) {
    m = m.replace('<manifest', '<manifest xmlns:tools="http://schemas.android.com/tools"');
  }

  if (!m.includes('tools:overrideLibrary')) {
    m = m.replace('<application', '<uses-sdk tools:overrideLibrary="com.google.android.gms.tasks" />\n    <application');
  }

  const perms = [
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
    '    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
    '    <uses-permission android:name="android.permission.WAKE_LOCK" />'
  ].join('\n');

  if (!m.includes('POST_NOTIFICATIONS')) {
    m = m.replace('<application', perms + '\n    <application');
  }

  fs.writeFileSync(mPath, m, 'utf8');
  console.log('✓ AndroidManifest.xml actualizado con permisos y overrideLibrary');
}

// 4. Copiar los iconos oficiales de KODAMA y recursos a res/
const srcRes = path.join(process.cwd(), 'resources', 'android', 'res');
const destRes = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(srcRes) && fs.existsSync(destRes)) {
  copyDirRecursive(srcRes, destRes);

  // Copiar splash transparente a todas las carpetas drawable para eliminar cualquier splash estático
  const splashSrc = path.join(srcRes, 'drawable', 'splash.png');
  if (fs.existsSync(splashSrc)) {
    const folders = fs.readdirSync(destRes);
    for (const folder of folders) {
      if (folder.startsWith('drawable')) {
        const destSplash = path.join(destRes, folder, 'splash.png');
        try {
          fs.copyFileSync(splashSrc, destSplash);
        } catch (e) {}
      }
    }
  }
  console.log('✓ Iconos nativos, silueta de notificación y splash copiados a android/res');
}

// 5. Configurar tema y splash screen nativo en styles.xml y values-v31/styles.xml
// En Android 12+ (API 31+), windowSplashScreenBackground debe coincidir con #071743
// y usar un icono transparente para pasar directo a la animación de KODAMA.
const stylesPath = path.join(destRes, 'values', 'styles.xml');
if (fs.existsSync(stylesPath)) {
  let s = fs.readFileSync(stylesPath, 'utf8');
  s = s.replace(/<item name="android:background">.*?<\/item>/g, '<item name="android:background">#071743</item>');
  if (!s.includes('android:windowBackground')) {
    s = s.replace('</style>', '    <item name="android:windowBackground">#071743</item>\n    </style>');
  }
  fs.writeFileSync(stylesPath, s, 'utf8');
  console.log('✓ values/styles.xml actualizado con fondo #071743');
}

const v31Dir = path.join(destRes, 'values-v31');
if (!fs.existsSync(v31Dir)) fs.mkdirSync(v31Dir, { recursive: true });
const stylesV31Path = path.join(v31Dir, 'styles.xml');
const v31Xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
        <item name="android:background">#071743</item>
        <item name="android:windowBackground">#071743</item>
        <item name="android:windowSplashScreenBackground">#071743</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/splash_transparent</item>
        <item name="android:windowSplashScreenIconBackgroundColor">#071743</item>
        <item name="android:windowSplashScreenAnimationDuration">0</item>
    </style>
</resources>
`;
fs.writeFileSync(stylesV31Path, v31Xml, 'utf8');
console.log('✓ values-v31/styles.xml configurado para Android 12+ (sin robot ni destello blanco)');

console.log('=== Parches aplicados con éxito ===');
