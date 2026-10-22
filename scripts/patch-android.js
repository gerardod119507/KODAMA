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

// 4. Copiar los iconos oficiales de KODAMA y el splash navy #071743 a res/
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
  
  // Reemplazar splash.png en todas las variantes de drawable
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
  console.log('✓ Iconos nativos y splash screen marino de KODAMA copiados exitosamente a android/res');
}

// 5. Asegurar fondo marino en styles.xml para el arranque nativo
const stylesPath = path.join(destRes, 'values', 'styles.xml');
if (fs.existsSync(stylesPath)) {
  let s = fs.readFileSync(stylesPath, 'utf8');
  // Asegurar que NoActionBarLaunch tenga fondo marino
  s = s.replace(/<color name="colorPrimary">.*?<\/color>/, '<color name="colorPrimary">#071743</color>');
  fs.writeFileSync(stylesPath, s, 'utf8');
}

console.log('=== Parches aplicados con éxito ===');
