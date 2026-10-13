#!/usr/bin/env bash
set -euo pipefail
# Run inside the extracted datebook-starter folder.
# Requires Node.js and npm. Network access is required.
ROOT="$(pwd)"
npx create-expo-app@latest datebook --template blank-typescript
cp "$ROOT/App.tsx" "$ROOT/datebook/App.tsx"
cp -R "$ROOT/src" "$ROOT/datebook/src"
cp "$ROOT/.env.example" "$ROOT/datebook/.env.example"
cd datebook
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill expo-clipboard
printf '\nDone. Next: copy .env.example to .env, enter your Supabase project values, and run npx expo start.\n'
