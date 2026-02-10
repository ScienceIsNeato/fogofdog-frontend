# Android Development Environment Setup (February 2026)

## Clean Up Old Tools

### Step 1: Remove Old Android Studio

```bash
# Close Android Studio if running
# Remove the app
rm -rf "/Applications/Android Studio.app"

# Remove old preferences and caches
rm -rf ~/Library/Application\ Support/Google/AndroidStudio*
rm -rf ~/Library/Preferences/com.google.android.*
rm -rf ~/Library/Caches/Google/AndroidStudio*
rm -rf ~/.android/cache
```

### Step 2: Remove Old Android SDK (Optional - can keep and upgrade)

```bash
# If you want a completely fresh SDK:
rm -rf ~/Library/Android/sdk

# Keep AVDs if you want (they're in ~/.android/avd)
```

### Step 3: Remove Old/Incompatible Java Versions

```bash
# List current Java versions
/usr/libexec/java_home -V

# Remove Oracle JDK 24 (too new for Gradle)
sudo rm -rf /Library/Java/JavaVirtualMachines/jdk-24.jdk

# Remove Oracle JDK 14 (too old, x86_64)
sudo rm -rf /Library/Java/JavaVirtualMachines/jdk-14.jdk
```

---

## Install Fresh Tools

### Step 1: Install Java 17 LTS (Required for Android/Gradle)

```bash
# Install OpenJDK 17 via Homebrew (recommended for macOS)
brew install openjdk@17

# Create symlink for system Java wrappers
sudo ln -sfn $(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk \
    /Library/Java/JavaVirtualMachines/openjdk-17.jdk

# Add to PATH in ~/.zshrc (add before ANDROID_HOME)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"
```

### Step 2: Download & Install Android Studio Otter 3

```bash
# Download from: https://developer.android.com/studio
# Direct link for Apple Silicon Mac:
# https://redirector.gvt1.com/edgedl/android/studio/install/2025.2.3.9/android-studio-2025.2.3.9-mac_arm.dmg

# Or use Homebrew Cask:
brew install --cask android-studio
```

### Step 3: Configure Android Studio (First Launch)

1. Open Android Studio
2. Choose "Standard" installation
3. Accept licenses
4. Let it download:
   - Android SDK (API 35 - Android 15)
   - Build Tools
   - Platform Tools
   - Android Emulator
   - Sources for Android

### Step 4: Set Environment Variables

Add to `~/.zshrc`:

```bash
# Java 17 (required for Android/Gradle)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"

# Android SDK
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
```

### Step 5: Create Emulator AVD

```bash
# After Android Studio setup, via command line:
# List available system images
sdkmanager --list | grep system-images | grep arm64

# Install ARM64 system image for API 35
sdkmanager "system-images;android-35;google_apis;arm64-v8a"

# Create AVD
avdmanager create avd -n Pixel_8_API_35 -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_8

# Or create via Android Studio: Tools > Device Manager > Create Device
```

### Step 6: Install Maestro

```bash
# Maestro for E2E testing
curl -fsSL "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version
```

---

## Verify Installation

```bash
# Java version (should be 17.x)
java -version

# Android SDK tools
adb version
emulator -version

# List emulators
emulator -list-avds

# Test Expo Android build
cd /path/to/fogofdog-frontend
npx expo run:android
```

---

## Recommended Versions (February 2026)

| Tool           | Version              | Notes                   |
| -------------- | -------------------- | ----------------------- |
| Android Studio | 2025.2.3.9 (Otter 3) | Latest stable           |
| Java JDK       | 17.0.x LTS           | Required for Gradle 8.x |
| Android SDK    | API 35 (Android 15)  | Latest stable           |
| Build Tools    | 35.0.0               | Match API level         |
| Gradle         | 8.10.2               | Bundled with project    |
| Maestro        | Latest               | E2E testing             |

---

## Troubleshooting

### "Unsupported class file major version 68"

- You're using Java 24, need Java 17
- Run: `java -version` should show 17.x

### Emulator won't start

- Check virtualization: Android Studio > SDK Manager > SDK Tools > Intel HAXM or HVF
- For Apple Silicon, use ARM64 system images

### Gradle build fails

- Clear Gradle cache: `rm -rf ~/.gradle/caches`
- Invalidate Android Studio caches: File > Invalidate Caches

### Metro bundler connection issues

- Kill existing Metro: `lsof -ti :8081 | xargs kill -9`
- Start fresh: `npx expo start --clear`
